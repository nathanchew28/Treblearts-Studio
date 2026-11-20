import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Grid3X3,
  Mic,
  MicOff,
  Music2,
  Play,
  RotateCcw,
  Sparkles,
  Square,
} from 'lucide-react';
import type { MusicExercise } from '../../types/music';
import { audioEngine } from '../../utils/audioEngine';
import { getNoteColorInfo } from '../../utils/kidFriendlyTheme';
import { midiToFreq, parseAbcNotation } from '../../utils/notationParser';

interface ChromeMusicLabSuiteProps {
  authorId: string;
  authorName: string;
  onLaunchAsExercise: (exercise: MusicExercise) => void;
}

type LabExperiment = 'song-maker' | 'spectrogram' | 'chords';

// 1 octave + top C (top row = C5 down to bottom row = C4)
const GRID_PITCHES = [
  { midi: 72, label: 'Do (C5)', abc: 'c' },
  { midi: 71, label: 'Ti (B4)', abc: 'B' },
  { midi: 69, label: 'La (A4)', abc: 'A' },
  { midi: 67, label: 'Sol (G4)', abc: 'G' },
  { midi: 65, label: 'Fa (F4)', abc: 'F' },
  { midi: 64, label: 'Mi (E4)', abc: 'E' },
  { midi: 62, label: 'Re (D4)', abc: 'D' },
  { midi: 60, label: 'Do (C4)', abc: 'C' },
];

const STEPS = 16;

const CHORD_BUTTONS = [
  { name: 'C Major (I)', notes: [60, 64, 67], color: 'bg-[#FFD000] text-[#080808]' },
  { name: 'F Major (IV)', notes: [65, 69, 72], color: 'bg-[#3898EC] text-white' },
  { name: 'G Major (V)', notes: [67, 71, 74], color: 'bg-[#EC4899] text-white' },
  { name: 'A Minor (vi)', notes: [69, 72, 76], color: 'bg-[#2D40EA] text-white' },
  { name: 'D Minor (ii)', notes: [62, 65, 69], color: 'bg-emerald-500 text-white' },
  { name: 'G7 Dominant', notes: [59, 65, 67], color: 'bg-orange-500 text-white' },
];

function createStarterGrid(): boolean[][] {
  const g = Array.from({ length: GRID_PITCHES.length }, () =>
    Array<boolean>(STEPS).fill(false)
  );
  // Cheerful arpeggio melody starter
  const starterPairs: [number, number][] = [
    [7, 0],
    [5, 2],
    [3, 4],
    [0, 6],
    [3, 8],
    [5, 10],
    [6, 12],
    [7, 14],
  ];
  for (const [row, col] of starterPairs) {
    if (g[row]) g[row][col] = true;
  }
  return g;
}

export function ChromeMusicLabSuite({
  authorId,
  authorName,
  onLaunchAsExercise,
}: ChromeMusicLabSuiteProps) {
  const [experiment, setExperiment] = useState<LabExperiment>('song-maker');
  const [grid, setGrid] = useState<boolean[][]>(() => createStarterGrid());
  const [drums, setDrums] = useState<[boolean[], boolean[]]>(() => [
    Array.from({ length: STEPS }, (_, i) => i % 2 === 1),
    Array.from({ length: STEPS }, (_, i) => i % 4 === 0),
  ]);
  const [bpm, setBpm] = useState<number>(112);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [playCol, setPlayCol] = useState<number>(-1);
  const [lastChordName, setLastChordName] = useState<string>('Tap any chord card to hear its triad!');

  // Spectrogram mic state
  const [specMicOn, setSpecMicOn] = useState<boolean>(false);
  const [specError, setSpecError] = useState<string | null>(null);
  const specCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);

  const gridRef = useRef(grid);
  gridRef.current = grid;
  const drumsRef = useRef(drums);
  drumsRef.current = drums;

  useEffect(() => {
    return () => {
      if (loopTimerRef.current) window.clearInterval(loopTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Song Maker Loop Transport
  useEffect(() => {
    if (!isLooping) {
      if (loopTimerRef.current) {
        window.clearInterval(loopTimerRef.current);
        loopTimerRef.current = null;
      }
      setPlayCol(-1);
      return;
    }

    let col = 0;
    const stepMs = Math.round((60 / bpm / 2) * 1000); // 8th-note steps

    const tick = () => {
      const c = col;
      setPlayCol(c);
      const currentGrid = gridRef.current;
      for (let r = 0; r < GRID_PITCHES.length; r++) {
        if (currentGrid[r]?.[c]) {
          audioEngine.playNote(midiToFreq(GRID_PITCHES[r].midi), Math.max(0.18, (stepMs / 1000) * 1.4), 0.65);
        }
      }
      if (drumsRef.current[0][c]) {
        audioEngine.playMetronomeClick(true);
      } else if (drumsRef.current[1][c]) {
        audioEngine.playMetronomeClick(false);
      }
      col = (col + 1) % STEPS;
    };

    tick();
    loopTimerRef.current = window.setInterval(tick, stepMs);
    return () => {
      if (loopTimerRef.current) {
        window.clearInterval(loopTimerRef.current);
        loopTimerRef.current = null;
      }
    };
  }, [isLooping, bpm]);

  // Spectrogram scrolling visualizer loop
  useEffect(() => {
    if (experiment !== 'spectrogram') return;
    let raf = 0;
    const freqData = new Uint8Array(256);

    const drawSpec = () => {
      const canvas = specCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          // Shift existing canvas left by 2px
          const prev = ctx.getImageData(2, 0, w - 2, h);
          ctx.putImageData(prev, 0, 0);
          ctx.fillStyle = '#090d16';
          ctx.fillRect(w - 2, 0, 2, h);

          if (analyserRef.current && specMicOn) {
            analyserRef.current.getByteFrequencyData(freqData);
            const bins = 96;
            const binH = h / bins;
            for (let b = 0; b < bins; b++) {
              const mag = freqData[b] || 0;
              if (mag < 12) continue;
              const hue = Math.round(210 - (mag / 255) * 185);
              ctx.fillStyle = `hsl(${hue}, 95%, ${Math.min(68, 20 + mag / 4)}%)`;
              ctx.fillRect(w - 2, h - (b + 1) * binH, 2, binH + 0.5);
            }
          }
        }
      }
      raf = requestAnimationFrame(drawSpec);
    };

    const canvas = specCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    raf = requestAnimationFrame(drawSpec);
    return () => cancelAnimationFrame(raf);
  }, [experiment, specMicOn]);

  const toggleSpectrogramMic = async () => {
    setSpecError(null);
    if (specMicOn) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setSpecMicOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = audioCtxRef.current || new AudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      setSpecMicOn(true);
    } catch {
      setSpecError('Microphone access is needed for live spectrogram visualization.');
    }
  };

  const toggleCell = async (r: number, c: number) => {
    const nextVal = !grid[r][c];
    setGrid((prev) =>
      prev.map((row, ri) =>
        ri === r ? row.map((v, ci) => (ci === c ? nextVal : v)) : row
      )
    );
    if (nextVal) {
      await audioEngine.ensureToneReady();
      audioEngine.playNote(midiToFreq(GRID_PITCHES[r].midi), 0.28, 0.72);
    }
  };

  const toggleDrum = async (rowIdx: 0 | 1, colIdx: number) => {
    const nextVal = !drums[rowIdx][colIdx];
    setDrums((prev) => {
      const copy: [boolean[], boolean[]] = [[...prev[0]], [...prev[1]]];
      copy[rowIdx][colIdx] = nextVal;
      return copy;
    });
    if (nextVal) {
      await audioEngine.ensureToneReady();
      audioEngine.playMetronomeClick(rowIdx === 0);
    }
  };

  const playChord = async (chord: (typeof CHORD_BUTTONS)[number]) => {
    await audioEngine.ensureToneReady();
    setLastChordName(
      `${chord.name} · Notes: ${chord.notes.map((m) => getNoteColorInfo(m).letter).join(' + ')}`
    );
    chord.notes.forEach((m, idx) => {
      window.setTimeout(() => {
        audioEngine.playNote(midiToFreq(m), 0.75, 0.55);
      }, idx * 45);
    });
  };

  const exportSongMakerToPractice = () => {
    const tokens: string[] = [];
    for (let c = 0; c < STEPS; c++) {
      const activePitches: string[] = [];
      for (let r = GRID_PITCHES.length - 1; r >= 0; r--) {
        if (grid[r]?.[c]) activePitches.push(GRID_PITCHES[r].abc);
      }
      if (activePitches.length === 0) {
        tokens.push('z');
      } else if (activePitches.length === 1) {
        tokens.push(activePitches[0]);
      } else {
        tokens.push(`[${activePitches.join('')}]`);
      }
    }
    const abc = `X:1
T:Song Maker Rainbow Loop
C:Chrome Music Lab
M:4/4
L:1/8
Q:1/4=${bpm}
K:C
${tokens.slice(0, 8).join(' ')} | ${tokens.slice(8, 16).join(' ')} |]`;

    const parsed = parseAbcNotation(abc);
    onLaunchAsExercise({
      id: `cml_${Date.now()}`,
      authorId,
      authorName,
      title: parsed.title,
      composer: parsed.composer,
      sourceFormat: 'abc',
      notationText: parsed.notationText,
      bpm,
      timeSignature: '4/4',
      keySignature: 'C',
      difficulty: 'Beginner',
      focus: 'Complete',
      coachingTip: 'Practice the exact melody you painted in the Song Maker Rainbow Grid!',
      notes: parsed.notes,
      isPublic: false,
      playsCount: 0,
    });
  };

  return (
    <div className="rounded-3xl border-2 border-[#080808] bg-white p-6 shadow-[5px_5px_0_#080808] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#3898EC]">
            <Grid3X3 className="h-4 w-4 text-[#EC4899]" />
            googlecreativelab/chrome-music-lab · Interactive Web Experiments
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            Chrome Music Lab Suite
          </h2>
          <p className="max-w-2xl text-xs font-medium text-slate-700">
            Paint looping melodies on the rainbow Song Maker Grid, inspect live microphone soundwaves in the Spectrogram, and hear stacked Major/Minor triads in Chords.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-1">
          {[
            { id: 'song-maker' as const, label: 'Song Maker Grid', icon: Grid3X3 },
            { id: 'spectrogram' as const, label: 'Live Spectrogram', icon: Activity },
            { id: 'chords' as const, label: 'Chords Explorer', icon: Music2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = experiment === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setExperiment(tab.id)}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#FFD000] text-[#080808] border border-[#080808]'
                    : 'text-slate-700 hover:bg-[#FFF9D6]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Experiment 1: Song Maker Grid */}
      {experiment === 'song-maker' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  void audioEngine.ensureToneReady().then(() => setIsLooping((p) => !p));
                }}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border-2 border-[#080808] px-4 py-1.5 text-xs font-bold shadow-[2px_2px_0_#080808] cursor-pointer ${
                  isLooping ? 'bg-[#FF6565] text-white' : 'bg-[#FFD000] text-[#080808]'
                }`}
              >
                {isLooping ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {isLooping ? 'Stop Loop' : 'Play Loop'}
              </button>

              <button
                type="button"
                onClick={() => setGrid(createStarterGrid())}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Starter Pattern
              </button>

              <button
                type="button"
                onClick={() =>
                  setGrid(
                    Array.from({ length: GRID_PITCHES.length }, () =>
                      Array<boolean>(STEPS).fill(false)
                    )
                  )
                }
                className="min-h-[40px] rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFDEDE]"
              >
                Clear Grid
              </button>

              <label className="text-xs font-bold text-[#080808] tabular-nums">
                Tempo: {bpm} BPM
                <input
                  type="range"
                  min={70}
                  max={160}
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="ml-2 w-24 accent-[#EC4899]"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={exportSongMakerToPractice}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#3898EC] px-4 py-1.5 text-xs font-bold text-white shadow-[2px_2px_0_#080808] cursor-pointer hover:bg-[#2D40EA]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Practice Grid as Song!
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border-2 border-[#080808] bg-[#FFFDF4] p-3">
            <div className="min-w-[640px] space-y-1">
              {GRID_PITCHES.map((rowPitch, r) => {
                const chroma = getNoteColorInfo(rowPitch.midi);
                return (
                  <div key={rowPitch.midi} className="grid grid-cols-[72px_repeat(16,1fr)] gap-1">
                    <div className="flex items-center text-[11px] font-bold text-[#080808] pr-1">
                      {rowPitch.label}
                    </div>
                    {Array.from({ length: STEPS }, (_, c) => {
                      const active = grid[r]?.[c] ?? false;
                      const isPlayhead = playCol === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => void toggleCell(r, c)}
                          aria-label={`${rowPitch.label} beat ${c + 1}`}
                          style={active ? { backgroundColor: chroma.hex } : undefined}
                          className={`h-7 rounded-md border transition-transform cursor-pointer ${
                            active
                              ? 'border-[#080808] scale-[0.98]'
                              : isPlayhead
                              ? 'border-[#080808] bg-[#FFD000]/55'
                              : c % 4 === 0
                              ? 'border-slate-300 bg-white'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        />
                      );
                    })}
                  </div>
                );
              })}

              {/* 2-Row Percussion Track */}
              <div className="mt-2 border-t-2 border-[#080808] pt-2 space-y-1">
                {(['High Clap', 'Low Drum'] as const).map((drumLabel, dIdx) => (
                  <div key={drumLabel} className="grid grid-cols-[72px_repeat(16,1fr)] gap-1">
                    <div className="flex items-center text-[11px] font-bold text-[#EC4899] pr-1">
                      {drumLabel}
                    </div>
                    {Array.from({ length: STEPS }, (_, c) => {
                      const active = drums[dIdx as 0 | 1][c];
                      const isPlayhead = playCol === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => void toggleDrum(dIdx as 0 | 1, c)}
                          aria-label={`${drumLabel} beat ${c + 1}`}
                          className={`h-6 rounded-full border cursor-pointer ${
                            active
                              ? dIdx === 0
                                ? 'border-[#080808] bg-[#EC4899]'
                                : 'border-[#080808] bg-[#080808]'
                              : isPlayhead
                              ? 'border-[#080808] bg-[#FFD000]/55'
                              : 'border-slate-300 bg-white'
                          }`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Experiment 2: Live Spectrogram */}
      {experiment === 'spectrogram' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-700">
              Turn on your microphone and sing, whistle, clap, or play an instrument to paint live harmonic frequency bands across time!
            </p>
            <button
              type="button"
              onClick={() => void toggleSpectrogramMic()}
              className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border-2 border-[#080808] px-4 py-1.5 text-xs font-bold shadow-[2px_2px_0_#080808] cursor-pointer ${
                specMicOn ? 'bg-[#FF6565] text-white' : 'bg-[#FFD000] text-[#080808]'
              }`}
            >
              {specMicOn ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {specMicOn ? 'Stop Live Spectrogram' : 'Start Mic Spectrogram'}
            </button>
          </div>
          {specError && (
            <div className="rounded-xl border-2 border-[#080808] bg-[#FFDEDE] px-4 py-2.5 text-xs font-semibold text-[#080808]">
              {specError}
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border-2 border-[#080808] bg-[#090d16] shadow-[4px_4px_0_#080808]">
            <canvas ref={specCanvasRef} width={780} height={240} className="block w-full h-[240px]" />
          </div>
        </div>
      )}

      {/* Experiment 3: Chords Explorer */}
      {experiment === 'chords' && (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-4 py-3 text-sm font-bold text-[#080808]">
            {lastChordName}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {CHORD_BUTTONS.map((ch) => (
              <button
                key={ch.name}
                type="button"
                onClick={() => void playChord(ch)}
                className={`flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-[#080808] p-3 text-center shadow-[3px_3px_0_#080808] cursor-pointer transition-transform hover:-translate-y-0.5 active:scale-95 ${ch.color}`}
              >
                <span className="font-display text-sm font-bold">{ch.name}</span>
                <span className="font-mono text-[11px] opacity-90">
                  {ch.notes.map((n) => getNoteColorInfo(n).letter).join('–')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
