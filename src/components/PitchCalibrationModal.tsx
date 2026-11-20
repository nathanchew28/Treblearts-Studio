import { useEffect, useRef, useState } from 'react';
import { Check, Mic, MicOff, RotateCcw, Sliders, Volume2, X } from 'lucide-react';
import type { PitchCalibrationSettings, PitchReading } from '../types/music';
import { audioEngine, DEFAULT_PITCH_CALIBRATION } from '../utils/audioEngine';
import { freqToMidiAndCentsCalibrated, midiToFreq } from '../utils/notationParser';

interface PitchCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (cal: PitchCalibrationSettings) => void;
}

const REFERENCE_NOTES = [
  { midi: 60, name: 'C4', label: 'Middle C (C4)', hz: 261.63 },
  { midi: 69, name: 'A4', label: 'Concert A (A4)', hz: 440.0 },
  { midi: 67, name: 'G4', label: 'Open G (G4)', hz: 392.0 },
  { midi: 48, name: 'C3', label: 'Bass / Low C (C3)', hz: 130.81 },
];

const INSTRUMENT_PRESETS = [
  { label: 'Piano / Concert Pitch', minClarity: 0.84, centsTolerance: 38, defaultTranspose: 0 },
  { label: 'Voice / Singing', minClarity: 0.74, centsTolerance: 48, defaultTranspose: 0 },
  { label: 'Violin / Flute / Recorder', minClarity: 0.8, centsTolerance: 40, defaultTranspose: 0 },
  { label: 'Guitar / Ukulele', minClarity: 0.8, centsTolerance: 42, defaultTranspose: 0 },
  { label: 'Bb Trumpet / Clarinet', minClarity: 0.8, centsTolerance: 42, defaultTranspose: 2 },
  { label: 'Eb Alto Saxophone', minClarity: 0.8, centsTolerance: 42, defaultTranspose: 9 },
];

export function PitchCalibrationModal({
  isOpen,
  onClose,
  onSaved,
}: PitchCalibrationModalProps) {
  const existing = audioEngine.getPitchCalibration();

  const [targetMidi, setTargetMidi] = useState<number>(60);
  const [instrumentLabel, setInstrumentLabel] = useState<string>(existing.instrumentLabel);
  const [referenceA4Hz, setReferenceA4Hz] = useState<number>(existing.referenceA4Hz);
  const [semitoneTranspose, setSemitoneTranspose] = useState<number>(existing.semitoneTranspose);
  const [centsTolerance, setCentsTolerance] = useState<number>(existing.centsTolerance);
  const [minClarity, setMinClarity] = useState<number>(existing.minClarity);
  const [noiseGateRms, setNoiseGateRms] = useState<number>(existing.noiseGateRms);

  const [listening, setListening] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [liveReading, setLiveReading] = useState<PitchReading | null>(null);
  const [liveRms, setLiveRms] = useState<number>(0);
  const [sampleProgress, setSampleProgress] = useState<number>(0);
  const [calibrationStatus, setCalibrationStatus] = useState<string>(
    'Select your instrument & target note, then click "Listen & Calibrate".'
  );
  const [lockedPreview, setLockedPreview] = useState<{
    medianHz: number;
    computedA4: number;
    computedTranspose: number;
  } | null>(null);

  const samplesRef = useRef<{ freq: number; clarity: number; rms: number }[]>([]);
  const ambientRmsRef = useRef<number[]>([]);
  const lockedDoneRef = useRef<boolean>(false);

  const selectedRefNote =
    REFERENCE_NOTES.find((n) => n.midi === targetMidi) || REFERENCE_NOTES[0];

  const stopMic = () => {
    audioEngine.stopMicrophone();
    setListening(false);
  };

  useEffect(() => {
    if (!isOpen) {
      audioEngine.stopMicrophone();
      setListening(false);
    }
    return () => {
      audioEngine.stopMicrophone();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const playTargetTone = async () => {
    await audioEngine.ensureToneReady();
    audioEngine.playNote(midiToFreq(selectedRefNote.midi), 1.1, 0.78);
  };

  const applyInstrumentPreset = (label: string) => {
    setInstrumentLabel(label);
    const found = INSTRUMENT_PRESETS.find((p) => p.label === label);
    if (found) {
      setMinClarity(found.minClarity);
      setCentsTolerance(found.centsTolerance);
      setSemitoneTranspose(found.defaultTranspose);
    }
  };

  const startCalibrationCapture = async () => {
    setMicError(null);
    samplesRef.current = [];
    ambientRmsRef.current = [];
    lockedDoneRef.current = false;
    setSampleProgress(0);
    setLockedPreview(null);
    setCalibrationStatus(
      `Play or sing ${selectedRefNote.label} (${selectedRefNote.hz.toFixed(2)} Hz) steadily into your mic...`
    );

    try {
      await audioEngine.startMicrophone({
        tapThreshold: 0.14,
        rawPitchMode: true,
        onPitch: (reading, rawRms) => {
          setLiveRms(rawRms);
          setLiveReading(reading);

          if (!reading) {
            if (ambientRmsRef.current.length < 30 && rawRms < 0.04) {
              ambientRmsRef.current.push(rawRms);
            }
            return;
          }

          if (lockedDoneRef.current) return;

          // Record stable tonal frames
          samplesRef.current.push({
            freq: reading.freq,
            clarity: reading.clarity,
            rms: rawRms,
          });
          const count = samplesRef.current.length;
          setSampleProgress(Math.min(100, Math.round((count / 24) * 100)));

          if (count >= 24) {
            lockedDoneRef.current = true;
            const sortedFreqs = [...samplesRef.current]
              .map((s) => s.freq)
              .sort((a, b) => a - b);
            const medianHz = sortedFreqs[Math.floor(sortedFreqs.length / 2)];
            const avgClarity =
              samplesRef.current.reduce((s, x) => s + x.clarity, 0) / samplesRef.current.length;

            // Compare detected pitch against standard A4=440 to measure transpose + micro-tuning offset
            const rawDetected = freqToMidiAndCentsCalibrated(medianHz, 440, 0);
            const transposeOffset = Math.max(
              -24,
              Math.min(24, selectedRefNote.midi - rawDetected.midi)
            );
            const expectedRawTargetHz = midiToFreq(rawDetected.midi);
            const ratio = medianHz / expectedRawTargetHz;
            const computedA4 = Number(
              Math.max(418, Math.min(462, 440 * ratio)).toFixed(1)
            );

            // Compute noise gate from measured room floor or 1/5th of singing/playing RMS
            const floorAvg =
              ambientRmsRef.current.length > 0
                ? ambientRmsRef.current.reduce((a, b) => a + b, 0) / ambientRmsRef.current.length
                : 0.007;
            const signalAvgRms =
              samplesRef.current.reduce((s, x) => s + x.rms, 0) / samplesRef.current.length;
            const recommendedGate = Number(
              Math.max(0.007, Math.min(0.035, Math.max(floorAvg * 2.1, signalAvgRms * 0.16))).toFixed(4)
            );
            const recommendedClarity = Number(
              Math.max(0.7, Math.min(0.88, avgClarity - 0.12)).toFixed(2)
            );

            setReferenceA4Hz(computedA4);
            setSemitoneTranspose(transposeOffset);
            setNoiseGateRms(recommendedGate);
            setMinClarity(recommendedClarity);
            setLockedPreview({
              medianHz: Number(medianHz.toFixed(2)),
              computedA4,
              computedTranspose: transposeOffset,
            });
            setCalibrationStatus(
              `Locked ${selectedRefNote.name} at ${medianHz.toFixed(1)} Hz! Global A4 set to ${computedA4.toFixed(1)} Hz (${
                transposeOffset === 0
                  ? 'Concert Pitch'
                  : `${transposeOffset > 0 ? '+' : ''}${transposeOffset} st transpose`
              }).`
            );
            stopMic();
          }
        },
      });
      setListening(true);
    } catch {
      setMicError(
        'Microphone permission was denied or unavailable. You can still adjust tuning sliders manually below.'
      );
    }
  };

  const handleSaveGlobal = () => {
    stopMic();
    const nextSettings: PitchCalibrationSettings = {
      referenceA4Hz,
      semitoneTranspose,
      centsTolerance,
      minClarity,
      noiseGateRms,
      calibratedNoteName: selectedRefNote.name,
      instrumentLabel,
      calibratedAtMs: Date.now(),
    };
    audioEngine.setPitchCalibration(nextSettings);
    onSaved?.(nextSettings);
    onClose();
  };

  const handleReset = () => {
    stopMic();
    const def = audioEngine.resetPitchCalibration();
    setReferenceA4Hz(def.referenceA4Hz);
    setSemitoneTranspose(def.semitoneTranspose);
    setCentsTolerance(def.centsTolerance);
    setMinClarity(def.minClarity);
    setNoiseGateRms(def.noiseGateRms);
    setInstrumentLabel(def.instrumentLabel);
    setLockedPreview(null);
    setSampleProgress(0);
    setCalibrationStatus('Reset to standard Concert Pitch (A4 = 440.0 Hz).');
    onSaved?.(DEFAULT_PITCH_CALIBRATION);
  };

  // Compute live needle angle (-50..+50 cents mapped to -45deg..+45deg)
  const displayReading = liveReading
    ? freqToMidiAndCentsCalibrated(liveReading.freq, referenceA4Hz, semitoneTranspose)
    : null;
  const clampedCents = displayReading ? Math.max(-50, Math.min(50, displayReading.cents)) : 0;
  const needlePercent = 50 + clampedCents;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#080808]/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cal-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border-2 border-[#080808] bg-[#FFFDF4] p-6 shadow-[8px_8px_0_#080808] space-y-5">
        <div className="flex items-start justify-between gap-4 border-b-2 border-[#080808]/15 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-[#2D40EA]">
              <Sliders className="h-4 w-4 text-[#EC4899]" />
              Global Microphone &amp; Instrument Calibration
            </div>
            <h2 id="cal-modal-title" className="font-display text-2xl font-bold text-[#080808]">
              Tune Your Mic for Accurate Note Detection
            </h2>
            <p className="text-xs text-slate-700">
              Play or sing a steady reference note so Practice Stage, Solfège Lab, and Melody Dash
              recognize your instrument or voice accurately.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopMic();
              onClose();
            }}
            aria-label="Close calibration modal"
            className="min-h-[40px] min-w-[40px] rounded-xl border-2 border-[#080808] bg-white p-2 text-[#080808] cursor-pointer hover:bg-[#FFD000]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step 1: Instrument & Target Reference Note */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cal-instrument" className="mb-1.5 block text-xs font-bold text-[#080808]">
              1. Instrument / Voice Profile
            </label>
            <select
              id="cal-instrument"
              value={instrumentLabel}
              onChange={(e) => applyInstrumentPreset(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border-2 border-[#080808] bg-white px-3 text-xs font-bold text-[#080808]"
            >
              {INSTRUMENT_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-bold text-[#080808]">2. Target Reference Note</span>
              <button
                type="button"
                onClick={() => void playTargetTone()}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#2D40EA] cursor-pointer hover:underline"
              >
                <Volume2 className="h-3.5 w-3.5" />
                Hear {selectedRefNote.name}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {REFERENCE_NOTES.map((rn) => (
                <button
                  key={rn.midi}
                  type="button"
                  onClick={() => setTargetMidi(rn.midi)}
                  className={`min-h-[38px] rounded-xl border-2 border-[#080808] px-2.5 py-1 text-xs font-bold cursor-pointer transition-colors ${
                    targetMidi === rn.midi
                      ? 'bg-[#FFD000] text-[#080808]'
                      : 'bg-white text-[#080808] hover:bg-[#FFF9D6]'
                  }`}
                >
                  {rn.name} · {Math.round(rn.hz)}Hz
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Step 2: Live Tuning Gauge & Capture */}
        <div className="rounded-2xl border-2 border-[#080808] bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-[#080808]">{calibrationStatus}</div>
              <div className="font-mono text-xs text-slate-600 tabular-nums">
                Target: {selectedRefNote.label} ({selectedRefNote.hz.toFixed(2)} Hz) · Input RMS:{' '}
                {(liveRms * 100).toFixed(1)}%
              </div>
            </div>

            {!listening ? (
              <button
                type="button"
                onClick={() => void startCalibrationCapture()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#EC4899] px-4 py-2 text-xs font-bold text-white shadow-[2px_2px_0_#080808] cursor-pointer hover:bg-[#d63686]"
              >
                <Mic className="h-4 w-4" />
                Listen &amp; Calibrate {selectedRefNote.name}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopMic}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#080808] px-4 py-2 text-xs font-bold text-[#FFD000] cursor-pointer"
              >
                <MicOff className="h-4 w-4" />
                Stop Listening
              </button>
            )}
          </div>

          {/* Tuner Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between font-mono text-xs font-bold text-[#080808] tabular-nums">
              <span>-50¢ Flat</span>
              <span className="text-sm text-[#2D40EA]">
                {liveReading && displayReading
                  ? `${displayReading.noteName} · ${liveReading.freq.toFixed(1)} Hz (${
                      displayReading.cents >= 0 ? '+' : ''
                    }${displayReading.cents}¢)`
                  : 'Waiting for steady tone...'}
              </span>
              <span>+50¢ Sharp</span>
            </div>

            <div className="relative h-6 w-full overflow-hidden rounded-xl border-2 border-[#080808] bg-slate-100">
              {/* Center In-Tune Zone */}
              <div className="absolute inset-y-0 left-[42%] w-[16%] bg-emerald-300/60 border-x border-emerald-600/40" />
              {/* Center Line */}
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[#080808]" />
              {/* Live Needle Indicator */}
              {liveReading && (
                <div
                  className="absolute top-0.5 bottom-0.5 w-3 -translate-x-1/2 rounded-full border-2 border-[#080808] bg-[#FFD000] transition-[left] duration-75"
                  style={{ left: `${needlePercent}%` }}
                />
              )}
            </div>

            {/* Capture Sample Progress */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-600 whitespace-nowrap">
                Hold steady to lock:
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full border border-[#080808] bg-slate-100">
                <div
                  className="h-full bg-[#3898EC] transition-[width] duration-100"
                  style={{ width: `${sampleProgress}%` }}
                />
              </div>
              <span className="font-mono text-xs font-bold text-[#080808] tabular-nums">
                {sampleProgress}%
              </span>
            </div>
          </div>

          {lockedPreview && (
            <div className="rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-3.5 py-2.5 text-xs font-bold text-[#080808]">
              Measured median {lockedPreview.medianHz} Hz &rarr; Tuned A4 to{' '}
              {lockedPreview.computedA4.toFixed(1)} Hz and transpose to{' '}
              {lockedPreview.computedTranspose >= 0
                ? `+${lockedPreview.computedTranspose}`
                : lockedPreview.computedTranspose}{' '}
              semitones.
            </div>
          )}

          {micError && (
            <div className="rounded-xl border-2 border-[#080808] bg-[#FFDEDE] px-3.5 py-2.5 text-xs font-semibold text-[#080808]">
              {micError}
            </div>
          )}
        </div>

        {/* Fine Tuning Global Calibration Sliders */}
        <div className="grid grid-cols-1 gap-4 rounded-2xl border-2 border-[#080808] bg-white p-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex justify-between text-xs font-bold text-[#080808]">
              <span>Reference Pitch (A4)</span>
              <span className="font-mono tabular-nums">{referenceA4Hz.toFixed(1)} Hz</span>
            </div>
            <input
              type="range"
              min={418}
              max={462}
              step={0.5}
              value={referenceA4Hz}
              onChange={(e) => setReferenceA4Hz(Number(e.target.value))}
              className="w-full accent-[#2D40EA]"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs font-bold text-[#080808]">
              <span>Octave / Instrument Transpose</span>
              <span className="font-mono tabular-nums">
                {semitoneTranspose >= 0 ? `+${semitoneTranspose}` : semitoneTranspose} st
              </span>
            </div>
            <input
              type="range"
              min={-12}
              max={12}
              step={1}
              value={semitoneTranspose}
              onChange={(e) => setSemitoneTranspose(Number(e.target.value))}
              className="w-full accent-[#EC4899]"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs font-bold text-[#080808]">
              <span>Tuning Forgiveness</span>
              <span className="font-mono tabular-nums">±{centsTolerance}¢</span>
            </div>
            <input
              type="range"
              min={20}
              max={65}
              step={1}
              value={centsTolerance}
              onChange={(e) => setCentsTolerance(Number(e.target.value))}
              className="w-full accent-[#3898EC]"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs font-bold text-[#080808]">
              <span>Clarity Sensitivity Gate</span>
              <span className="font-mono tabular-nums">{Math.round(minClarity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.68}
              max={0.92}
              step={0.02}
              value={minClarity}
              onChange={(e) => setMinClarity(Number(e.target.value))}
              className="w-full accent-[#080808]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-4 py-2 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to A4 = 440 Hz
          </button>

          <button
            type="button"
            onClick={handleSaveGlobal}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-6 py-2 text-sm font-bold text-[#080808] shadow-[3px_3px_0_#080808] cursor-pointer hover:bg-[#FEC700]"
          >
            <Check className="h-4 w-4" />
            Save Global Pitch Calibration
          </button>
        </div>
      </div>
    </div>
  );
}
