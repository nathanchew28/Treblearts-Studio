import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { DifficultyLevel, ExerciseFocus, MusicExercise } from '../types/music';
import { audioEngine } from '../utils/audioEngine';
import { preprocessSheetMusicPhoto, type OmrPreprocessResult } from '../utils/omrPreprocessor';
import { midiToFreq, midiToNoteName, notesToAbc, parseAbcNotation } from '../utils/notationParser';
import { SheetMusicViewer } from './SheetMusicViewer';

interface SheetPhotoScannerProps {
  authorId: string;
  authorName: string;
  onStartExercise: (exercise: MusicExercise) => void;
  onSaveExercise?: (
    exercise: Omit<MusicExercise, 'playsCount' | 'createdAtMs'>
  ) => Promise<void>;
  compact?: boolean;
}

interface TranscribeResponse {
  title: string;
  composer: string;
  instrument: string;
  timeSignature: string;
  keySignature: string;
  bpm: number;
  difficulty: DifficultyLevel;
  focus: ExerciseFocus;
  coachingTip: string;
  abcNotation: string;
}

const INSTRUMENT_OPTIONS = [
  'Auto-Detect Instrument',
  'Piano / Keyboard',
  'Violin / Strings',
  'Flute / Recorder',
  'Guitar / Ukulele',
  'Voice / Singing',
  'Clarinet / Saxophone',
  'Trumpet / Brass',
  'Drums / Percussion',
];

export function SheetPhotoScanner({
  authorId,
  authorName,
  onStartExercise,
  onSaveExercise,
  compact = false,
}: SheetPhotoScannerProps) {
  const [instrument, setInstrument] = useState<string>('Auto-Detect Instrument');
  const [customInstrument, setCustomInstrument] = useState<string>('');
  const [cameraOpen, setCameraOpen] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewMimeType, setPreviewMimeType] = useState<string>('image/jpeg');
  const [omrScan, setOmrScan] = useState<OmrPreprocessResult | null>(null);
  const [showEnhancedScan, setShowEnhancedScan] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedExercise, setGeneratedExercise] = useState<MusicExercise | null>(null);
  const [isAuditioning, setIsAuditioning] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraError(
        'Camera permission was denied or no camera was detected. Use "Upload Photo" below instead!'
      );
    }
  };

  const transcribeImage = async (
    dataUrl: string,
    mimeType: string,
    instrumentOverride?: string
  ) => {
    setIsAnalyzing(true);
    setErrorMsg(null);
    setSavedNotice(false);
    setGeneratedExercise(null);

    try {
      const chosenInstrument =
        instrumentOverride ||
        (customInstrument.trim()
          ? customInstrument.trim()
          : instrument === 'Auto-Detect Instrument'
          ? ''
          : instrument);

      const preprocessed = await preprocessSheetMusicPhoto(dataUrl);
      setOmrScan(preprocessed);

      const response = await fetch('/api/transcribe-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType,
          enhancedImageBase64: preprocessed.enhancedDataUrl,
          enhancedMimeType: preprocessed.enhancedMimeType,
          omrHints: {
            staffCount: preprocessed.staffCount,
            systemCount: preprocessed.systemCount,
            estimatedLayout: preprocessed.estimatedLayout,
            lineSpacingPx: preprocessed.lineSpacingPx,
          },
          instrument: chosenInstrument,
        }),
      });

      const payload = (await response.json()) as TranscribeResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not read sheet music photo.');
      }

      const parsed = parseAbcNotation(payload.abcNotation);
      if (parsed.notes.length === 0) {
        throw new Error(
          'No playable notes were detected in that photo. Try a clearer, well-lit close-up of the musical staff.'
        );
      }

      const exercise: MusicExercise = {
        id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        authorId,
        authorName,
        title: payload.title || parsed.title || 'Scanned Sheet Music',
        composer:
          payload.composer ||
          (payload.instrument ? `${payload.instrument} Sheet` : parsed.composer),
        sourceFormat: 'abc',
        notationText: parsed.notationText,
        bpm: payload.bpm || parsed.bpm || 96,
        timeSignature: payload.timeSignature || parsed.timeSignature || '4/4',
        keySignature: payload.keySignature || parsed.keySignature || 'C',
        difficulty: payload.difficulty || 'Beginner',
        focus: payload.focus || 'Complete',
        coachingTip:
          payload.coachingTip ||
          'Play slowly first with rainbow notes, then clap and record your performance!',
        notes: parsed.notes,
        isPublic: true,
        playsCount: 0,
        coverImage: dataUrl,
      };

      setGeneratedExercise(exercise);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Something went wrong reading that sheet photo.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const captureFromCamera = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const maxW = 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setPreviewDataUrl(dataUrl);
    setPreviewMimeType('image/jpeg');
    stopCamera();
    void transcribeImage(dataUrl, 'image/jpeg');
  };

  const handleFileSelected = (file: File) => {
    setErrorMsg(null);
    const mimeType = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setPreviewDataUrl(reader.result);
      setPreviewMimeType(mimeType);
      void transcribeImage(reader.result, mimeType);
    };
    reader.readAsDataURL(file);
  };

  const handleAudition = async () => {
    if (!generatedExercise || isAuditioning) return;
    await audioEngine.ensureToneReady();
    setIsAuditioning(true);
    const notes = generatedExercise.notes.slice(0, 48);
    const secPerBeat = 60 / generatedExercise.bpm;
    for (const n of notes) {
      window.setTimeout(() => {
        const dur = Math.max(0.16, n.durationBeats * secPerBeat * 0.9);
        const vol = n.hand === 'left' ? 0.35 : 0.7;
        if (n.chordMidis && n.chordMidis.length > 1) {
          const perVol = Math.max(0.14, vol / n.chordMidis.length);
          for (const m of n.chordMidis) {
            audioEngine.playNote(midiToFreq(m), dur, perVol);
          }
        } else {
          audioEngine.playNote(n.freq, dur, vol);
        }
      }, n.beatStart * secPerBeat * 1000);
    }
    const totalMs =
      notes.reduce(
        (m, n) => Math.max(m, (n.beatStart + n.durationBeats) * secPerBeat * 1000),
        900
      ) + 250;
    window.setTimeout(() => setIsAuditioning(false), totalMs);
  };

  const transposeGenerated = (semitones: number) => {
    if (!generatedExercise) return;
    const shiftedNotes = generatedExercise.notes.map((n) => {
      const midi = Math.max(36, Math.min(96, n.midi + semitones));
      const chordMidis = n.chordMidis?.map((m) => Math.max(24, Math.min(108, m + semitones)));
      return {
        ...n,
        midi,
        chordMidis,
        noteName: midiToNoteName(midi),
        freq: Number(midiToFreq(midi).toFixed(2)),
      };
    });
    const rebuiltAbc = notesToAbc(
      generatedExercise.title,
      generatedExercise.composer,
      generatedExercise.timeSignature,
      generatedExercise.keySignature,
      generatedExercise.bpm,
      shiftedNotes.filter((n) => n.hand !== 'left').length > 0
        ? shiftedNotes.filter((n) => n.hand !== 'left')
        : shiftedNotes
    );
    setGeneratedExercise({
      ...generatedExercise,
      notationText: rebuiltAbc,
      notes: shiftedNotes,
    });
  };

  const handleSaveToLibrary = async () => {
    if (!generatedExercise || !onSaveExercise || isSaving) return;
    setIsSaving(true);
    try {
      const { playsCount: _p, createdAtMs: _c, ...rest } = generatedExercise;
      await onSaveExercise(rest);
      setSavedNotice(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border-2 border-[#080808] bg-white ${
        compact ? 'p-5' : 'p-6 md:p-7'
      } shadow-[4px_4px_0_#080808] space-y-5`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#2D40EA]">
            <Sparkles className="h-4 w-4 text-[#EC4899]" />
            Instant Photo-to-Exercise Scanner · Any Instrument
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            Snap Any Sheet Music Photo &amp; Play Right Away
          </h2>
          <p className="max-w-2xl text-sm text-slate-700">
            Take a picture with your camera or upload a photo of piano, violin, flute, guitar,
            ukulele, or vocal sheet music to turn it into 4 interactive practice games.
          </p>
        </div>

        {/* Instrument Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="scanner-instrument" className="text-xs font-bold text-[#080808]">
            Instrument:
          </label>
          <select
            id="scanner-instrument"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            className="min-h-[40px] rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-3 py-1.5 text-xs font-semibold text-[#080808] focus:outline-none"
          >
            {INSTRUMENT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={customInstrument}
            onChange={(e) => setCustomInstrument(e.target.value)}
            placeholder="Or type instrument..."
            aria-label="Custom instrument name"
            className="min-h-[40px] w-40 rounded-xl border-2 border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#080808] placeholder:text-slate-400 focus:border-[#080808] focus:outline-none"
          />
        </div>
      </div>

      {/* Camera / Upload Action Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void (cameraOpen ? stopCamera() : startCamera())}
          className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-3 text-sm font-bold text-[#080808] shadow-[2px_2px_0_#080808] cursor-pointer transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          {cameraOpen ? <X className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          {cameraOpen ? 'Close Camera' : 'Take Sheet Photo'}
        </button>

        <label className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl border-2 border-[#080808] bg-[#3898EC] px-4 py-3 text-sm font-bold text-white shadow-[2px_2px_0_#080808] cursor-pointer transition-transform hover:-translate-y-0.5 active:translate-y-0">
          <Upload className="h-5 w-5" />
          Upload Sheet Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = '';
            }}
            className="sr-only"
          />
        </label>
      </div>

      {/* Live Camera Viewfinder */}
      {cameraOpen && (
        <div className="overflow-hidden rounded-2xl border-2 border-[#080808] bg-[#080808] p-3 space-y-3">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-h-[360px] w-full rounded-xl object-contain bg-black"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-white/85">
              Hold your sheet music flat inside the frame, then tap Snap &amp; Read Music!
            </p>
            <button
              type="button"
              onClick={captureFromCamera}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-white bg-[#FFD000] px-5 py-2 text-sm font-bold text-[#080808] cursor-pointer hover:bg-[#FEC700]"
            >
              <Camera className="h-4 w-4" />
              Snap &amp; Read Music
            </button>
          </div>
        </div>
      )}

      {cameraError && (
        <div className="rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-4 py-3 text-xs font-semibold text-[#080808]">
          {cameraError}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border-2 border-[#080808] bg-[#FFDEDE] px-4 py-3 text-xs font-semibold text-[#080808]">
          {errorMsg}
        </div>
      )}

      {/* Preview & Results Area */}
      {(previewDataUrl || isAnalyzing || generatedExercise) && (
        <div className="grid grid-cols-1 gap-5 rounded-2xl border-2 border-[#080808] bg-[#FFFDF4] p-4 lg:grid-cols-12">
          {previewDataUrl && (
            <div className="space-y-2 lg:col-span-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#080808]">
                  {showEnhancedScan ? 'OMR Binary Staff Scan' : 'Captured Sheet Photo'}
                </span>
                {omrScan && (
                  <button
                    type="button"
                    onClick={() => setShowEnhancedScan((v) => !v)}
                    className="rounded-lg border border-[#080808] bg-[#FFF9D6] px-2 py-0.5 text-[11px] font-bold text-[#080808] cursor-pointer hover:bg-[#FFD000]"
                  >
                    {showEnhancedScan ? 'View Original' : 'View OMR Scan'}
                  </button>
                )}
              </div>
              <div className="aspect-[4/3] overflow-hidden rounded-xl border-2 border-[#080808] bg-white">
                <img
                  src={showEnhancedScan && omrScan ? omrScan.enhancedDataUrl : previewDataUrl}
                  alt="Captured sheet music"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-contain"
                />
              </div>
              {omrScan && omrScan.staffCount > 0 && (
                <div className="rounded-lg border border-[#080808]/20 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">
                  OMR Staff Detector: {omrScan.staffCount} staves · {omrScan.systemCount}{' '}
                  {omrScan.estimatedLayout === 'grand-staff' ? 'grand-staff systems' : 'systems'}
                </div>
              )}
              {!isAnalyzing && (
                <button
                  type="button"
                  onClick={() => void transcribeImage(previewDataUrl, previewMimeType)}
                  className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Re-Scan Photo
                </button>
              )}
            </div>
          )}

          <div className={previewDataUrl ? 'lg:col-span-8 space-y-4' : 'lg:col-span-12 space-y-4'}>
            {isAnalyzing && (
              <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#080808] bg-white p-6 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#2D40EA]" />
                <div className="space-y-1">
                  <p className="font-display text-lg font-bold text-[#080808]">
                    Running OMR Staff Detection &amp; Pitch Calibration...
                  </p>
                  <p className="text-xs text-slate-600">
                    Enhancing staff lines, checking clef &amp; key signature, and building your 4 practice games!
                  </p>
                </div>
              </div>
            )}

            {generatedExercise && !isAnalyzing && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-[#EC4899]">
                      Ready to Play · {generatedExercise.timeSignature} · Key of{' '}
                      {generatedExercise.keySignature} · {generatedExercise.bpm} BPM ·{' '}
                      {generatedExercise.notes.length} notes
                    </div>
                    <h3 className="font-display text-xl font-bold text-[#080808]">
                      {generatedExercise.title}
                    </h3>
                    <p className="text-xs text-slate-700">
                      {generatedExercise.composer} · {generatedExercise.coachingTip}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleAudition()}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-3.5 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {isAuditioning ? 'Playing...' : 'Hear Melody & Chords'}
                    </button>
                  </div>
                </div>

                {/* Quick Calibration Strip for instant pitch/octave verification */}
                <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-[#080808] bg-white px-3 py-2 text-xs font-bold text-[#080808]">
                  <span className="text-slate-600">Quick Calibration:</span>
                  <button
                    type="button"
                    onClick={() => transposeGenerated(-12)}
                    className="rounded-lg border border-[#080808] bg-[#FFF9D6] px-2.5 py-1 cursor-pointer hover:bg-[#FFD000]"
                  >
                    -1 Octave
                  </button>
                  <button
                    type="button"
                    onClick={() => transposeGenerated(-1)}
                    className="rounded-lg border border-[#080808] bg-[#FFF9D6] px-2.5 py-1 cursor-pointer hover:bg-[#FFD000]"
                  >
                    -1 Semitone
                  </button>
                  <button
                    type="button"
                    onClick={() => transposeGenerated(1)}
                    className="rounded-lg border border-[#080808] bg-[#FFF9D6] px-2.5 py-1 cursor-pointer hover:bg-[#FFD000]"
                  >
                    +1 Semitone
                  </button>
                  <button
                    type="button"
                    onClick={() => transposeGenerated(12)}
                    className="rounded-lg border border-[#080808] bg-[#FFF9D6] px-2.5 py-1 cursor-pointer hover:bg-[#FFD000]"
                  >
                    +1 Octave
                  </button>
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-slate-600">Tempo:</span>
                    <input
                      type="number"
                      min={45}
                      max={200}
                      value={generatedExercise.bpm}
                      onChange={(e) =>
                        setGeneratedExercise({
                          ...generatedExercise,
                          bpm: Math.max(45, Math.min(200, Number(e.target.value) || 96)),
                        })
                      }
                      className="w-16 rounded-lg border border-[#080808] px-2 py-0.5 font-mono text-xs"
                    />
                    <span>BPM</span>
                  </div>
                </div>

                <SheetMusicViewer exercise={generatedExercise} activeNoteIndex={-1} interactive />

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onStartExercise(generatedExercise)}
                    className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-5 py-2.5 text-sm font-bold text-[#080808] shadow-[3px_3px_0_#080808] cursor-pointer transition-transform hover:-translate-y-0.5"
                  >
                    <Play className="h-4 w-4" />
                    Practice All 4 Activities Now!
                  </button>

                  {onSaveExercise && (
                    <button
                      type="button"
                      disabled={isSaving || savedNotice}
                      onClick={() => void handleSaveToLibrary()}
                      className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#EC4899] px-4 py-2.5 text-sm font-bold text-white shadow-[3px_3px_0_#080808] cursor-pointer transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                    >
                      {savedNotice ? (
                        <>
                          <Check className="h-4 w-4" />
                          Saved to Song Library!
                        </>
                      ) : (
                        <span>{isSaving ? 'Saving...' : 'Save to Song Library'}</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
