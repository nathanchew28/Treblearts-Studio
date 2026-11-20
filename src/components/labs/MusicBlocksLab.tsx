import { useEffect, useRef, useState } from 'react';
import {
  Blocks,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { MusicExercise } from '../../types/music';
import { audioEngine } from '../../utils/audioEngine';
import { getNoteColorInfo } from '../../utils/kidFriendlyTheme';
import { midiToFreq, parseAbcNotation } from '../../utils/notationParser';

type BlockKind = 'note' | 'rest' | 'chord' | 'drum' | 'turn';

interface MusicBlockItem {
  id: string;
  kind: BlockKind;
  midi: number;
  beats: number;
  turnDeg: number;
  label: string;
}

interface MusicBlocksLabProps {
  authorId: string;
  authorName: string;
  onLaunchAsExercise: (exercise: MusicExercise) => void;
}

const NOTE_CHOICES = [
  { midi: 60, name: 'Do (C4)', abc: 'C' },
  { midi: 62, name: 'Re (D4)', abc: 'D' },
  { midi: 64, name: 'Mi (E4)', abc: 'E' },
  { midi: 65, name: 'Fa (F4)', abc: 'F' },
  { midi: 67, name: 'Sol (G4)', abc: 'G' },
  { midi: 69, name: 'La (A4)', abc: 'A' },
  { midi: 71, name: 'Ti (B4)', abc: 'B' },
  { midi: 72, name: 'Do (C5)', abc: 'c' },
];

const INITIAL_BLOCKS: MusicBlockItem[] = [
  { id: 'mb_1', kind: 'note', midi: 60, beats: 1, turnDeg: 45, label: 'Play Do (C4)' },
  { id: 'mb_2', kind: 'note', midi: 64, beats: 1, turnDeg: 45, label: 'Play Mi (E4)' },
  { id: 'mb_3', kind: 'note', midi: 67, beats: 1, turnDeg: 45, label: 'Play Sol (G4)' },
  { id: 'mb_4', kind: 'turn', midi: 67, beats: 0, turnDeg: 90, label: 'Turtle Turn 90°' },
  { id: 'mb_5', kind: 'chord', midi: 60, beats: 2, turnDeg: 60, label: 'I Chord (C-E-G)' },
  { id: 'mb_6', kind: 'note', midi: 72, beats: 1, turnDeg: 45, label: 'Play High Do (C5)' },
  { id: 'mb_7', kind: 'drum', midi: 48, beats: 0.5, turnDeg: 30, label: 'Clap / Drum Accent' },
  { id: 'mb_8', kind: 'note', midi: 67, beats: 1, turnDeg: 45, label: 'Play Sol (G4)' },
];

function midiToAbcToken(midi: number): string {
  const found = NOTE_CHOICES.find((n) => n.midi === midi);
  return found ? found.abc : 'C';
}

export function MusicBlocksLab({
  authorId,
  authorName,
  onLaunchAsExercise,
}: MusicBlocksLabProps) {
  const [blocks, setBlocks] = useState<MusicBlockItem[]>(INITIAL_BLOCKS);
  const [repeatCount, setRepeatCount] = useState<number>(2);
  const [tempoBpm, setTempoBpm] = useState<number>(112);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeBlockIdx, setActiveBlockIdx] = useState<number>(-1);
  const [selectedMidi, setSelectedMidi] = useState<number>(60);
  const [selectedBeats, setSelectedBeats] = useState<number>(1);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopFlagRef = useRef<boolean>(false);

  const drawIdleTurtle = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255, 208, 0, 0.14)';
    ctx.lineWidth = 1;
    for (let x = 24; x < w; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 24; y < h; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Center turtle badge
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFD000';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  useEffect(() => {
    drawIdleTurtle();
    return () => {
      stopFlagRef.current = true;
    };
  }, []);

  const addBlock = (kind: BlockKind) => {
    const info = getNoteColorInfo(selectedMidi);
    const id = `mb_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    let label = '';
    let turnDeg = 45;
    let beats = selectedBeats;
    if (kind === 'note') {
      label = `Play ${info.solfege} (${info.letter}${selectedMidi >= 72 ? '5' : '4'})`;
    } else if (kind === 'rest') {
      label = `Rest (${beats} beat)`;
      turnDeg = 20;
    } else if (kind === 'chord') {
      label = `Chord on ${info.solfege}`;
      beats = Math.max(1, beats);
      turnDeg = 60;
    } else if (kind === 'drum') {
      label = 'Drum / Clap Beat';
      beats = 0.5;
      turnDeg = 30;
    } else {
      label = 'Turtle Turn 90°';
      beats = 0;
      turnDeg = 90;
    }

    setBlocks((prev) => [
      ...prev,
      { id, kind, midi: selectedMidi, beats, turnDeg, label },
    ]);
  };

  const moveBlock = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    setBlocks((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const stopPlayback = () => {
    stopFlagRef.current = true;
    setIsPlaying(false);
    setActiveBlockIdx(-1);
  };

  const runBlocksProgram = async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    if (blocks.length === 0) return;

    await audioEngine.ensureToneReady();
    stopFlagRef.current = false;
    setIsPlaying(true);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const w = canvas?.width || 420;
    const h = canvas?.height || 260;

    if (ctx) {
      drawIdleTurtle();
    }

    let tx = w / 2;
    let ty = h / 2;
    let angleRad = -Math.PI / 2;
    const secPerBeat = 60 / tempoBpm;

    for (let loop = 0; loop < repeatCount; loop++) {
      for (let i = 0; i < blocks.length; i++) {
        if (stopFlagRef.current) return;
        const blk = blocks[i];
        setActiveBlockIdx(i);

        const chroma = getNoteColorInfo(blk.midi);

        if (blk.kind === 'note') {
          audioEngine.playNote(midiToFreq(blk.midi), Math.max(0.15, blk.beats * secPerBeat * 0.9), 0.78);
        } else if (blk.kind === 'chord') {
          const base = midiToFreq(blk.midi);
          const third = midiToFreq(blk.midi + 4);
          const fifth = midiToFreq(blk.midi + 7);
          const dur = Math.max(0.25, blk.beats * secPerBeat * 0.9);
          audioEngine.playNote(base, dur, 0.55);
          audioEngine.playNote(third, dur, 0.45);
          audioEngine.playNote(fifth, dur, 0.45);
        } else if (blk.kind === 'drum') {
          audioEngine.playMetronomeClick(true);
        }

        // Advance turtle graphics synchronized to pitch & duration
        if (ctx) {
          if (blk.kind === 'turn') {
            angleRad += (blk.turnDeg * Math.PI) / 180;
          } else {
            const stepLen = 22 + blk.beats * 20;
            const nx = Math.max(18, Math.min(w - 18, tx + Math.cos(angleRad) * stepLen));
            const ny = Math.max(18, Math.min(h - 18, ty + Math.sin(angleRad) * stepLen));

            ctx.strokeStyle = blk.kind === 'drum' ? '#FFD000' : blk.kind === 'rest' ? 'rgba(255,255,255,0.2)' : chroma.hex;
            ctx.lineWidth = blk.kind === 'chord' ? 5 : 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(nx, ny);
            ctx.stroke();

            if (blk.kind !== 'rest') {
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(nx, ny, blk.kind === 'chord' ? 5 : 3.5, 0, Math.PI * 2);
              ctx.fill();
            }

            tx = nx;
            ty = ny;
            angleRad += ((blk.turnDeg + (blk.midi % 7) * 8) * Math.PI) / 180;
          }
        }

        const waitMs = Math.max(90, blk.beats * secPerBeat * 1000);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    setIsPlaying(false);
    setActiveBlockIdx(-1);
  };

  const exportToPracticeStage = () => {
    const tokens: string[] = [];
    for (let r = 0; r < repeatCount; r++) {
      for (const blk of blocks) {
        if (blk.kind === 'turn') continue;
        const eighths = Math.max(1, Math.round(blk.beats * 2));
        const durSuffix = eighths === 1 ? '' : String(eighths);
        if (blk.kind === 'rest') {
          tokens.push(`z${durSuffix}`);
        } else if (blk.kind === 'drum') {
          tokens.push(`C${durSuffix}`);
        } else if (blk.kind === 'chord') {
          const root = midiToAbcToken(blk.midi);
          tokens.push(`[${root}E G]${durSuffix}`.replace(/\s+/g, ''));
        } else {
          tokens.push(`${midiToAbcToken(blk.midi)}${durSuffix}`);
        }
      }
    }

    if (tokens.length === 0) return;

    const abc = `X:1
T:My Music Blocks Creation
C:Sugar Labs Music Blocks Lab
M:4/4
L:1/8
Q:1/4=${tempoBpm}
K:C
${tokens.join(' ')} |]`;

    const parsed = parseAbcNotation(abc);
    const exercise: MusicExercise = {
      id: `mb_ex_${Date.now()}`,
      authorId,
      authorName,
      title: parsed.title,
      composer: parsed.composer,
      sourceFormat: 'abc',
      notationText: parsed.notationText,
      bpm: tempoBpm,
      timeSignature: '4/4',
      keySignature: 'C',
      difficulty: 'Beginner',
      focus: 'Complete',
      coachingTip: 'This exercise came from your own Music Blocks stack! Clap the rhythm first, then play your pitches!',
      notes: parsed.notes,
      isPublic: false,
      playsCount: 0,
    };
    onLaunchAsExercise(exercise);
  };

  return (
    <div className="rounded-3xl border-2 border-[#080808] bg-white p-6 shadow-[5px_5px_0_#080808] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#2D40EA]">
            <Blocks className="h-4 w-4 text-[#EC4899]" />
            sugarlabs/musicblocks · Visual Block Coding + Turtle Art
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            Music Blocks Programmer &amp; Musical Turtle
          </h2>
          <p className="max-w-2xl text-xs font-medium text-slate-700">
            Snap pitch, rhythm, chord, and turtle-turn blocks together! Watch the turtle draw geometric music art while playing your composition—then convert your blocks into a playable 4-activity exercise.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runBlocksProgram()}
            className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-[#080808] px-4 py-2 text-xs font-bold shadow-[2px_2px_0_#080808] cursor-pointer ${
              isPlaying
                ? 'bg-[#FF6565] text-white'
                : 'bg-[#FFD000] text-[#080808] hover:bg-[#FEC700]'
            }`}
          >
            {isPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? 'Stop Turtle' : 'Run Music Blocks'}
          </button>

          <button
            type="button"
            onClick={exportToPracticeStage}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#EC4899] px-4 py-2 text-xs font-bold text-white shadow-[2px_2px_0_#080808] cursor-pointer hover:bg-[#2D40EA]"
          >
            <Sparkles className="h-4 w-4" />
            Practice My Blocks!
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Block Palette & Program Stack (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          {/* Block Builder Controls */}
          <div className="rounded-2xl border-2 border-[#080808] bg-[#FFFDF4] p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold text-[#080808]">
                Pitch:
                <select
                  value={selectedMidi}
                  onChange={(e) => setSelectedMidi(Number(e.target.value))}
                  className="ml-1.5 rounded-lg border-2 border-[#080808] bg-white px-2.5 py-1 text-xs font-bold"
                >
                  {NOTE_CHOICES.map((n) => (
                    <option key={n.midi} value={n.midi}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-[#080808]">
                Note Value:
                <select
                  value={selectedBeats}
                  onChange={(e) => setSelectedBeats(Number(e.target.value))}
                  className="ml-1.5 rounded-lg border-2 border-[#080808] bg-white px-2.5 py-1 text-xs font-bold"
                >
                  <option value={0.5}>Eighth (1/2 beat)</option>
                  <option value={1}>Quarter (1 beat)</option>
                  <option value={2}>Half (2 beats)</option>
                </select>
              </label>

              <label className="text-xs font-bold text-[#080808]">
                Loop:
                <select
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(Number(e.target.value))}
                  className="ml-1.5 rounded-lg border-2 border-[#080808] bg-[#FFD000] px-2.5 py-1 text-xs font-bold"
                >
                  <option value={1}>1× Once</option>
                  <option value={2}>2× Repeat</option>
                  <option value={4}>4× Repeat</option>
                </select>
              </label>

              <label className="text-xs font-bold text-[#080808] tabular-nums">
                BPM: {tempoBpm}
                <input
                  type="range"
                  min={60}
                  max={160}
                  value={tempoBpm}
                  onChange={(e) => setTempoBpm(Number(e.target.value))}
                  className="ml-2 w-24 accent-[#2D40EA]"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addBlock('note')}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-[#3898EC] px-3 py-1.5 text-xs font-bold text-white cursor-pointer hover:brightness-105"
              >
                <Plus className="h-3.5 w-3.5" /> Note Block
              </button>
              <button
                type="button"
                onClick={() => addBlock('chord')}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-[#2D40EA] px-3 py-1.5 text-xs font-bold text-white cursor-pointer hover:brightness-105"
              >
                <Plus className="h-3.5 w-3.5" /> Chord Block
              </button>
              <button
                type="button"
                onClick={() => addBlock('drum')}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FEC700]"
              >
                <Plus className="h-3.5 w-3.5" /> Drum Accent
              </button>
              <button
                type="button"
                onClick={() => addBlock('rest')}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white cursor-pointer hover:brightness-105"
              >
                <Plus className="h-3.5 w-3.5" /> Rest Block
              </button>
              <button
                type="button"
                onClick={() => addBlock('turn')}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-[#EC4899] px-3 py-1.5 text-xs font-bold text-white cursor-pointer hover:brightness-105"
              >
                <Plus className="h-3.5 w-3.5" /> Turtle Turn
              </button>
              <button
                type="button"
                onClick={() => setBlocks(INITIAL_BLOCKS)}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-slate-100"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          </div>

          {/* Snapped Block Stack */}
          <div className="space-y-2 rounded-2xl border-2 border-[#080808] bg-[#FFF9D6] p-4">
            <div className="flex items-center justify-between text-xs font-bold text-[#080808]">
              <span>Repeat Loop ({repeatCount}×) — Block Stack ({blocks.length} blocks)</span>
              <button
                type="button"
                onClick={() => setBlocks([])}
                className="text-xs font-bold text-[#FF6565] hover:underline cursor-pointer"
              >
                Clear All
              </button>
            </div>

            {blocks.length === 0 ? (
              <p className="py-6 text-center text-xs font-semibold text-slate-600">
                Click any colored block button above to start snapping your music program!
              </p>
            ) : (
              <div className="max-h-[250px] space-y-1.5 overflow-y-auto pr-1">
                {blocks.map((blk, idx) => {
                  const isActive = idx === activeBlockIdx;
                  const blockBg =
                    blk.kind === 'note'
                      ? 'bg-[#3898EC] text-white'
                      : blk.kind === 'chord'
                      ? 'bg-[#2D40EA] text-white'
                      : blk.kind === 'drum'
                      ? 'bg-[#FFD000] text-[#080808]'
                      : blk.kind === 'rest'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#EC4899] text-white';

                  return (
                    <div
                      key={blk.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border-2 border-[#080808] px-3 py-2 text-xs font-bold transition-transform ${blockBg} ${
                        isActive ? 'scale-[1.02] ring-2 ring-[#080808]' : ''
                      }`}
                    >
                      <span className="truncate">
                        {idx + 1}. {blk.label} {blk.beats > 0 ? `· ${blk.beats} beat` : ''}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveBlock(idx, -1)}
                          aria-label="Move block up"
                          className="rounded bg-white/25 p-1 hover:bg-white/40 cursor-pointer"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBlock(idx, 1)}
                          aria-label="Move block down"
                          className="rounded bg-white/25 p-1 hover:bg-white/40 cursor-pointer"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBlock(blk.id)}
                          aria-label="Delete block"
                          className="rounded bg-white/25 p-1 hover:bg-red-500 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Synchronized Musical Turtle Canvas (5 cols) */}
        <div className="space-y-3 lg:col-span-5">
          <div className="flex items-center justify-between text-xs font-bold text-[#080808]">
            <span>Musical Turtle Art Canvas</span>
            <button
              type="button"
              onClick={drawIdleTurtle}
              className="text-xs font-bold text-[#2D40EA] hover:underline cursor-pointer"
            >
              Clear Canvas
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border-2 border-[#080808] bg-[#0f172a] shadow-[4px_4px_0_#080808]">
            <canvas ref={canvasRef} width={460} height={310} className="block w-full h-auto" />
          </div>
          <p className="text-xs font-medium text-slate-600">
            Every pitch draws with its Do–Re–Mi rainbow color, chords paint bold strokes, and turns rotate the musical star pattern!
          </p>
        </div>
      </div>
    </div>
  );
}
