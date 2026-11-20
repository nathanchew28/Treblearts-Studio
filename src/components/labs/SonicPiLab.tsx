import { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { Code2, Play, RefreshCw, Square, Terminal } from 'lucide-react';
import type { MusicExercise } from '../../types/music';
import { midiToFreq, parseAbcNotation } from '../../utils/notationParser';

interface SonicPiLabProps {
  authorId: string;
  authorName: string;
  onLaunchAsExercise: (exercise: MusicExercise) => void;
}

interface ParsedPiStep {
  kind: 'note' | 'chord' | 'sample' | 'sleep';
  midis?: number[];
  sampleName?: string;
  beats: number;
  lineNum: number;
}

const NOTE_MAP: Record<string, number> = {
  c: 0,
  cs: 1,
  db: 1,
  d: 2,
  ds: 3,
  eb: 3,
  e: 4,
  f: 5,
  fs: 6,
  gb: 6,
  g: 7,
  gs: 8,
  ab: 8,
  a: 9,
  as: 10,
  bb: 10,
  b: 11,
};

function parseSonicNoteToken(tok: string): number {
  const clean = tok.trim().toLowerCase().replace(/^:/, '');
  if (/^\d+$/.test(clean)) return Math.max(36, Math.min(96, Number(clean)));
  const m = clean.match(/^([a-g][sb]?)(\d)?$/);
  if (!m) return 60;
  const semi = NOTE_MAP[m[1]] ?? 0;
  const oct = m[2] ? Number(m[2]) : 4;
  return 12 * (oct + 1) + semi;
}

function parseSonicPiScript(code: string): {
  bpm: number;
  synthType: 'triangle' | 'sawtooth' | 'square' | 'sine';
  steps: ParsedPiStep[];
  loopCount: number;
} {
  let bpm = 112;
  let synthType: 'triangle' | 'sawtooth' | 'square' | 'sine' = 'triangle';
  let loopCount = 0; // 0 means live_loop infinite
  const rawLines = code.split(/\r?\n/);

  const expandLines = (): { text: string; lineNum: number }[] => {
    const out: { text: string; lineNum: number }[] = [];
    let i = 0;
    while (i < rawLines.length) {
      const line = rawLines[i].trim();
      const timesMatch = line.match(/^(\d+)\.times\s+do$/);
      if (timesMatch) {
        const count = Math.min(8, Math.max(1, Number(timesMatch[1])));
        const inner: { text: string; lineNum: number }[] = [];
        i++;
        while (i < rawLines.length && rawLines[i].trim() !== 'end') {
          inner.push({ text: rawLines[i].trim(), lineNum: i + 1 });
          i++;
        }
        for (let r = 0; r < count; r++) {
          out.push(...inner);
        }
        i++;
        continue;
      }
      out.push({ text: line, lineNum: i + 1 });
      i++;
    }
    return out;
  };

  const lines = expandLines();
  const steps: ParsedPiStep[] = [];

  for (const { text, lineNum } of lines) {
    if (!text || text.startsWith('#')) continue;
    if (text.startsWith('live_loop')) {
      loopCount = 0;
      continue;
    }
    const bpmMatch = text.match(/^use_bpm\s+(\d+)/);
    if (bpmMatch) {
      bpm = Math.min(200, Math.max(50, Number(bpmMatch[1])));
      continue;
    }
    const synthMatch = text.match(/^use_synth\s+:(\w+)/);
    if (synthMatch) {
      const s = synthMatch[1].toLowerCase();
      if (s === 'saw' || s === 'prophet' || s === 'tb303') synthType = 'sawtooth';
      else if (s === 'square' || s === 'pulse' || s === 'chipbass') synthType = 'square';
      else if (s === 'sine' || s === 'pretty_bell') synthType = 'sine';
      else synthType = 'triangle';
      continue;
    }
    const chordMatch = text.match(/^play_chord\s+\[([^\]]+)\]/);
    if (chordMatch) {
      const midis = chordMatch[1]
        .split(',')
        .map((t) => parseSonicNoteToken(t))
        .slice(0, 6);
      steps.push({ kind: 'chord', midis, beats: 0, lineNum });
      continue;
    }
    const playMatch = text.match(/^play\s+(:?[a-gA-G][sb]?\d?|\d+)/);
    if (playMatch) {
      steps.push({ kind: 'note', midis: [parseSonicNoteToken(playMatch[1])], beats: 0, lineNum });
      continue;
    }
    const sampleMatch = text.match(/^sample\s+:(\w+)/);
    if (sampleMatch) {
      steps.push({ kind: 'sample', sampleName: sampleMatch[1].toLowerCase(), beats: 0, lineNum });
      continue;
    }
    const sleepMatch = text.match(/^sleep\s+(\d+(?:\.\d+)?)/);
    if (sleepMatch) {
      steps.push({
        kind: 'sleep',
        beats: Math.min(4, Math.max(0.125, Number(sleepMatch[1]))),
        lineNum,
      });
    }
  }

  return { bpm, synthType, steps, loopCount };
}

function midiToAbcToken(midi: number): string {
  const names = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
  const oct = Math.floor(midi / 12) - 1;
  const pc = names[((midi % 12) + 12) % 12];
  if (oct >= 5) {
    const prime = oct > 5 ? "'".repeat(oct - 5) : '';
    return `${pc.toLowerCase()}${prime}`;
  }
  const comma = oct < 4 ? ','.repeat(4 - oct) : '';
  return `${pc}${comma}`;
}

const STARTER_SCRIPTS: { name: string; code: string }[] = [
  {
    name: 'Sunny Pentatonic Loop',
    code: `# Sonic Pi Live Loop — Edit while playing!
use_bpm 116
use_synth :pretty_bell

live_loop :melody do
  sample :bd_haus
  play :c4
  sleep 0.5
  play :e4
  sleep 0.5
  sample :sn_dolf
  play :g4
  sleep 0.5
  play :a4
  sleep 0.5
  sample :bd_haus
  play :c5
  sleep 1
  sample :sn_dolf
  play :g4
  sleep 1
end`,
  },
  {
    name: 'Bassline + Drum Groove',
    code: `use_bpm 124
use_synth :saw

live_loop :groove do
  sample :bd_haus
  play :c3
  sleep 0.5
  sample :hat_snap
  play :c4
  sleep 0.5
  sample :sn_dolf
  play :eb3
  sleep 0.5
  sample :hat_snap
  play :g3
  sleep 0.5
  sample :bd_haus
  play_chord [:c4, :eb4, :g4]
  sleep 1
  sample :sn_dolf
  play :bb3
  sleep 1
end`,
  },
  {
    name: 'Chiptune Arpeggio',
    code: `use_bpm 132
use_synth :square

live_loop :arp do
  sample :bd_haus
  play :c5
  sleep 0.25
  play :e5
  sleep 0.25
  play :g5
  sleep 0.25
  play :b5
  sleep 0.25
  sample :sn_dolf
  play :a4
  sleep 0.5
  play :f4
  sleep 0.5
  play_chord [:g4, :b4, :d5]
  sleep 1
end`,
  },
];

export function SonicPiLab({ authorId, authorName, onLaunchAsExercise }: SonicPiLabProps) {
  const [code, setCode] = useState<string>(STARTER_SCRIPTS[0].code);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [statusLog, setStatusLog] = useState<string>('Ready. Write live code and click Run Loop!');

  const timerRef = useRef<number | null>(null);
  const parsedRef = useRef(parseSonicPiScript(STARTER_SCRIPTS[0].code));
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const kickRef = useRef<Tone.MembraneSynth | null>(null);
  const snareRef = useRef<Tone.NoiseSynth | null>(null);
  const hatRef = useRef<Tone.MetalSynth | null>(null);
  const runningRef = useRef<boolean>(false);

  const ensureSynths = async (oscType: 'triangle' | 'sawtooth' | 'square' | 'sine') => {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
    if (!synthRef.current) {
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: oscType },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.25, release: 0.4 },
        volume: -8,
      }).toDestination();
    } else {
      synthRef.current.set({ oscillator: { type: oscType } });
    }
    if (!kickRef.current) {
      kickRef.current = new Tone.MembraneSynth({ volume: -4 }).toDestination();
    }
    if (!snareRef.current) {
      snareRef.current = new Tone.NoiseSynth({
        envelope: { attack: 0.002, decay: 0.14, sustain: 0 },
        volume: -10,
      }).toDestination();
    }
    if (!hatRef.current) {
      hatRef.current = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.06, release: 0.02 },
        volume: -14,
      }).toDestination();
    }
  };

  const stopLoop = () => {
    runningRef.current = false;
    setIsRunning(false);
    setActiveLine(null);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatusLog('Stopped live loop.');
  };

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      synthRef.current?.dispose();
      kickRef.current?.dispose();
      snareRef.current?.dispose();
      hatRef.current?.dispose();
    };
  }, []);

  const scheduleStep = (idx: number) => {
    if (!runningRef.current) return;
    const { bpm, synthType, steps } = parsedRef.current;
    if (steps.length === 0) {
      stopLoop();
      return;
    }

    const safeIdx = idx % steps.length;
    const step = steps[safeIdx];
    setActiveLine(step.lineNum);
    const msPerBeat = 60000 / bpm;

    if (step.kind === 'note' && step.midis?.[0]) {
      synthRef.current?.set({ oscillator: { type: synthType } });
      synthRef.current?.triggerAttackRelease(midiToFreq(step.midis[0]), 0.3, undefined, 0.78);
    } else if (step.kind === 'chord' && step.midis?.length) {
      synthRef.current?.set({ oscillator: { type: synthType } });
      synthRef.current?.triggerAttackRelease(
        step.midis.map((m) => midiToFreq(m)),
        0.45,
        undefined,
        0.65
      );
    } else if (step.kind === 'sample') {
      if (step.sampleName?.includes('sn')) {
        snareRef.current?.triggerAttackRelease('16n');
      } else if (step.sampleName?.includes('hat')) {
        hatRef.current?.triggerAttackRelease('C6', '32n');
      } else {
        kickRef.current?.triggerAttackRelease('C2', '8n');
      }
    }

    const delayMs = step.kind === 'sleep' ? Math.max(40, step.beats * msPerBeat) : 5;
    timerRef.current = window.setTimeout(() => {
      scheduleStep(safeIdx + 1);
    }, delayMs);
  };

  const handleRunOrReload = async () => {
    const parsed = parseSonicPiScript(code);
    if (parsed.steps.length === 0) {
      setStatusLog('No playable commands found. Try play :c4, sample :bd_haus, and sleep 0.5');
      return;
    }
    parsedRef.current = parsed;
    await ensureSynths(parsed.synthType);
    setStatusLog(
      `Live loop running at ${parsed.bpm} BPM (${parsed.synthType} synth, ${parsed.steps.length} events).`
    );
    if (!runningRef.current) {
      runningRef.current = true;
      setIsRunning(true);
      scheduleStep(0);
    }
  };

  const exportToPractice = () => {
    const parsed = parseSonicPiScript(code);
    const tokens: string[] = [];
    let pendingBeats = 0;
    for (const s of parsed.steps) {
      if (s.kind === 'note' && s.midis?.[0]) {
        if (pendingBeats > 0 && tokens.length > 0) {
          const eighthLen = Math.max(1, Math.min(8, Math.round(pendingBeats * 2)));
          tokens[tokens.length - 1] = `${tokens[tokens.length - 1]}${eighthLen === 1 ? '' : eighthLen}`;
          pendingBeats = 0;
        }
        tokens.push(midiToAbcToken(s.midis[0]));
      } else if (s.kind === 'sleep') {
        pendingBeats += s.beats;
      }
    }
    if (tokens.length === 0) {
      tokens.push('C2', 'E2', 'G2', 'c2');
    }
    const abc = `X:1
T:My Sonic Pi Live Loop
C:${authorName} (Sonic Pi Synth)
M:4/4
L:1/8
Q:1/4=${parsed.bpm}
K:C
${tokens.slice(0, 24).join(' ')} |]`;
    const score = parseAbcNotation(abc);
    onLaunchAsExercise({
      id: `sonicpi_${Date.now()}`,
      authorId,
      authorName,
      title: 'My Sonic Pi Live Loop',
      composer: 'Sonic Pi Live Code Synth',
      sourceFormat: 'abc',
      notationText: score.notationText,
      bpm: parsed.bpm,
      timeSignature: '4/4',
      keySignature: 'C',
      difficulty: 'Intermediate',
      focus: 'Complete',
      coachingTip: 'Play back the live-coded synth melody you programmed in Sonic Pi!',
      notes: score.notes,
      isPublic: false,
      playsCount: 0,
    });
  };

  return (
    <div className="rounded-3xl border-2 border-[#080808] bg-white p-6 shadow-[5px_5px_0_#080808] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#EC4899]">
            <Code2 className="h-4 w-4 text-[#2D40EA]" />
            <span>sonic-pi-net/sonic-pi</span>
            <span aria-hidden="true">·</span>
            <span>Live Coding Music Synth</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            Sonic Pi Code-to-Music Studio
          </h2>
          <p className="max-w-2xl text-xs font-medium text-slate-700">
            Write real Ruby-style music code (play, play_chord, sample, sleep, use_bpm, use_synth) and hot-reload live while the beat keeps playing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRunOrReload()}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-2 text-xs font-bold text-[#080808] shadow-[2px_2px_0_#080808] cursor-pointer hover:bg-[#FEC700]"
          >
            {isRunning ? <RefreshCw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isRunning ? 'Hot-Reload Code' : 'Run Live Loop'}
          </button>

          {isRunning && (
            <button
              type="button"
              onClick={stopLoop}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#FF6565] px-4 py-2 text-xs font-bold text-white cursor-pointer"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          )}

          <button
            type="button"
            onClick={exportToPractice}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#2D40EA] px-4 py-2 text-xs font-bold text-white shadow-[2px_2px_0_#080808] cursor-pointer"
          >
            Practice Melody in Stage
          </button>
        </div>
      </div>

      {/* Preset Selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-[#080808]">Starter Loops:</span>
        {STARTER_SCRIPTS.map((script) => (
          <button
            key={script.name}
            type="button"
            onClick={() => {
              setCode(script.code);
              parsedRef.current = parseSonicPiScript(script.code);
              setStatusLog(`Loaded preset: ${script.name}`);
            }}
            className="min-h-[34px] rounded-xl border-2 border-[#080808] bg-[#FFFDF4] px-3 py-1 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFD000]"
          >
            {script.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={14}
            spellCheck={false}
            aria-label="Sonic Pi live code editor"
            className="w-full rounded-2xl border-2 border-[#080808] bg-[#080808] p-4 font-mono text-xs leading-relaxed text-[#FFD000] focus:outline-none"
          />
        </div>

        <div className="space-y-3 rounded-2xl border-2 border-[#080808] bg-[#FFFDF4] p-4 lg:col-span-4">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2D40EA]">
            <Terminal className="h-4 w-4" />
            Live Interpreter Log
          </div>
          <p className="rounded-xl border border-[#080808]/20 bg-white px-3 py-2 font-mono text-xs text-[#080808]">
            {statusLog}
            {activeLine ? ` (Line ${activeLine})` : ''}
          </p>

          <div className="space-y-1.5 text-xs text-slate-700">
            <div className="font-bold text-[#080808]">Supported Sonic Pi Commands:</div>
            <div className="font-mono text-[11px]">use_bpm 120</div>
            <div className="font-mono text-[11px]">use_synth :pretty_bell / :saw / :square</div>
            <div className="font-mono text-[11px]">play :c4 / :eb4 / :g5</div>
            <div className="font-mono text-[11px]">play_chord [:c4, :e4, :g4]</div>
            <div className="font-mono text-[11px]">sample :bd_haus / :sn_dolf / :hat_snap</div>
            <div className="font-mono text-[11px]">sleep 0.5</div>
          </div>
        </div>
      </div>
    </div>
  );
}
