import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Ear, Music, Piano, Sparkles, Star, Usb, Volume2 } from 'lucide-react';
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow';
import { audioEngine } from '../../utils/audioEngine';
import { getNoteColorInfo } from '../../utils/kidFriendlyTheme';
import { midiToFreq, midiToNoteName } from '../../utils/notationParser';

interface MelodinoLabProps {
  onAwardXp: (xp: number, label: string) => void;
}

type QuestMode = 'ear' | 'sight-read' | 'echo';
type AgeTier = 'little' | 'explorer' | 'virtuoso';

interface MidiInputLike {
  name?: string;
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
}

interface MidiAccessLike {
  inputs: Map<string, MidiInputLike>;
  onstatechange: (() => void) | null;
}

const ALL_KEYS = [
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

function toVexKey(midi: number): { key: string; accidental?: string } {
  const full = midiToNoteName(midi);
  const match = full.match(/^([A-G])(#|b)?(\d)$/);
  if (!match) return { key: 'c/4' };
  return {
    key: `${match[1].toLowerCase()}${match[2] || ''}/${match[3]}`,
    accidental: match[2],
  };
}

export function MelodinoLab({ onAwardXp }: MelodinoLabProps) {
  const [questMode, setQuestMode] = useState<QuestMode>('ear');
  const [ageTier, setAgeTier] = useState<AgeTier>('little');
  const [targetSequence, setTargetSequence] = useState<number[]>([60]);
  const [echoIndex, setEchoIndex] = useState<number>(0);
  const [litKeyMidi, setLitKeyMidi] = useState<number | null>(null);
  const [pressedMidi, setPressedMidi] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string>('Tap Start Round to play with Petit Maestro!');
  const [streak, setStreak] = useState<number>(0);
  const [sessionStars, setSessionStars] = useState<number>(0);
  const [midiDeviceName, setMidiDeviceName] = useState<string | null>(null);
  const [midiStatus, setMidiStatus] = useState<string>('');

  const staffRef = useRef<HTMLDivElement | null>(null);
  const pressHandlerRef = useRef<(midi: number) => void>(() => {});

  const activePool = useMemo(() => {
    if (ageTier === 'little') {
      return ALL_KEYS.filter((k) => !k.sharp && k.midi <= 67);
    }
    if (ageTier === 'explorer') {
      return ALL_KEYS.filter((k) => !k.sharp);
    }
    return ALL_KEYS;
  }, [ageTier]);

  const playTargetSequence = useCallback(async (seq: number[], flashLed: boolean) => {
    await audioEngine.ensureToneReady();
    seq.forEach((m, idx) => {
      window.setTimeout(() => {
        audioEngine.playNote(midiToFreq(m), 0.45, 0.8);
        if (flashLed) {
          setLitKeyMidi(m);
          window.setTimeout(() => {
            setLitKeyMidi((prev) => (prev === m ? null : prev));
          }, 360);
        }
      }, idx * 480);
    });
  }, []);

  const startNewRound = useCallback(
    (nextMode?: QuestMode, nextTier?: AgeTier) => {
      const m = nextMode || questMode;
      const t = nextTier || ageTier;
      const pool =
        t === 'little'
          ? ALL_KEYS.filter((k) => !k.sharp && k.midi <= 67)
          : t === 'explorer'
          ? ALL_KEYS.filter((k) => !k.sharp)
          : ALL_KEYS;

      const seqLen = m === 'echo' ? (t === 'little' ? 3 : 4) : 1;
      const picked: number[] = [];
      for (let i = 0; i < seqLen; i++) {
        const rand = pool[Math.floor(Math.random() * pool.length)];
        picked.push(rand.midi);
      }
      setTargetSequence(picked);
      setEchoIndex(0);

      if (m === 'ear') {
        setFeedback('Listen closely! Which colorful piano key did Petit Maestro play?');
        void playTargetSequence(picked, false);
      } else if (m === 'sight-read') {
        setFeedback('Look at the musical staff card and tap the matching piano key!');
      } else {
        setFeedback(`Watch the ${picked.length} glowing LED keys and echo the melody back!`);
        void playTargetSequence(picked, true);
      }
    },
    [ageTier, playTargetSequence, questMode]
  );

  useEffect(() => {
    startNewRound();
  }, [startNewRound]);

  // Draw VexFlow sight-reading flashcard when in Sight-Read mode
  useEffect(() => {
    const el = staffRef.current;
    if (!el || questMode !== 'sight-read') return;
    el.innerHTML = '';
    const targetMidi = targetSequence[0] ?? 60;
    try {
      const renderer = new Renderer(el, Renderer.Backends.SVG);
      renderer.resize(220, 120);
      const ctx = renderer.getContext();
      const stave = new Stave(10, 12, 195);
      stave.addClef('treble').setContext(ctx).draw();
      const { key, accidental } = toVexKey(targetMidi);
      const sn = new StaveNote({ keys: [key], duration: 'w' });
      if (accidental) sn.addModifier(new Accidental(accidental));
      sn.setStyle({ fillStyle: '#2D40EA', strokeStyle: '#2D40EA' });
      const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT);
      voice.addTickables([sn]);
      new Formatter().joinVoices([voice]).format([voice], 120);
      voice.draw(ctx, stave);
    } catch {
      // Non-fatal fallback
    }
  }, [questMode, targetSequence]);

  const handleKeyPress = useCallback(
    (midi: number) => {
      void audioEngine.ensureToneReady().then(() => {
        audioEngine.playNote(midiToFreq(midi), 0.35, 0.8);
      });
      setPressedMidi(midi);
      window.setTimeout(() => {
        setPressedMidi((prev) => (prev === midi ? null : prev));
      }, 220);

      const expectedMidi = targetSequence[echoIndex];
      if (!expectedMidi) return;

      if (midi === expectedMidi) {
        const nextEcho = echoIndex + 1;
        if (nextEcho >= targetSequence.length) {
          const nextStreak = streak + 1;
          setStreak(nextStreak);
          setSessionStars((s) => s + 1);
          const chroma = getNoteColorInfo(midi);
          setFeedback(
            `Bravo! ${chroma.solfege} (${midiToNoteName(midi)}) matched! Streak: ${nextStreak}`
          );
          onAwardXp(questMode === 'echo' ? 25 : 15, 'Petit Maestro Quest');
          if (nextStreak % 3 === 0) {
            void confetti({ particleCount: 45, spread: 60, origin: { y: 0.7 } });
          }
          window.setTimeout(() => startNewRound(), 750);
        } else {
          setEchoIndex(nextEcho);
          setFeedback(`Great! ${nextEcho}/${targetSequence.length} — keep going!`);
        }
      } else {
        setStreak(0);
        const info = getNoteColorInfo(expectedMidi);
        setFeedback(
          questMode === 'ear'
            ? `Almost! Listen again—or try ${info.solfege} (${midiToNoteName(expectedMidi)}).`
            : `Look closely at the note! Hint: that note is ${info.solfege} (${midiToNoteName(expectedMidi)}).`
        );
      }
    },
    [echoIndex, onAwardXp, questMode, startNewRound, streak, targetSequence]
  );

  pressHandlerRef.current = handleKeyPress;

  // Hardware Web MIDI Keyboard & LED Controller connection (BuilderCed/melodino inspired)
  const connectHardwareMidi = async () => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MidiAccessLike>;
    };
    if (!nav.requestMIDIAccess) {
      setMidiStatus('Web MIDI is supported in Chrome/Edge desktop browsers. Use the colorful keys below!');
      return;
    }
    try {
      const access = await nav.requestMIDIAccess();
      const bindInputs = () => {
        const names: string[] = [];
        access.inputs.forEach((input) => {
          if (input.name) names.push(input.name);
          input.onmidimessage = (evt) => {
            if (!evt.data || evt.data.length < 3) return;
            const status = evt.data[0];
            const note = evt.data[1];
            const velocity = evt.data[2];
            const cmd = status & 0xf0;
            if (cmd === 0x90 && velocity > 0) {
              pressHandlerRef.current(note);
            }
          };
        });
        if (names.length > 0) {
          setMidiDeviceName(names[0]);
          setMidiStatus(`Connected to ${names[0]}! Play keys directly on your keyboard.`);
        } else {
          setMidiDeviceName(null);
          setMidiStatus('No USB/Bluetooth MIDI keyboard detected yet—plug in & retry.');
        }
      };
      bindInputs();
      access.onstatechange = bindInputs;
    } catch {
      setMidiStatus('MIDI permission declined. Tap the on-screen LED keys below to play!');
    }
  };

  return (
    <div className="rounded-3xl border-2 border-[#080808] bg-white p-6 shadow-[5px_5px_0_#080808] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#EC4899]">
            <Piano className="h-4 w-4 text-[#2D40EA]" />
            BuilderCed/melodino · Petit Maestro Ages 3–12+ Piano Quests
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            Melodino Light-Up Piano &amp; Ear Training Game
          </h2>
          <p className="max-w-2xl text-xs font-medium text-slate-700">
            Age-adaptive ear training, VexFlow staff sight-reading, LED melody echoes, and plug-and-play USB/Bluetooth MIDI keyboard support.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void connectHardwareMidi()}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#080808] px-3 py-1.5 text-xs font-bold cursor-pointer ${
              midiDeviceName ? 'bg-emerald-500 text-white' : 'bg-[#FFF9D6] text-[#080808]'
            }`}
          >
            <Usb className="h-3.5 w-3.5" />
            {midiDeviceName ? `MIDI: ${midiDeviceName}` : 'Connect USB / LED MIDI'}
          </button>

          <div className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-3 py-1.5 text-xs font-bold text-[#080808] tabular-nums">
            <Star className="h-3.5 w-3.5 text-[#EC4899]" />
            {sessionStars} Stars · {streak} Streak
          </div>
        </div>
      </div>

      {midiStatus && (
        <div className="rounded-xl border-2 border-[#080808] bg-[#FFFDF4] px-3.5 py-2 text-xs font-semibold text-[#080808]">
          {midiStatus}
        </div>
      )}

      {/* Age Tier & Quest Mode Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-1">
          {[
            { id: 'ear' as const, label: 'Ear Mystery Note', icon: Ear },
            { id: 'sight-read' as const, label: 'Staff Sight-Read', icon: Music },
            { id: 'echo' as const, label: 'LED Melody Echo', icon: Sparkles },
          ].map((q) => {
            const Icon = q.icon;
            const active = questMode === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setQuestMode(q.id);
                  startNewRound(q.id, ageTier);
                }}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${
                  active
                    ? 'bg-[#EC4899] text-white border border-[#080808]'
                    : 'text-[#080808] hover:bg-[#FFF9D6]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {q.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-1">
          {[
            { id: 'little' as const, label: 'Ages 3–6 (5 Keys)' },
            { id: 'explorer' as const, label: 'Ages 7–9 (Octave)' },
            { id: 'virtuoso' as const, label: 'Ages 10+ (Full)' },
          ].map((tier) => (
            <button
              key={tier.id}
              type="button"
              onClick={() => {
                setAgeTier(tier.id);
                startNewRound(questMode, tier.id);
              }}
              className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer ${
                ageTier === tier.id
                  ? 'bg-[#3898EC] text-white'
                  : 'text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              {tier.label}
            </button>
          ))}
        </div>
      </div>

      {/* Challenge Prompt Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[#080808] bg-[#FFF9D6] p-4">
        <div className="space-y-1">
          <div className="text-xs font-extrabold uppercase tracking-wide text-[#2D40EA]">
            Petit Maestro Challenge
          </div>
          <p className="font-display text-base font-bold text-[#080808]">{feedback}</p>
        </div>

        <div className="flex items-center gap-3">
          {questMode === 'sight-read' && (
            <div
              ref={staffRef}
              className="overflow-hidden rounded-xl border-2 border-[#080808] bg-white px-2"
            />
          )}

          {questMode !== 'sight-read' && (
            <button
              type="button"
              onClick={() => void playTargetSequence(targetSequence, questMode === 'echo')}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-2 text-xs font-bold text-[#080808] shadow-[2px_2px_0_#080808] cursor-pointer hover:bg-[#FEC700]"
            >
              <Volume2 className="h-4 w-4" />
              Replay Clue
            </button>
          )}

          <button
            type="button"
            onClick={() => startNewRound()}
            className="min-h-[42px] rounded-xl border-2 border-[#080808] bg-white px-4 py-2 text-xs font-bold text-[#080808] cursor-pointer hover:bg-slate-100"
          >
            New Note
          </button>
        </div>
      </div>

      {/* Illuminated Melodino LED Piano Keyboard */}
      <div
        className={`grid gap-2 ${
          ageTier === 'little'
            ? 'grid-cols-5'
            : ageTier === 'explorer'
            ? 'grid-cols-4 sm:grid-cols-8'
            : 'grid-cols-5 sm:grid-cols-7 lg:grid-cols-[repeat(13,minmax(0,1fr))]'
        }`}
      >
        {activePool.map((k) => {
          const chroma = getNoteColorInfo(k.midi);
          const isLit = litKeyMidi === k.midi;
          const isPressed = pressedMidi === k.midi;
          return (
            <button
              key={k.midi}
              type="button"
              onMouseDown={() => handleKeyPress(k.midi)}
              className={`flex min-h-[112px] flex-col items-center justify-between rounded-2xl border-2 border-[#080808] px-2 py-3 text-center cursor-pointer transition-transform ${
                isLit
                  ? 'ring-4 ring-[#FFD000] bg-[#FFD000] text-[#080808] scale-105 shadow-[0_0_20px_#FFD000]'
                  : k.sharp
                  ? 'bg-[#080808] text-white'
                  : chroma.bgClass
              } ${isPressed ? 'scale-95 brightness-110' : 'hover:-translate-y-1 shadow-[2px_4px_0_#080808]'}`}
            >
              <span
                className={`h-3 w-3 rounded-full border border-[#080808] ${
                  isLit ? 'bg-[#EC4899] animate-ping' : 'bg-white/80'
                }`}
              />
              <div>
                <div className="font-display text-base font-bold leading-none">
                  {chroma.solfege}
                </div>
                <div className="mt-1 font-mono text-[11px] font-bold opacity-90">
                  {k.name}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
