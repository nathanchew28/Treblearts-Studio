import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Piano, Play, RotateCcw, Square, Usb } from 'lucide-react';
import type { MusicExercise } from '../../types/music';
import { audioEngine } from '../../utils/audioEngine';
import { getNoteColorInfo } from '../../utils/kidFriendlyTheme';
import { midiToFreq, midiToNoteName } from '../../utils/notationParser';

interface PianoBoosterLabProps {
  exercises: MusicExercise[];
  onAwardXp: (xp: number, label: string) => void;
}

const KEYS = [
  { midi: 60, name: 'C4', sharp: false },
  { midi: 61, name: 'C#4', sharp: true },
  { midi: 62, name: 'D4', sharp: false },
  { midi: 63, name: 'D#4', sharp: true },
  { midi: 64, name: 'E4', sharp: false },
  { midi: 65, name: 'F4', sharp: false },
  { midi: 66, name: 'F#4', sharp: true },
  { midi: 67, name: 'G4', sharp: false },
  { midi: 68, name: 'G#4', sharp: true },
  { midi: 69, name: 'A4', sharp: false },
  { midi: 70, name: 'A#4', sharp: true },
  { midi: 71, name: 'B4', sharp: false },
  { midi: 72, name: 'C5', sharp: false },
];

export function PianoBoosterLab({ exercises, onAwardXp }: PianoBoosterLabProps) {
  const [selectedId, setSelectedId] = useState<string>(() => exercises[0]?.id || '');
  const [waitForNote, setWaitForNote] = useState<boolean>(true);
  const [handFilter, setHandFilter] = useState<'both' | 'right' | 'left'>('both');
  const [tempoPercent, setTempoPercent] = useState<number>(90);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [cursorIndex, setCursorIndex] = useState<number>(0);
  const [scoreStats, setScoreStats] = useState<{ hits: number; misses: number; timingText: string }>({
    hits: 0,
    misses: 0,
    timingText: 'Press Start Tutor and play each glowing note at the blue bar!',
  });
  const [midiName, setMidiName] = useState<string | null>(null);
  const [lastWrongMidi, setLastWrongMidi] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const noteInputRef = useRef<(midi: number) => void>(() => {});
  const autoTimerRef = useRef<number | null>(null);

  const activeExercise = useMemo(
    () => exercises.find((e) => e.id === selectedId) || exercises[0],
    [exercises, selectedId]
  );

  const playableNotes = useMemo(() => {
    const raw = (activeExercise?.notes || []).slice(0, 40);
    return raw.map((n, idx) => ({
      ...n,
      idx,
      // Normalize octave into C4-C5 keyboard range for accessible playalong
      coachMidi: ((n.midi - 60) % 12 + 12) % 12 + 60,
    }));
  }, [activeExercise]);

  const filteredNotes = useMemo(() => {
    if (handFilter === 'both') return playableNotes;
    const targetHand = handFilter === 'right' ? 'right' : 'left';
    const subset = playableNotes.filter((n) => n.hand === targetHand);
    return subset.length > 0 ? subset : playableNotes;
  }, [handFilter, playableNotes]);

  const currentTarget = filteredNotes[cursorIndex] || null;

  const stopCoach = useCallback(() => {
    setIsPlaying(false);
    if (autoTimerRef.current !== null) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  const resetCoach = useCallback(() => {
    stopCoach();
    setCursorIndex(0);
    setLastWrongMidi(null);
    setScoreStats({
      hits: 0,
      misses: 0,
      timingText: 'Ready! Turn on Wait-for-Note so the score pauses until you play the right key.',
    });
  }, [stopCoach]);

  useEffect(() => {
    resetCoach();
  }, [selectedId, handFilter, resetCoach]);

  // Flow-along automatic advance when waitForNote is OFF
  useEffect(() => {
    if (!isPlaying || waitForNote || !currentTarget) return;
    const baseBpm = activeExercise?.bpm || 96;
    const msPerBeat = 60000 / (baseBpm * (tempoPercent / 100));
    const waitMs = Math.max(240, currentTarget.durationBeats * msPerBeat);

    autoTimerRef.current = window.setTimeout(() => {
      audioEngine.playNote(midiToFreq(currentTarget.coachMidi), 0.25, 0.35);
      setCursorIndex((prev) => {
        if (prev + 1 >= filteredNotes.length) {
          setIsPlaying(false);
          onAwardXp(30, 'PianoBooster Run');
          return prev;
        }
        return prev + 1;
      });
    }, waitMs);

    return () => {
      if (autoTimerRef.current !== null) window.clearTimeout(autoTimerRef.current);
    };
  }, [activeExercise?.bpm, currentTarget, filteredNotes.length, isPlaying, onAwardXp, tempoPercent, waitForNote]);

  // Render PianoBooster scrolling staff highway canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Cream background
    ctx.fillStyle = '#FFFDF4';
    ctx.fillRect(0, 0, w, h);

    // 5 staff lines
    const topLineY = 58;
    const gap = 16;
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const y = topLineY + i * gap;
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
    }

    // Ledger line for C4
    const c4Y = topLineY + 5 * gap;
    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(150, c4Y);
    ctx.lineTo(210, c4Y);
    ctx.stroke();

    // Blue target play line
    const hitX = 180;
    ctx.strokeStyle = '#2D40EA';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(hitX, 24);
    ctx.lineTo(hitX, h - 22);
    ctx.stroke();

    // Map MIDI 60..72 smoothly onto staff Y
    const midiToY = (midi: number) => {
      const semitoneStep = midi - 60;
      return c4Y - semitoneStep * 5.3;
    };

    const currentBeat = currentTarget?.beatStart ?? 0;
    const pxPerBeat = 88;

    for (let i = Math.max(0, cursorIndex - 3); i < Math.min(filteredNotes.length, cursorIndex + 10); i++) {
      const n = filteredNotes[i];
      const x = hitX + (n.beatStart - currentBeat) * pxPerBeat;
      if (x < 30 || x > w - 20) continue;
      const y = midiToY(n.coachMidi);
      const chroma = getNoteColorInfo(n.coachMidi);
      const isCurrent = i === cursorIndex;
      const isPassed = i < cursorIndex;

      ctx.beginPath();
      ctx.ellipse(x, y, isCurrent ? 14 : 11, isCurrent ? 10 : 8, -0.25, 0, Math.PI * 2);
      ctx.fillStyle = isPassed ? '#10B981' : isCurrent ? '#EC4899' : chroma.hex;
      ctx.fill();
      ctx.lineWidth = isCurrent ? 3 : 2;
      ctx.strokeStyle = '#080808';
      ctx.stroke();

      ctx.fillStyle = '#080808';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(midiToNoteName(n.coachMidi), x, y - 16);
    }
  }, [currentTarget, cursorIndex, filteredNotes]);

  const handlePlayKey = useCallback(
    (midi: number) => {
      void audioEngine.ensureToneReady().then(() => {
        audioEngine.playNote(midiToFreq(midi), 0.35, 0.85);
      });

      if (!isPlaying || !currentTarget) return;

      if (midi === currentTarget.coachMidi) {
        setLastWrongMidi(null);
        const nextIdx = cursorIndex + 1;
        if (nextIdx >= filteredNotes.length) {
          stopCoach();
          setScoreStats((s) => ({
            hits: s.hits + 1,
            misses: s.misses,
            timingText: 'Song completed! Fantastic accuracy with PianoBooster!',
          }));
          onAwardXp(45, 'PianoBooster Completion');
          void confetti({ particleCount: 55, spread: 70, origin: { y: 0.65 } });
        } else {
          setCursorIndex(nextIdx);
          setScoreStats((s) => ({
            hits: s.hits + 1,
            misses: s.misses,
            timingText: `Spot-on ${midiToNoteName(midi)}! Next note: ${midiToNoteName(
              filteredNotes[nextIdx].coachMidi
            )}`,
          }));
        }
      } else {
        setLastWrongMidi(midi);
        setScoreStats((s) => ({
          hits: s.hits,
          misses: s.misses + 1,
          timingText: `You played ${midiToNoteName(midi)} — waiting for ${midiToNoteName(
            currentTarget.coachMidi
          )}`,
        }));
      }
    },
    [cursorIndex, currentTarget, filteredNotes, isPlaying, onAwardXp, stopCoach]
  );

  noteInputRef.current = handlePlayKey;

  const connectMidi = async () => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<{
        inputs: Map<string, { name?: string; onmidimessage: ((evt: { data: Uint8Array | null }) => void) | null }>;
      }>;
    };
    if (!nav.requestMIDIAccess) {
      setScoreStats((s) => ({ ...s, timingText: 'Web MIDI needs Chrome/Edge desktop browser.' }));
      return;
    }
    try {
      const access = await nav.requestMIDIAccess();
      let name = 'MIDI Keyboard';
      access.inputs.forEach((inp) => {
        if (inp.name) name = inp.name;
        inp.onmidimessage = (evt) => {
          if (!evt.data || evt.data.length < 3) return;
          const status = evt.data[0];
          const note = evt.data[1];
          const vel = evt.data[2];
          if ((status & 0xf0) === 0x90 && vel > 0) {
            noteInputRef.current(((note - 60) % 12 + 12) % 12 + 60);
          }
        };
      });
      setMidiName(name);
    } catch {
      setScoreStats((s) => ({ ...s, timingText: 'MIDI permission cancelled.' }));
    }
  };

  return (
    <div className="rounded-3xl border-2 border-[#080808] bg-white p-6 shadow-[5px_5px_0_#080808] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#2D40EA]">
            <Piano className="h-4 w-4 text-[#EC4899]" />
            <span>pianobooster/PianoBooster</span>
            <span aria-hidden="true">·</span>
            <span>Wait-for-Note Interactive Piano Coach</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            PianoBooster Scrolling Staff &amp; Wait-Mode Tutor
          </h2>
          <p className="max-w-2xl text-xs font-medium text-slate-700">
            The scrolling music bar follows your playing and pauses cleanly on each target note until you play it correctly on screen or on a USB MIDI piano.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void connectMidi()}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#080808] px-3 py-1.5 text-xs font-bold cursor-pointer ${
              midiName ? 'bg-emerald-500 text-white' : 'bg-[#FFF9D6] text-[#080808]'
            }`}
          >
            <Usb className="h-3.5 w-3.5" />
            {midiName ? `MIDI: ${midiName}` : 'Connect MIDI Piano'}
          </button>

          <button
            type="button"
            onClick={() => {
              void audioEngine.ensureToneReady();
              setIsPlaying((p) => !p);
            }}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-1.5 text-xs font-bold text-[#080808] shadow-[2px_2px_0_#080808] cursor-pointer"
          >
            {isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {isPlaying ? 'Pause Tutor' : 'Start Tutor'}
          </button>

          <button
            type="button"
            onClick={resetCoach}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border-2 border-[#080808] bg-[#FFFDF4] p-4 md:grid-cols-4">
        <div>
          <label htmlFor="pb-song" className="mb-1 block text-xs font-bold text-[#080808]">
            Lesson Score
          </label>
          <select
            id="pb-song"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-2 text-xs font-bold text-[#080808]"
          >
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="pb-hands" className="mb-1 block text-xs font-bold text-[#080808]">
            Hand Focus
          </label>
          <select
            id="pb-hands"
            value={handFilter}
            onChange={(e) => setHandFilter(e.target.value as 'both' | 'right' | 'left')}
            className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-2 text-xs font-bold text-[#080808]"
          >
            <option value="both">Both Hands (Full Line)</option>
            <option value="right">Right Hand Melody Only</option>
            <option value="left">Left Hand Accompaniment Only</option>
          </select>
        </div>

        <div>
          <label htmlFor="pb-tempo" className="mb-1 block text-xs font-bold text-[#080808] tabular-nums">
            Flow Tempo: {tempoPercent}%
          </label>
          <input
            id="pb-tempo"
            type="range"
            min={50}
            max={130}
            value={tempoPercent}
            onChange={(e) => setTempoPercent(Number(e.target.value))}
            className="mt-2 w-full accent-[#2D40EA]"
          />
        </div>

        <div className="flex items-end">
          <label className="flex w-full items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-3 py-2 text-xs font-bold text-[#080808] cursor-pointer">
            <input
              type="checkbox"
              checked={waitForNote}
              onChange={(e) => setWaitForNote(e.target.checked)}
              className="h-4 w-4 accent-[#EC4899]"
            />
            Wait for Correct Note
          </label>
        </div>
      </div>

      {/* Scrolling Staff Canvas */}
      <div className="overflow-hidden rounded-2xl border-2 border-[#080808] bg-[#FFFDF4]">
        <canvas ref={canvasRef} width={960} height={190} className="h-[190px] w-full object-contain" />
      </div>

      {/* Feedback & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-4 py-2.5 text-xs font-bold text-[#080808]">
        <span>{scoreStats.timingText}</span>
        <span className="font-mono tabular-nums">
          Progress: {Math.min(cursorIndex + 1, filteredNotes.length)}/{filteredNotes.length} · Hits: {scoreStats.hits} · Corrections: {scoreStats.misses}
        </span>
      </div>

      {/* Interactive Piano Keyboard */}
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7 lg:grid-cols-[repeat(13,minmax(0,1fr))]">
        {KEYS.map((k) => {
          const chroma = getNoteColorInfo(k.midi);
          const isTarget = isPlaying && currentTarget?.coachMidi === k.midi;
          const isWrong = lastWrongMidi === k.midi;
          return (
            <button
              key={k.midi}
              type="button"
              onMouseDown={() => handlePlayKey(k.midi)}
              className={`flex min-h-[84px] flex-col items-center justify-end rounded-xl border-2 border-[#080808] px-1 py-2 text-center cursor-pointer transition-transform ${
                isTarget
                  ? 'ring-4 ring-[#EC4899] bg-[#FFD000] text-[#080808] -translate-y-1'
                  : isWrong
                  ? 'bg-[#FF6565] text-white'
                  : k.sharp
                  ? 'bg-[#080808] text-white'
                  : chroma.bgClass
              }`}
            >
              <span className="font-display text-xs font-bold">{chroma.solfege}</span>
              <span className="font-mono text-[10px] opacity-85">{k.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
