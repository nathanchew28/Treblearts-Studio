import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Hand, RotateCcw, Usb } from 'lucide-react';
import { Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow';
import { audioEngine } from '../../utils/audioEngine';
import { midiToFreq, midiToNoteName } from '../../utils/notationParser';

interface JalmusLabProps {
  onAwardXp: (xp: number, label: string) => void;
}

type JalmusMode = 'note-reading' | 'rhythm-reading';
type ClefScope = 'starter-treble' | 'treble-octave' | 'bass-octave';

const SCOPE_POOLS: Record<ClefScope, { clef: 'treble' | 'bass'; notes: { midi: number; label: string; vex: string }[] }> = {
  'starter-treble': {
    clef: 'treble',
    notes: [
      { midi: 60, label: 'C4', vex: 'c/4' },
      { midi: 62, label: 'D4', vex: 'd/4' },
      { midi: 64, label: 'E4', vex: 'e/4' },
      { midi: 65, label: 'F4', vex: 'f/4' },
      { midi: 67, label: 'G4', vex: 'g/4' },
    ],
  },
  'treble-octave': {
    clef: 'treble',
    notes: [
      { midi: 60, label: 'C4', vex: 'c/4' },
      { midi: 62, label: 'D4', vex: 'd/4' },
      { midi: 64, label: 'E4', vex: 'e/4' },
      { midi: 65, label: 'F4', vex: 'f/4' },
      { midi: 67, label: 'G4', vex: 'g/4' },
      { midi: 69, label: 'A4', vex: 'a/4' },
      { midi: 71, label: 'B4', vex: 'b/4' },
      { midi: 72, label: 'C5', vex: 'c/5' },
    ],
  },
  'bass-octave': {
    clef: 'bass',
    notes: [
      { midi: 48, label: 'C3', vex: 'c/3' },
      { midi: 50, label: 'D3', vex: 'd/3' },
      { midi: 52, label: 'E3', vex: 'e/3' },
      { midi: 53, label: 'F3', vex: 'f/3' },
      { midi: 55, label: 'G3', vex: 'g/3' },
      { midi: 57, label: 'A3', vex: 'a/3' },
      { midi: 59, label: 'B3', vex: 'b/3' },
      { midi: 60, label: 'C4', vex: 'c/4' },
    ],
  },
};

const RHYTHM_MEASURES: { name: string; durations: ('h' | 'q' | '8')[]; beats: number[] }[] = [
  { name: 'Four Quarters', durations: ['q', 'q', 'q', 'q'], beats: [0, 1, 2, 3] },
  { name: 'Half + Two Quarters', durations: ['h', 'q', 'q'], beats: [0, 2, 3] },
  { name: 'Quarter + Two Eighths + Half', durations: ['q', '8', '8', 'h'], beats: [0, 1, 1.5, 2] },
];

export function JalmusLab({ onAwardXp }: JalmusLabProps) {
  const [mode, setMode] = useState<JalmusMode>('note-reading');
  const [scope, setScope] = useState<ClefScope>('starter-treble');
  const [queue, setQueue] = useState<{ midi: number; label: string; vex: string }[]>([]);
  const [cursor, setCursor] = useState<number>(0);
  const [rhythmIdx, setRhythmIdx] = useState<number>(0);
  const [rhythmTaps, setRhythmTaps] = useState<number[]>([]);
  const [score, setScore] = useState<{ hits: number; misses: number }>({ hits: 0, misses: 0 });
  const [feedback, setFeedback] = useState<string>('Read the highlighted staff note and play or click its name!');
  const [midiName, setMidiName] = useState<string | null>(null);

  const staffRef = useRef<HTMLDivElement | null>(null);
  const answerRef = useRef<(midi: number) => void>(() => {});

  const poolInfo = useMemo(() => SCOPE_POOLS[scope], [scope]);

  const generateQueue = useCallback(
    (nextScope?: ClefScope) => {
      const info = SCOPE_POOLS[nextScope || scope];
      const next: { midi: number; label: string; vex: string }[] = [];
      for (let i = 0; i < 6; i++) {
        next.push(info.notes[Math.floor(Math.random() * info.notes.length)]);
      }
      setQueue(next);
      setCursor(0);
    },
    [scope]
  );

  useEffect(() => {
    generateQueue();
  }, [generateQueue]);

  // Draw VexFlow staff
  useEffect(() => {
    const el = staffRef.current;
    if (!el) return;
    el.innerHTML = '';

    try {
      const renderer = new Renderer(el, Renderer.Backends.SVG);
      renderer.resize(560, 130);
      const ctx = renderer.getContext();
      const stave = new Stave(16, 14, 520);

      if (mode === 'note-reading') {
        stave.addClef(poolInfo.clef).setContext(ctx).draw();
        if (queue.length === 0) return;
        const notes = queue.map((item, idx) => {
          const sn = new StaveNote({ clef: poolInfo.clef, keys: [item.vex], duration: 'q' });
          if (idx === cursor) {
            sn.setStyle({ fillStyle: '#EC4899', strokeStyle: '#EC4899' });
          } else if (idx < cursor) {
            sn.setStyle({ fillStyle: '#10B981', strokeStyle: '#10B981' });
          } else {
            sn.setStyle({ fillStyle: '#080808', strokeStyle: '#080808' });
          }
          return sn;
        });
        const voice = new Voice({ numBeats: notes.length, beatValue: 4 }).setMode(Voice.Mode.SOFT);
        voice.addTickables(notes);
        new Formatter().joinVoices([voice]).format([voice], 430);
        voice.draw(ctx, stave);
      } else {
        stave.addClef('percussion').addTimeSignature('4/4').setContext(ctx).draw();
        const meas = RHYTHM_MEASURES[rhythmIdx % RHYTHM_MEASURES.length];
        const notes = meas.durations.map((dur, idx) => {
          const sn = new StaveNote({ clef: 'percussion', keys: ['b/4'], duration: dur });
          const tapped = idx < rhythmTaps.length;
          sn.setStyle({
            fillStyle: tapped ? '#10B981' : idx === rhythmTaps.length ? '#2D40EA' : '#080808',
            strokeStyle: tapped ? '#10B981' : idx === rhythmTaps.length ? '#2D40EA' : '#080808',
          });
          return sn;
        });
        const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT);
        voice.addTickables(notes);
        new Formatter().joinVoices([voice]).format([voice], 420);
        voice.draw(ctx, stave);
      }
    } catch {
      // Safe fallback
    }
  }, [cursor, mode, poolInfo.clef, queue, rhythmIdx, rhythmTaps.length]);

  const handleNoteInput = useCallback(
    (midi: number) => {
      void audioEngine.ensureToneReady().then(() => {
        audioEngine.playNote(midiToFreq(midi), 0.3, 0.8);
      });
      if (mode !== 'note-reading' || queue.length === 0) return;
      const target = queue[cursor];
      if (!target) return;

      if (midi === target.midi || midi % 12 === target.midi % 12) {
        const nextCursor = cursor + 1;
        setScore((s) => ({ hits: s.hits + 1, misses: s.misses }));
        if (nextCursor >= queue.length) {
          setFeedback('6-note sight-reading line cleared! +25 XP');
          onAwardXp(25, 'Jalmus Sight-Reading Line');
          generateQueue();
        } else {
          setCursor(nextCursor);
          setFeedback(`Matched ${target.label}! Keep reading across the bar.`);
        }
      } else {
        setScore((s) => ({ hits: s.hits, misses: s.misses + 1 }));
        setFeedback(`That was ${midiToNoteName(midi)} — look at the pink note (${target.label}).`);
      }
    },
    [cursor, generateQueue, mode, onAwardXp, queue]
  );

  answerRef.current = handleNoteInput;

  const handleTapRhythm = () => {
    void audioEngine.ensureToneReady().then(() => audioEngine.playMetronomeClick(true));
    const meas = RHYTHM_MEASURES[rhythmIdx % RHYTHM_MEASURES.length];
    const nextLen = rhythmTaps.length + 1;
    if (nextLen >= meas.durations.length) {
      setRhythmTaps([]);
      setRhythmIdx((r) => (r + 1) % RHYTHM_MEASURES.length);
      setScore((s) => ({ hits: s.hits + 1, misses: s.misses }));
      setFeedback(`Rhythm measure "${meas.name}" completed! +15 XP`);
      onAwardXp(15, 'Jalmus Rhythm Reading');
    } else {
      setRhythmTaps((prev) => [...prev, Date.now()]);
      setFeedback(`Tapped note ${nextLen} of ${meas.durations.length} (${meas.name})`);
    }
  };

  const connectMidi = async () => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<{
        inputs: Map<string, { name?: string; onmidimessage: ((evt: { data: Uint8Array | null }) => void) | null }>;
      }>;
    };
    if (!nav.requestMIDIAccess) return;
    try {
      const access = await nav.requestMIDIAccess();
      let name = 'MIDI Device';
      access.inputs.forEach((inp) => {
        if (inp.name) name = inp.name;
        inp.onmidimessage = (evt) => {
          if (!evt.data || evt.data.length < 3) return;
          if ((evt.data[0] & 0xf0) === 0x90 && evt.data[2] > 0) {
            answerRef.current(evt.data[1]);
          }
        };
      });
      setMidiName(name);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="rounded-3xl border-2 border-[#080808] bg-white p-6 shadow-[5px_5px_0_#080808] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#2D40EA]">
            <Eye className="h-4 w-4 text-[#EC4899]" />
            <span>sourceforge.net/projects/jalmus</span>
            <span aria-hidden="true">·</span>
            <span>Progressive Staff &amp; Rhythm Reading</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            Jalmus Note &amp; Rhythm Sight-Reading Trainer
          </h2>
          <p className="max-w-2xl text-xs font-medium text-slate-700">
            Start with 5 starter notes on Treble Clef, expand to full Treble or Bass Clef octaves, or switch to percussion Rhythm Reading.
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
            {midiName ? `MIDI: ${midiName}` : 'Connect MIDI'}
          </button>

          <div className="font-mono text-xs font-bold text-[#080808] tabular-nums">
            Hits: {score.hits} · Misses: {score.misses}
          </div>
        </div>
      </div>

      {/* Mode & Clef Scope */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-1">
          <button
            type="button"
            onClick={() => setMode('note-reading')}
            className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
              mode === 'note-reading' ? 'bg-[#FFD000] text-[#080808] border border-[#080808]' : 'text-[#080808]'
            }`}
          >
            Note Sight-Reading
          </button>
          <button
            type="button"
            onClick={() => setMode('rhythm-reading')}
            className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
              mode === 'rhythm-reading' ? 'bg-[#FFD000] text-[#080808] border border-[#080808]' : 'text-[#080808]'
            }`}
          >
            Rhythm Reading
          </button>
        </div>

        {mode === 'note-reading' && (
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'starter-treble' as const, label: 'Starter 5 Notes (C4–G4)' },
              { id: 'treble-octave' as const, label: 'Treble Octave (C4–C5)' },
              { id: 'bass-octave' as const, label: 'Bass Clef (C3–C4)' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setScope(s.id);
                  generateQueue(s.id);
                }}
                className={`min-h-[36px] rounded-xl border-2 border-[#080808] px-3 py-1 text-xs font-bold cursor-pointer ${
                  scope === s.id ? 'bg-[#3898EC] text-white' : 'bg-white text-[#080808]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Staff Container */}
      <div className="flex justify-center overflow-x-auto rounded-2xl border-2 border-[#080808] bg-[#FFFDF4] p-3">
        <div ref={staffRef} />
      </div>

      {/* Interactive Response Bar */}
      {mode === 'note-reading' ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {poolInfo.notes.map((n) => (
            <button
              key={n.label}
              type="button"
              onClick={() => handleNoteInput(n.midi)}
              className="min-h-[54px] min-w-[68px] rounded-xl border-2 border-[#080808] bg-[#FFFDF4] px-4 py-2 font-display text-sm font-bold text-[#080808] shadow-[2px_2px_0_#080808] cursor-pointer hover:bg-[#FFD000]"
            >
              {n.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => generateQueue()}
            className="inline-flex min-h-[54px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-4 py-2 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            <RotateCcw className="h-4 w-4" />
            New Line
          </button>
        </div>
      ) : (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleTapRhythm}
            className="inline-flex min-h-[56px] items-center gap-2 rounded-2xl border-2 border-[#080808] bg-[#EC4899] px-8 py-3 text-sm font-bold text-white shadow-[3px_3px_0_#080808] cursor-pointer"
          >
            <Hand className="h-5 w-5" />
            Tap Written Rhythm Beat
          </button>
        </div>
      )}

      <div className="rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-4 py-2.5 text-xs font-bold text-[#080808]">
        {feedback}
      </div>
    </div>
  );
}
