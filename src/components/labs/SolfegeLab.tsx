import { useCallback, useEffect, useState } from 'react';
import { Award, Mic, MicOff, Volume2 } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';
import { midiToFreq, midiToNoteName } from '../../utils/notationParser';

interface SolfegeLabProps {
  onAwardXp: (xp: number, label: string) => void;
}

type DrillType = 'harmonic-intervals' | 'progressions' | 'rhythm-dictation' | 'sing-interval';

const INTERVAL_DRILLS = [
  { label: 'Major 3rd (Do–Mi)', semitones: 4 },
  { label: 'Perfect 4th (Do–Fa)', semitones: 5 },
  { label: 'Perfect 5th (Do–So)', semitones: 7 },
  { label: 'Major 6th (Do–La)', semitones: 9 },
  { label: 'Octave (Do–Do)', semitones: 12 },
];

const PROGRESSION_DRILLS = [
  { label: 'I – IV – V – I (Classic Cadence)', chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]] },
  { label: 'I – V – vi – IV (Pop Loop)', chords: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]] },
  { label: 'ii – V – I (Jazz Turnaround)', chords: [[2, 5, 9], [7, 11, 14], [0, 4, 7]] },
  { label: 'I – vi – IV – V (50s Doo-Wop)', chords: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]] },
];

const RHYTHM_PATTERNS = [
  { label: 'Four-on-the-Floor', steps: [1, 0, 1, 0, 1, 0, 1, 0] },
  { label: 'Syncopated Clave', steps: [1, 0, 0, 1, 0, 0, 1, 0] },
  { label: 'March Pickup', steps: [1, 0, 1, 1, 1, 0, 1, 0] },
];

export function SolfegeLab({ onAwardXp }: SolfegeLabProps) {
  const [drill, setDrill] = useState<DrillType>('harmonic-intervals');
  const [rootMidi, setRootMidi] = useState<number>(60);
  const [targetIdx, setTargetIdx] = useState<number>(2);
  const [userRhythm, setUserRhythm] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const [feedback, setFeedback] = useState<string>('Choose a drill and click Play Prompt to begin independent Solfège training.');
  const [stats, setStats] = useState<{ attempts: number; hits: number }>({ attempts: 0, hits: 0 });
  const [micActive, setMicActive] = useState<boolean>(false);
  const [detectedNote, setDetectedNote] = useState<string>('--');

  useEffect(() => {
    return () => {
      audioEngine.stopMicrophone();
    };
  }, []);

  const playCurrentPrompt = useCallback(
    async (nextDrill?: DrillType, nextIdx?: number, nextRoot?: number) => {
      const d = nextDrill || drill;
      const idx = nextIdx ?? targetIdx;
      const root = nextRoot ?? rootMidi;
      await audioEngine.ensureToneReady();

      if (d === 'harmonic-intervals' || d === 'sing-interval') {
        const item = INTERVAL_DRILLS[idx % INTERVAL_DRILLS.length];
        audioEngine.playNote(midiToFreq(root), 0.55, 0.78);
        if (d === 'harmonic-intervals') {
          // Harmonic simultaneous sound after melodic cue
          window.setTimeout(() => {
            audioEngine.playNote(midiToFreq(root), 0.7, 0.7);
            audioEngine.playNote(midiToFreq(root + item.semitones), 0.7, 0.7);
          }, 550);
        }
      } else if (d === 'progressions') {
        const prog = PROGRESSION_DRILLS[idx % PROGRESSION_DRILLS.length];
        prog.chords.forEach((chord, cIdx) => {
          window.setTimeout(() => {
            for (const s of chord) {
              audioEngine.playNote(midiToFreq(root + s), 0.55, 0.45);
            }
          }, cIdx * 640);
        });
      } else {
        const pat = RHYTHM_PATTERNS[idx % RHYTHM_PATTERNS.length];
        pat.steps.forEach((hit, stepIdx) => {
          if (hit) {
            window.setTimeout(() => {
              audioEngine.playMetronomeClick(stepIdx === 0);
            }, stepIdx * 240);
          }
        });
      }
    },
    [drill, rootMidi, targetIdx]
  );

  const nextExercise = (nextDrill?: DrillType) => {
    const d = nextDrill || drill;
    const len =
      d === 'progressions'
        ? PROGRESSION_DRILLS.length
        : d === 'rhythm-dictation'
        ? RHYTHM_PATTERNS.length
        : INTERVAL_DRILLS.length;
    const idx = Math.floor(Math.random() * len);
    const root = 60 + Math.floor(Math.random() * 5);
    setTargetIdx(idx);
    setRootMidi(root);
    setUserRhythm([0, 0, 0, 0, 0, 0, 0, 0]);
    if (d === 'sing-interval') {
      const targetItem = INTERVAL_DRILLS[idx];
      setFeedback(
        `Root played (${midiToNoteName(root)}). Turn on your Mic and sing a ${targetItem.label}!`
      );
    } else {
      setFeedback('Prompt played! Pick your answer below.');
    }
    void playCurrentPrompt(d, idx, root);
  };

  const toggleSingMic = async () => {
    if (micActive) {
      audioEngine.stopMicrophone();
      setMicActive(false);
      return;
    }
    const targetItem = INTERVAL_DRILLS[targetIdx % INTERVAL_DRILLS.length];
    const targetMidi = rootMidi + targetItem.semitones;
    try {
      await audioEngine.startMicrophone({
        tapThreshold: 0.08,
        onPitch: (reading) => {
          if (!reading) return;
          setDetectedNote(reading.noteName);
          if (Math.abs(reading.midi - targetMidi) <= 1 && Math.abs(reading.cents) <= 45) {
            audioEngine.stopMicrophone();
            setMicActive(false);
            setStats((s) => ({ attempts: s.attempts + 1, hits: s.hits + 1 }));
            setFeedback(`Solfège match! You sang ${targetItem.label} (${midiToNoteName(targetMidi)})! +20 XP`);
            onAwardXp(20, `GNU Solfege: ${targetItem.label}`);
          }
        },
      });
      setMicActive(true);
    } catch {
      setFeedback('Microphone access blocked. You can still practice Interval & Progression identification.');
    }
  };

  const checkAnswer = (guessIdx: number) => {
    const isHit = guessIdx === targetIdx;
    setStats((s) => ({
      attempts: s.attempts + 1,
      hits: s.hits + (isHit ? 1 : 0),
    }));
    if (isHit) {
      setFeedback('Exact match! +15 XP earned.');
      onAwardXp(15, 'GNU Solfege Drill');
    } else {
      const actual =
        drill === 'progressions'
          ? PROGRESSION_DRILLS[targetIdx].label
          : INTERVAL_DRILLS[targetIdx].label;
      setFeedback(`Not quite — correct answer was ${actual}. Replay to hear why!`);
    }
  };

  const checkRhythmDictation = () => {
    const target = RHYTHM_PATTERNS[targetIdx % RHYTHM_PATTERNS.length];
    const exact = target.steps.every((val, i) => val === userRhythm[i]);
    setStats((s) => ({ attempts: s.attempts + 1, hits: s.hits + (exact ? 1 : 0) }));
    if (exact) {
      setFeedback(`Spot-on Rhythm Dictation (${target.label})! +20 XP`);
      onAwardXp(20, 'GNU Solfege Rhythm Dictation');
    } else {
      setFeedback(`Close! Pattern was "${target.label}". Toggle the 8th-note steps and check again.`);
    }
  };

  const accuracyPct = stats.attempts > 0 ? Math.round((stats.hits / stats.attempts) * 100) : 100;

  return (
    <div className="rounded-3xl border-2 border-[#080808] bg-white p-6 shadow-[5px_5px_0_#080808] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#2D40EA]">
            <Award className="h-4 w-4 text-[#EC4899]" />
            <span>savannah.gnu.org/git/solfege.git</span>
            <span aria-hidden="true">·</span>
            <span>GNU Solfège Drill Trainer</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            GNU Solfège Independent Ear &amp; Singing Drills
          </h2>
          <p className="max-w-2xl text-xs font-medium text-slate-700">
            Practice harmonic intervals, chord progressions, 8-step rhythm dictation, and live Pitchy vocal interval singing independently.
          </p>
        </div>

        <div className="font-mono text-xs font-bold text-[#080808] tabular-nums">
          Accuracy: {accuracyPct}% ({stats.hits}/{stats.attempts})
        </div>
      </div>

      {/* Drill Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-1">
          {[
            { id: 'harmonic-intervals' as const, label: 'Harmonic Intervals' },
            { id: 'progressions' as const, label: 'Chord Progressions' },
            { id: 'rhythm-dictation' as const, label: 'Rhythm Dictation' },
            { id: 'sing-interval' as const, label: 'Sing the Interval (Mic)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setDrill(tab.id);
                nextExercise(tab.id);
              }}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                drill === tab.id
                  ? 'bg-[#EC4899] text-white border border-[#080808]'
                  : 'text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void playCurrentPrompt()}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-1.5 text-xs font-bold text-[#080808] cursor-pointer"
          >
            <Volume2 className="h-4 w-4" />
            Play Prompt
          </button>
          <button
            type="button"
            onClick={() => nextExercise()}
            className="min-h-[38px] rounded-xl border-2 border-[#080808] bg-white px-4 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            Next Question
          </button>
        </div>
      </div>

      {/* Drill Workspace */}
      {drill === 'harmonic-intervals' && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
          {INTERVAL_DRILLS.map((item, idx) => (
            <button
              key={item.label}
              type="button"
              onClick={() => checkAnswer(idx)}
              className="min-h-[50px] rounded-xl border-2 border-[#080808] bg-[#FFFDF4] px-3 py-2 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFD000]"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {drill === 'progressions' && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {PROGRESSION_DRILLS.map((item, idx) => (
            <button
              key={item.label}
              type="button"
              onClick={() => checkAnswer(idx)}
              className="min-h-[50px] rounded-xl border-2 border-[#080808] bg-[#FFFDF4] px-4 py-2 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFD000]"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {drill === 'rhythm-dictation' && (
        <div className="space-y-3">
          <div className="grid grid-cols-8 gap-2">
            {userRhythm.map((active, i) => (
              <button
                key={i}
                type="button"
                onClick={() =>
                  setUserRhythm((prev) => prev.map((v, idx) => (idx === i ? (v ? 0 : 1) : v)))
                }
                className={`min-h-[56px] rounded-xl border-2 border-[#080808] text-xs font-bold cursor-pointer ${
                  active ? 'bg-[#2D40EA] text-white' : 'bg-[#FFFDF4] text-[#080808]'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={checkRhythmDictation}
            className="min-h-[42px] rounded-xl border-2 border-[#080808] bg-emerald-500 px-5 py-2 text-xs font-bold text-white cursor-pointer"
          >
            Check Rhythm Dictation
          </button>
        </div>
      )}

      {drill === 'sing-interval' && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[#080808] bg-[#FFFDF4] p-4">
          <div className="space-y-1">
            <div className="text-sm font-bold text-[#080808]">
              Target: {INTERVAL_DRILLS[targetIdx % INTERVAL_DRILLS.length].label} above {midiToNoteName(rootMidi)}
            </div>
            <div className="font-mono text-xs text-slate-700">
              Live Mic Note Heard: {detectedNote}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void toggleSingMic()}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-[#080808] px-4 py-2 text-xs font-bold cursor-pointer ${
              micActive ? 'bg-[#3898EC] text-white' : 'bg-[#FFD000] text-[#080808]'
            }`}
          >
            {micActive ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            {micActive ? 'Listening... (Stop)' : 'Start Mic Check'}
          </button>
        </div>
      )}

      <div className="rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-4 py-2.5 text-xs font-bold text-[#080808]">
        {feedback}
      </div>
    </div>
  );
}
