import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Radio, Square, Volume2 } from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';
import { getNoteColorInfo } from '../utils/kidFriendlyTheme';
import { midiToNoteName } from '../utils/notationParser';

type ToneTimbre = 'sine' | 'triangle' | 'sawtooth';

const QUICK_REFERENCE_NOTES: { midi: number; label: string }[] = [
  { midi: 60, label: 'C4' },
  { midi: 69, label: 'A4' },
  { midi: 67, label: 'G4' },
  { midi: 65, label: 'F4' },
  { midi: 70, label: 'Bb4' },
  { midi: 64, label: 'E4' },
];

const TIMBRE_OPTIONS: { id: ToneTimbre; label: string }[] = [
  { id: 'sine', label: 'Pure Sine' },
  { id: 'triangle', label: 'Warm Flute' },
  { id: 'sawtooth', label: 'Bright Reed' },
];

interface PitchReferenceWidgetProps {
  songStartMidi: number;
  exerciseRunning: boolean;
}

export function PitchReferenceWidget({
  songStartMidi,
  exerciseRunning,
}: PitchReferenceWidgetProps) {
  const [midi, setMidi] = useState<number>(() =>
    Math.max(36, Math.min(96, Math.round(songStartMidi || 60)))
  );
  const [timbre, setTimbre] = useState<ToneTimbre>('sine');
  const [volume, setVolume] = useState<number>(0.6);
  const [isSustaining, setIsSustaining] = useState<boolean>(false);
  const [referenceA4Hz, setReferenceA4Hz] = useState<number>(
    () => audioEngine.getPitchCalibration().referenceA4Hz
  );

  // Follow song's starting pitch when switching songs while stopped
  useEffect(() => {
    if (!isSustaining && songStartMidi) {
      setMidi(Math.max(36, Math.min(96, Math.round(songStartMidi))));
    }
  }, [songStartMidi, isSustaining]);

  // Keep frequency aligned with global pitch calibration updates
  useEffect(() => {
    return audioEngine.subscribePitchCalibration((cal) => {
      setReferenceA4Hz(cal.referenceA4Hz);
    });
  }, []);

  // Automatically fade out reference tone when exercise run starts
  useEffect(() => {
    if (exerciseRunning && isSustaining) {
      audioEngine.stopReferenceTone();
      setIsSustaining(false);
    }
  }, [exerciseRunning, isSustaining]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      audioEngine.stopReferenceTone();
    };
  }, []);

  const freq = useMemo(
    () => referenceA4Hz * Math.pow(2, (midi - 69) / 12),
    [midi, referenceA4Hz]
  );

  // Smoothly update frequency/timbre/volume while sustained
  useEffect(() => {
    if (isSustaining) {
      audioEngine.updateReferenceTone(freq, timbre, volume);
    }
  }, [freq, timbre, volume, isSustaining]);

  const toggleSustain = async () => {
    if (isSustaining) {
      audioEngine.stopReferenceTone();
      setIsSustaining(false);
      return;
    }
    await audioEngine.startReferenceTone(freq, timbre, volume);
    setIsSustaining(true);
  };

  const noteName = midiToNoteName(midi);
  const chroma = getNoteColorInfo(midi);
  const clampedStartMidi = Math.max(36, Math.min(96, Math.round(songStartMidi || 60)));

  return (
    <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[4px_4px_0_#080808] space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-[#EC4899]" />
          <h2 className="font-display text-base font-bold text-[#080808]">
            Pitch Reference Tone
          </h2>
        </div>
        <span className="font-mono text-[11px] font-bold text-slate-600 tabular-nums">
          A4 = {referenceA4Hz.toFixed(1)} Hz
        </span>
      </div>

      {/* Selected Note Readout + Chromatic/Octave Steppers */}
      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-3">
        <div className="flex items-center gap-3">
          <div
            style={{ backgroundColor: chroma.hex }}
            className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[#080808] font-mono text-base font-extrabold text-white shadow-[2px_2px_0_#080808]"
          >
            {noteName}
          </div>
          <div>
            <div className="text-xs font-extrabold text-[#080808]">
              {chroma.solfege} · {noteName}
            </div>
            <div className="font-mono text-xs font-semibold text-slate-600 tabular-nums">
              {freq.toFixed(2)} Hz
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMidi((m) => Math.max(36, m - 12))}
            aria-label="Down one octave"
            className="min-h-[34px] rounded-lg border border-[#080808] bg-white px-2 font-mono text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            -Oct
          </button>
          <button
            type="button"
            onClick={() => setMidi((m) => Math.max(36, m - 1))}
            aria-label="Down one semitone"
            className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-[#080808] bg-white text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMidi((m) => Math.min(96, m + 1))}
            aria-label="Up one semitone"
            className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-[#080808] bg-white text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMidi((m) => Math.min(96, m + 12))}
            aria-label="Up one octave"
            className="min-h-[34px] rounded-lg border border-[#080808] bg-white px-2 font-mono text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            +Oct
          </button>
        </div>
      </div>

      {/* Quick Anchor Notes + Song Starting Pitch */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
          <span>Quick Reference Notes</span>
          <button
            type="button"
            onClick={() => setMidi(clampedStartMidi)}
            className="font-bold text-[#2D40EA] hover:underline cursor-pointer"
          >
            Song Start ({midiToNoteName(clampedStartMidi)})
          </button>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {QUICK_REFERENCE_NOTES.map((item) => {
            const active = midi === item.midi;
            return (
              <button
                key={item.midi}
                type="button"
                onClick={() => setMidi(item.midi)}
                className={`min-h-[32px] rounded-lg border-2 font-mono text-xs font-bold cursor-pointer transition-colors ${
                  active
                    ? 'border-[#080808] bg-[#080808] text-[#FFD000]'
                    : 'border-slate-300 bg-white text-[#080808] hover:bg-[#FFF9D6]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Timbre & Volume Controls */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-1.5">
          {TIMBRE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTimbre(opt.id)}
              className={`min-h-[32px] rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                timbre === opt.id
                  ? 'border-[#080808] bg-[#3898EC] text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-[#FFF9D6]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <Volume2 className="h-3.5 w-3.5 shrink-0 text-slate-600" />
          <input
            type="range"
            aria-label="Reference tone volume"
            min={0.15}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full accent-[#EC4899]"
          />
          <span className="w-9 text-right font-mono text-[11px] font-bold text-slate-700 tabular-nums">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>

      {/* Sustained Play / Stop CTA */}
      <button
        type="button"
        onClick={() => void toggleSustain()}
        className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border-2 border-[#080808] px-4 py-2 text-xs font-extrabold shadow-[3px_3px_0_#080808] cursor-pointer transition-colors ${
          isSustaining
            ? 'bg-[#FF6565] text-white'
            : 'bg-[#FFD000] text-[#080808] hover:bg-[#FEC700]'
        }`}
      >
        {isSustaining ? (
          <>
            <Square className="h-3.5 w-3.5" />
            Stop Sustained Tone ({noteName})
          </>
        ) : (
          <>
            <Volume2 className="h-4 w-4" />
            Play Sustained Reference ({noteName})
          </>
        )}
      </button>
    </div>
  );
}
