import { useCallback, useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, Star, Volume2 } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';
import { getNoteColorInfo } from '../../utils/kidFriendlyTheme';
import { midiToFreq } from '../../utils/notationParser';

interface EagerEarLabProps {
  onAwardXp: (xp: number, label: string) => void;
}

type QuestType = 'leap' | 'mood' | 'dictation';

const DICTATION_NOTES = [
  { midi: 60, label: 'Do (C)' },
  { midi: 62, label: 'Re (D)' },
  { midi: 64, label: 'Mi (E)' },
  { midi: 65, label: 'Fa (F)' },
  { midi: 67, label: 'So (G)' },
];

export function EagerEarLab({ onAwardXp }: EagerEarLabProps) {
  const [quest, setQuest] = useState<QuestType>('leap');
  const [leapNotes, setLeapNotes] = useState<[number, number]>([60, 67]);
  const [isMajor, setIsMajor] = useState<boolean>(true);
  const [phrase, setPhrase] = useState<number[]>([60, 64, 67]);
  const [userPhrase, setUserPhrase] = useState<number[]>([]);
  const [streak, setStreak] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('Listen to the notes and solve the musical puzzle!');

  const playNotes = useCallback(async (midis: number[], simultaneous = false) => {
    await audioEngine.ensureToneReady();
    if (simultaneous) {
      for (const m of midis) {
        audioEngine.playNote(midiToFreq(m), 0.75, 0.55);
      }
      return;
    }
    midis.forEach((m, idx) => {
      window.setTimeout(() => {
        audioEngine.playNote(midiToFreq(m), 0.42, 0.8);
      }, idx * 420);
    });
  }, []);

  const newRound = useCallback(
    (nextQuest?: QuestType) => {
      const q = nextQuest || quest;
      if (q === 'leap') {
        const directions = ['up', 'down', 'same'] as const;
        const pick = directions[Math.floor(Math.random() * directions.length)];
        const base = 60 + Math.floor(Math.random() * 6);
        const second =
          pick === 'up' ? base + 5 : pick === 'down' ? base - 5 : base;
        setLeapNotes([base, second]);
        setFeedback('Did the second note jump Up Higher, Step Lower, or Stay the Same?');
        void playNotes([base, second]);
      } else if (q === 'mood') {
        const maj = Math.random() >= 0.45;
        setIsMajor(maj);
        setFeedback('Hear this chord! Does it sound Bright Major or Mystery Minor?');
        void playNotes(maj ? [60, 64, 67] : [60, 63, 67], true);
      } else {
        const nextPhrase = [0, 1, 2].map(
          () => DICTATION_NOTES[Math.floor(Math.random() * DICTATION_NOTES.length)].midi
        );
        setPhrase(nextPhrase);
        setUserPhrase([]);
        setFeedback('Hear the 3-note tune and tap the rainbow blocks in order!');
        void playNotes(nextPhrase);
      }
    },
    [playNotes, quest]
  );

  useEffect(() => {
    newRound();
  }, [newRound]);

  const celebrate = (msg: string) => {
    const nextStreak = streak + 1;
    setStreak(nextStreak);
    setFeedback(`${msg} +15 XP`);
    onAwardXp(15, 'Eager Ear Quest');
    if (nextStreak % 3 === 0) {
      void confetti({ particleCount: 45, spread: 60, origin: { y: 0.7 } });
    }
    window.setTimeout(() => newRound(), 750);
  };

  const handleLeapGuess = (guess: 'up' | 'down' | 'same') => {
    const actual = leapNotes[1] > leapNotes[0] ? 'up' : leapNotes[1] < leapNotes[0] ? 'down' : 'same';
    if (guess === actual) {
      celebrate('Great listening!');
    } else {
      setStreak(0);
      setFeedback(`Good try! Actually it went ${actual.toUpperCase()}. Click Replay Clue to hear again!`);
    }
  };

  const handleMoodGuess = (guessMajor: boolean) => {
    if (guessMajor === isMajor) {
      celebrate(isMajor ? 'Sunny Major detected!' : 'Mystery Minor detected!');
    } else {
      setStreak(0);
      setFeedback(`Close! That chord was ${isMajor ? 'Bright Major' : 'Mystery Minor'}.`);
    }
  };

  const handleTapDictation = (midi: number) => {
    void audioEngine.ensureToneReady().then(() => audioEngine.playNote(midiToFreq(midi), 0.3, 0.8));
    const idx = userPhrase.length;
    if (midi === phrase[idx]) {
      const updated = [...userPhrase, midi];
      setUserPhrase(updated);
      if (updated.length >= phrase.length) {
        celebrate('Melody Dictation solved!');
      } else {
        setFeedback(`Nice! Note ${updated.length}/${phrase.length} matched!`);
      }
    } else {
      setStreak(0);
      setUserPhrase([]);
      setFeedback('Oops! Try listening again from Note 1.');
    }
  };

  return (
    <div className="rounded-3xl border-2 border-[#080808] bg-white p-6 shadow-[5px_5px_0_#080808] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#EC4899]">
            <Sparkles className="h-4 w-4 text-[#2D40EA]" />
            <span>tgoze/eager-ear</span>
            <span aria-hidden="true">·</span>
            <span>Kids Ages 8–12 Aural Adventure</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            Eager Ear Musical Listening Quests
          </h2>
          <p className="max-w-2xl text-xs font-medium text-slate-700">
            Play playful listening puzzles built for young musicians: Pitch Jumps, Major vs. Minor Mood Detective, and 3-Note Melodic Dictation.
          </p>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-3 py-1.5 text-xs font-bold text-[#080808] tabular-nums">
          <Star className="h-3.5 w-3.5 text-[#EC4899]" />
          Streak: {streak}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-1">
          {[
            { id: 'leap' as const, label: '1. Up or Down Jump' },
            { id: 'mood' as const, label: '2. Major vs. Minor Mood' },
            { id: 'dictation' as const, label: '3. Melody Dictation' },
          ].map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => {
                setQuest(q.id);
                newRound(q.id);
              }}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                quest === q.id ? 'bg-[#EC4899] text-white border border-[#080808]' : 'text-[#080808]'
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            if (quest === 'leap') void playNotes(leapNotes);
            else if (quest === 'mood') void playNotes(isMajor ? [60, 64, 67] : [60, 63, 67], true);
            else void playNotes(phrase);
          }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-2 text-xs font-bold text-[#080808] cursor-pointer"
        >
          <Volume2 className="h-4 w-4" />
          Replay Clue
        </button>
      </div>

      {quest === 'leap' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { id: 'up' as const, label: 'Jumped Higher', bg: 'bg-[#3898EC] text-white' },
            { id: 'same' as const, label: 'Stayed Same Pitch', bg: 'bg-[#FFD000] text-[#080808]' },
            { id: 'down' as const, label: 'Stepped Lower', bg: 'bg-[#EC4899] text-white' },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => handleLeapGuess(btn.id)}
              className={`min-h-[64px] rounded-2xl border-2 border-[#080808] px-4 py-3 font-display text-base font-bold shadow-[3px_3px_0_#080808] cursor-pointer hover:-translate-y-0.5 ${btn.bg}`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {quest === 'mood' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => handleMoodGuess(true)}
            className="min-h-[68px] rounded-2xl border-2 border-[#080808] bg-[#FFD000] px-4 py-3 font-display text-base font-bold text-[#080808] shadow-[3px_3px_0_#080808] cursor-pointer hover:-translate-y-0.5"
          >
            Bright &amp; Happy (Major)
          </button>
          <button
            type="button"
            onClick={() => handleMoodGuess(false)}
            className="min-h-[68px] rounded-2xl border-2 border-[#080808] bg-[#2D40EA] px-4 py-3 font-display text-base font-bold text-white shadow-[3px_3px_0_#080808] cursor-pointer hover:-translate-y-0.5"
          >
            Cool &amp; Mysterious (Minor)
          </button>
        </div>
      )}

      {quest === 'dictation' && (
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-2">
            {DICTATION_NOTES.map((n) => {
              const chroma = getNoteColorInfo(n.midi);
              return (
                <button
                  key={n.midi}
                  type="button"
                  onClick={() => handleTapDictation(n.midi)}
                  className={`min-h-[64px] rounded-2xl border-2 border-[#080808] px-2 py-3 font-display text-sm font-bold shadow-[3px_3px_0_#080808] cursor-pointer hover:-translate-y-0.5 ${chroma.bgClass}`}
                >
                  {n.label}
                </button>
              );
            })}
          </div>
          <div className="font-mono text-xs font-bold text-[#2D40EA]">
            Notes Entered: {userPhrase.length}/3
          </div>
        </div>
      )}

      <div className="rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-4 py-2.5 text-xs font-bold text-[#080808]">
        {feedback}
      </div>
    </div>
  );
}
