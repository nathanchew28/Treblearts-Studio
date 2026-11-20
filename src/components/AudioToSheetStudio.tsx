import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileAudio,
  Loader2,
  Mic,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import type { MusicExercise } from '../types/music';
import { audioEngine } from '../utils/audioEngine';
import { transcribeAudioToSheet, type AudioTranscriptionResult } from '../utils/audioToSheet';
import { midiToFreq } from '../utils/notationParser';
import { SheetMusicViewer } from './SheetMusicViewer';

interface AudioToSheetStudioProps {
  authorId: string;
  authorName: string;
  onStartExercise: (exercise: MusicExercise) => void;
  onSaveExercise?: (
    exercise: Omit<MusicExercise, 'playsCount' | 'createdAtMs'>
  ) => Promise<void>;
  onAwardXp?: (xp: number, label: string) => void;
  compact?: boolean;
}

const INSTRUMENTS = [
  'Any Instrument / Polyphonic',
  'Piano / Keyboard',
  'Guitar / Acoustic',
  'Violin / Cello',
  'Flute / Recorder',
  'Voice / Singing',
  'Ukulele',
  'Saxophone / Trumpet',
];

type SensitivityPreset = 'solo' | 'balanced' | 'poly';

const SENSITIVITY_MAP: Record<
  SensitivityPreset,
  { label: string; onset: number; frame: number }
> = {
  solo: { label: 'Clean Solo Melody', onset: 0.56, frame: 0.4 },
  balanced: { label: 'Balanced (Default)', onset: 0.45, frame: 0.32 },
  poly: { label: 'Rich Chords & Polyphony', onset: 0.34, frame: 0.24 },
};

export function AudioToSheetStudio({
  authorId,
  authorName,
  onStartExercise,
  onSaveExercise,
  onAwardXp,
  compact = false,
}: AudioToSheetStudioProps) {
  const [title, setTitle] = useState<string>('My Recorded Melody');
  const [instrument, setInstrument] = useState<string>('Any Instrument / Polyphonic');
  const [timeSignature, setTimeSignature] = useState<string>('4/4');
  const [bpmMode, setBpmMode] = useState<'auto' | 'manual'>('auto');
  const [manualBpm, setManualBpm] = useState<number>(100);
  const [sensitivity, setSensitivity] = useState<SensitivityPreset>('balanced');

  // Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recSeconds, setRecSeconds] = useState<number>(0);
  const [liveLevel, setLiveLevel] = useState<number>(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [progressStage, setProgressStage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AudioTranscriptionResult | null>(null);
  const [isAuditioning, setIsAuditioning] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const timerIdRef = useRef<number | null>(null);

  const cleanupRecordingHandles = () => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    if (timerIdRef.current !== null) {
      window.clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupRecordingHandles();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const runTranscription = async (blob: Blob, overrideTitle?: string) => {
    setIsTranscribing(true);
    setProgressPct(4);
    setProgressStage('Preparing audio for Spotify Basic Pitch neural network...');
    setErrorMsg(null);
    setSavedNotice(false);

    try {
      const preset = SENSITIVITY_MAP[sensitivity];
      const transcribed = await transcribeAudioToSheet(blob, {
        title: overrideTitle || title,
        instrument,
        timeSignature,
        bpmOverride: bpmMode === 'manual' ? manualBpm : undefined,
        onsetThreshold: preset.onset,
        frameThreshold: preset.frame,
        authorId,
        authorName,
        onProgress: (pct, stage) => {
          setProgressPct(pct);
          setProgressStage(stage);
        },
      });
      setResult(transcribed);
      onAwardXp?.(30, 'Audio-to-Sheet Transcription');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to transcribe audio into sheet music.'
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const startMicRecording = async () => {
    setErrorMsg(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const buf = new Float32Array(analyser.fftSize);
      const updateMeter = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setLiveLevel(Math.min(1, rms * 5.5));
        meterRafRef.current = requestAnimationFrame(updateMeter);
      };
      meterRafRef.current = requestAnimationFrame(updateMeter);

      chunksRef.current = [];
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = preferred.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        cleanupRecordingHandles();
        setIsRecording(false);
        setLiveLevel(0);

        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        void runTranscription(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(200);
      setIsRecording(true);
      setRecSeconds(0);
      timerIdRef.current = window.setInterval(() => {
        setRecSeconds((s) => s + 1);
      }, 1000);
    } catch {
      cleanupRecordingHandles();
      setErrorMsg(
        'Microphone access was blocked or unavailable. You can still upload any recorded audio file (.mp3, .wav, .ogg, .m4a) below!'
      );
    }
  };

  const stopMicRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleAudioFileSelected = (file: File) => {
    setErrorMsg(null);
    setResult(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    const url = URL.createObjectURL(file);
    setRecordedBlob(file);
    setRecordedUrl(url);

    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const nextTitle = baseName || title;
    setTitle(nextTitle);
    void runTranscription(file, nextTitle);
  };

  const handleAudition = async () => {
    if (!result || isAuditioning) return;
    await audioEngine.ensureToneReady();
    setIsAuditioning(true);
    const notes = result.exercise.notes.slice(0, 80);
    const secPerBeat = 60 / result.exercise.bpm;
    for (const n of notes) {
      window.setTimeout(() => {
        const dur = Math.max(0.16, n.durationBeats * secPerBeat * 0.9);
        if (n.chordMidis && n.chordMidis.length > 1) {
          const perVol = Math.max(0.16, 0.72 / n.chordMidis.length);
          for (const m of n.chordMidis) {
            audioEngine.playNote(midiToFreq(m), dur, perVol);
          }
        } else {
          audioEngine.playNote(n.freq, dur, 0.65);
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

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!result || !onSaveExercise || isSaving) return;
    setIsSaving(true);
    try {
      const { playsCount: _p, createdAtMs: _c, ...rest } = result.exercise;
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
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#EC4899]">
            <Sparkles className="h-4 w-4 text-[#2D40EA]" />
            Spotify Basic Pitch Neural Audio-to-Sheet · Any Instrument or Voice
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            Record or Upload Any Instrument Sound &rarr; Sheet Music
          </h2>
          <p className="max-w-2xl text-sm text-slate-700">
            Play piano, guitar, violin, flute, recorder, or sing into your microphone (or drop any
            recorded audio file) and convert the sound straight into MusicXML sheet music and live
            practice games.
          </p>
        </div>
      </div>

      {/* Transcription Controls Grid */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border-2 border-[#080808] bg-[#FFFDF4] p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="bp-title" className="mb-1 block text-xs font-bold text-[#080808]">
            Song Title
          </label>
          <input
            id="bp-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-semibold text-[#080808]"
          />
        </div>

        <div>
          <label htmlFor="bp-instrument" className="mb-1 block text-xs font-bold text-[#080808]">
            Instrument Source
          </label>
          <select
            id="bp-instrument"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-semibold text-[#080808]"
          >
            {INSTRUMENTS.map((inst) => (
              <option key={inst} value={inst}>
                {inst}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bp-meter" className="mb-1 block text-xs font-bold text-[#080808]">
            Time Signature
          </label>
          <select
            id="bp-meter"
            value={timeSignature}
            onChange={(e) => setTimeSignature(e.target.value)}
            className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-semibold text-[#080808]"
          >
            <option value="4/4">4/4 Common Time</option>
            <option value="3/4">3/4 Waltz</option>
            <option value="2/4">2/4 March</option>
            <option value="6/8">6/8 Compound</option>
          </select>
        </div>

        <div>
          <label htmlFor="bp-sensitivity" className="mb-1 block text-xs font-bold text-[#080808]">
            Note Detection Mode
          </label>
          <select
            id="bp-sensitivity"
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value as SensitivityPreset)}
            className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-semibold text-[#080808]"
          >
            {(Object.keys(SENSITIVITY_MAP) as SensitivityPreset[]).map((key) => (
              <option key={key} value={key}>
                {SENSITIVITY_MAP[key].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-bold text-[#080808]">Tempo Grid</label>
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Tempo detection mode"
              value={bpmMode}
              onChange={(e) => setBpmMode(e.target.value as 'auto' | 'manual')}
              className="w-full rounded-xl border-2 border-[#080808] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#080808]"
            >
              <option value="auto">Auto-BPM</option>
              <option value="manual">Manual BPM</option>
            </select>
            {bpmMode === 'manual' && (
              <input
                type="number"
                min={50}
                max={180}
                aria-label="Manual BPM"
                value={manualBpm}
                onChange={(e) => setManualBpm(Number(e.target.value) || 100)}
                className="w-16 rounded-xl border-2 border-[#080808] bg-white px-2 py-1.5 font-mono text-xs font-bold text-[#080808]"
              />
            )}
          </div>
        </div>
      </div>

      {/* Record / Upload Actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!isRecording ? (
          <button
            type="button"
            disabled={isTranscribing}
            onClick={() => void startMicRecording()}
            className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl border-2 border-[#080808] bg-[#EC4899] px-4 py-3 text-sm font-bold text-white shadow-[2px_2px_0_#080808] cursor-pointer transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            <Mic className="h-5 w-5" />
            Record Instrument or Singing
          </button>
        ) : (
          <button
            type="button"
            onClick={stopMicRecording}
            className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl border-2 border-[#080808] bg-[#080808] px-4 py-3 text-sm font-bold text-[#FFD000] shadow-[2px_2px_0_#EC4899] cursor-pointer"
          >
            <Square className="h-4 w-4 fill-current" />
            <span className="font-mono tabular-nums">
              Stop &amp; Convert to Sheet ({recSeconds}s)
            </span>
          </button>
        )}

        <label className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl border-2 border-[#080808] bg-[#2D40EA] px-4 py-3 text-sm font-bold text-white shadow-[2px_2px_0_#080808] cursor-pointer transition-transform hover:-translate-y-0.5">
          <Upload className="h-5 w-5" />
          Upload Audio Recording (.mp3 / .wav / .ogg / .m4a)
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAudioFileSelected(file);
              e.target.value = '';
            }}
            className="sr-only"
          />
        </label>
      </div>

      {/* Live Microphone Level Meter while recording */}
      {isRecording && (
        <div className="rounded-xl border-2 border-[#080808] bg-[#FFF9D6] p-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-[#080808]">
            <span>Listening to your instrument... play clear notes or chords!</span>
            <span className="font-mono tabular-nums">{recSeconds}s</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full border border-[#080808] bg-white">
            <div
              className="h-full bg-[#EC4899] transition-[width] duration-75"
              style={{ width: `${Math.round(liveLevel * 100)}%` }}
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border-2 border-[#080808] bg-[#FFDEDE] px-4 py-3 text-xs font-semibold text-[#080808]">
          {errorMsg}
        </div>
      )}

      {/* Progress / Results Panel */}
      {(isTranscribing || result || recordedUrl) && (
        <div className="rounded-2xl border-2 border-[#080808] bg-[#FFFDF4] p-4 space-y-4">
          {recordedUrl && !isRecording && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#080808]/20 bg-white px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#080808]">
                <FileAudio className="h-4 w-4 text-[#2D40EA]" />
                Recorded / Uploaded Source Audio
              </div>
              <audio controls src={recordedUrl} className="h-9 max-w-full" />
              {recordedBlob && !isTranscribing && (
                <button
                  type="button"
                  onClick={() => void runTranscription(recordedBlob)}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border-2 border-[#080808] bg-[#FFF9D6] px-3 py-1 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFD000]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Re-Transcribe with Current Settings
                </button>
              )}
            </div>
          )}

          {isTranscribing && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#080808] bg-white p-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#EC4899]" />
              <div className="w-full max-w-md space-y-2">
                <p className="font-display text-base font-bold text-[#080808]">
                  {progressStage || 'Converting Sound to Sheet Music...'}
                </p>
                <div className="h-3 w-full overflow-hidden rounded-full border border-[#080808] bg-slate-100">
                  <div
                    className="h-full bg-[#3898EC] transition-[width] duration-200"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="font-mono text-xs font-bold text-slate-600 tabular-nums">
                  {progressPct}%
                </p>
              </div>
            </div>
          )}

          {result && !isTranscribing && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-[#2D40EA] tabular-nums">
                    Transcribed {result.quantizedNotesCount} notes ({result.rawEventsCount} detected onsets) ·{' '}
                    {result.exercise.timeSignature} · Key of {result.detectedKey} ·{' '}
                    {result.detectedBpm} BPM
                  </div>
                  <h3 className="font-display text-xl font-bold text-[#080808]">
                    {result.exercise.title}
                  </h3>
                  <p className="text-xs text-slate-700">{result.exercise.coachingTip}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAudition()}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-3.5 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {isAuditioning ? 'Playing...' : 'Hear Transcribed Sheet'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadFile(
                        result.musicXml,
                        `${result.exercise.title.replace(/\s+/g, '_').toLowerCase()}.musicxml`,
                        'application/vnd.recordare.musicxml+xml'
                      )
                    }
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    MusicXML
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadFile(
                        result.abcNotation,
                        `${result.exercise.title.replace(/\s+/g, '_').toLowerCase()}.abc`,
                        'text/plain'
                      )
                    }
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    ABC
                  </button>
                </div>
              </div>

              <SheetMusicViewer exercise={result.exercise} activeNoteIndex={-1} interactive />

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onStartExercise(result.exercise)}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-5 py-2.5 text-sm font-bold text-[#080808] shadow-[3px_3px_0_#080808] cursor-pointer transition-transform hover:-translate-y-0.5"
                >
                  <Play className="h-4 w-4" />
                  Practice All 4 Activities Now!
                </button>

                {onSaveExercise && (
                  <button
                    type="button"
                    disabled={isSaving || savedNotice}
                    onClick={() => void handleSave()}
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
      )}
    </div>
  );
}
