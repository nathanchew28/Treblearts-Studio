import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Sparkles, Volume2 } from 'lucide-react';
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow';
import { audioEngine } from '../../utils/audioEngine';
import { midiToFreq, midiToNoteName } from '../../utils/notationParser';

interface MinuetLabProps {
  onAwardXp: (xp: number, label: string) => void;
}

type Category = 'intervals' | 'chords' | 'scales' | 'rhythm';

interface ExerciseDef {
  name: string;
  intervals: number[]; // semitone offsets from root, or beat offsets for rhythm
  isRhythm?: boolean;
}

const BANK: Record<Category, ExerciseDef[]> = {
  intervals: [
    { name: 'Minor 2nd', intervals: [0, 1] },
    { name: 'Major 2nd', intervals: [0, 2] },
    { name: 'Minor 3rd', intervals: [0, 3] },
    { name: 'Major 3rd', intervals: [0, 4] },
    { name: 'Perfect 4th', intervals: [0, 5] },
    { name: 'Perfect 5th', intervals: [0, 7] },
    { name: 'Octave', intervals: [0, 12] },
  ],
  chords: [
    { name: 'Major Triad', intervals: [0, 4, 7] },
    { name: 'Minor Triad', intervals: [0, 3, 7] },
    { name: 'Diminished Triad', intervals: [0, 3, 6] },
    { name: 'Augmented Triad', intervals: [0, 4, 8] },
    { name: 'Dominant 7th', intervals: [0, 4, 7, 10] },
  ],
  scales: [
    { name: 'Major Scale', intervals: [0, 2, 4, 5, 7, 9, 11, 12] },
    { name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10, 12] },
    { name: 'Dorian Mode', intervals: [0, 2, 3, 5, 7, 9, 10, 12] },
    { name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9, 12] },
    { name: 'Blues Scale', intervals: [0, 3, 5, 6, 7, 10, 12] },
  ],
  rhythm: [
    { name: 'Steady Quarters (4)', intervals: [0, 1, 2, 3], isRhythm: true },
    { name: 'Running Eighths', intervals: [0, 0.5, 1, 1.5, 2, 3], isRhythm: true },
    { name: 'Dotted March', intervals: [0, 1.5, 2, 3], isRhythm: true },
    { name: 'Syncopated Bounce', intervals: [0, 0.75, 1.5, 2.5, 3], isRhythm: true },
  ],
};

function midiToVex(midi: number): { key: string; acc?: string } {
  const n = midiToNoteName(midi);
  const m = n.match(/^([A-G])(#|b)?(\d)$/);
  if (!m) return { key: 'c/4' };
  return { key: `${m[1].toLowerCase()}${m[2] || ''}/${m[3]}`, acc: m[2] };
}

export function MinuetLab({ onAwardXp }: MinuetLabProps) {
  const [category, setCategory] = useState<Category>('intervals');
  const [rootMidi, setRootMidi] = useState<number>(60);
  const [target, setTarget] = useState<ExerciseDef>(BANK.intervals[3]);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>('Listen to the prompt and select the matching music theory answer.');
  const [correctCount, setCorrectCount] = useState<number>(0);

  const staffRef = useRef<HTMLDivElement | null>(null);

  const playExercise = useCallback(async (ex: ExerciseDef, root: number) => {
    await audioEngine.ensureToneReady();
    if (ex.isRhythm) {
      ex.intervals.forEach((beat, idx) => {
        window.setTimeout(() => {
          audioEngine.playMetronomeClick(idx === 0);
        }, beat * 520);
      });
    } else {
      ex.intervals.forEach((semi, idx) => {
        window.setTimeout(() => {
          audioEngine.playNote(midiToFreq(root + semi), 0.42, 0.78);
        }, idx * 360);
      });
    }
  }, []);

  const nextQuestion = useCallback(
    (cat?: Category) => {
      const c = cat || category;
      const pool = BANK[c];
      const nextEx = pool[Math.floor(Math.random() * pool.length)];
      const nextRoot = 60 + Math.floor(Math.random() * 5);
      setTarget(nextEx);
      setRootMidi(nextRoot);
      setRevealed(false);
      setFeedback(`New ${c.slice(0, -1)} prompt playing... listen closely!`);
      void playExercise(nextEx, nextRoot);
    },
    [category, playExercise]
  );

  // Render VexFlow staff when answer is revealed
  useEffect(() => {
    const el = staffRef.current;
    if (!el) return;
    el.innerHTML = '';
    if (!revealed || target.isRhythm) return;

    try {
      const renderer = new Renderer(el, Renderer.Backends.SVG);
      const width = Math.max(260, target.intervals.length * 46 + 80);
      renderer.resize(width, 120);
      const ctx = renderer.getContext();
      const stave = new Stave(10, 12, width - 20);
      stave.addClef('treble').setContext(ctx).draw();

      const staveNotes = target.intervals.map((semi) => {
        const { key, acc } = midiToVex(rootMidi + semi);
        const sn = new StaveNote({ keys: [key], duration: 'q' });
        if (acc) sn.addModifier(new Accidental(acc));
        sn.setStyle({ fillStyle: '#2D40EA', strokeStyle: '#2D40EA' });
        return sn;
      });
      const voice = new Voice({ numBeats: staveNotes.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
      voice.addTickables(staveNotes);
      new Formatter().joinVoices([voice]).format([voice], width - 85);
      voice.draw(ctx, stave);
    } catch {
      // Non-fatal
    }
  }, [revealed, rootMidi, target]);

  const handleGuess = (opt: ExerciseDef) => {
    setRevealed(true);
    if (opt.name === target.name) {
      setCorrectCount((c) => c + 1);
      setFeedback(`Correct! ${target.name} matched! +15 XP`);
      onAwardXp(15, `KDE Minuet: ${target.name}`);
    } else {
      setFeedback(`That was ${target.name} (you picked ${opt.name}). Replay or try the next one!`);
    }
  };

  return (
    <div className="rounded-3xl border-2 border-[#080808] bg-white p-6 shadow-[5px_5px_0_#080808] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#2D40EA]">
            <BookOpen className="h-4 w-4 text-[#EC4899]" />
            <span>invent.kde.org/education/minuet</span>
            <span aria-hidden="true">·</span>
            <span>Curriculum Ear Training</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            Minuet Ear Training &amp; Notation Studio
          </h2>
          <p className="max-w-2xl text-xs font-medium text-slate-700">
            Practice Intervals, Chords, Modal Scales, and Rhythm Patterns with automatic VexFlow visual score reveal after each guess.
          </p>
        </div>

        <div className="font-mono text-xs font-bold text-[#080808] tabular-nums">
          Correct Answers: {correctCount}
        </div>
      </div>

      {/* Category Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-1">
          {(['intervals', 'chords', 'scales', 'rhythm'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setCategory(cat);
                nextQuestion(cat);
              }}
              className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-bold capitalize cursor-pointer ${
                category === cat
                  ? 'bg-[#3898EC] text-white border border-[#080808]'
                  : 'text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void playExercise(target, rootMidi)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-2 text-xs font-bold text-[#080808] shadow-[2px_2px_0_#080808] cursor-pointer"
          >
            <Volume2 className="h-4 w-4" />
            Play Exercise
          </button>

          <button
            type="button"
            onClick={() => nextQuestion()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-4 py-2 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            <Sparkles className="h-4 w-4 text-[#EC4899]" />
            New Prompt
          </button>
        </div>
      </div>

      {/* Answer Buttons */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        {BANK[category].map((opt) => {
          const isTarget = revealed && opt.name === target.name;
          return (
            <button
              key={opt.name}
              type="button"
              onClick={() => handleGuess(opt)}
              className={`min-h-[48px] rounded-xl border-2 border-[#080808] px-3 py-2 text-xs font-bold cursor-pointer transition-transform hover:-translate-y-0.5 ${
                isTarget ? 'bg-emerald-500 text-white' : 'bg-[#FFFDF4] text-[#080808] hover:bg-[#FFD000]'
              }`}
            >
              {opt.name}
            </button>
          );
        })}
      </div>

      {/* Feedback & Visual Answer Staff */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[#080808] bg-[#FFF9D6] p-4">
        <p className="text-sm font-bold text-[#080808]">{feedback}</p>
        {revealed && !target.isRhythm && (
          <div ref={staffRef} className="overflow-x-auto rounded-xl border-2 border-[#080808] bg-white px-2" />
        )}
      </div>
    </div>
  );
}
