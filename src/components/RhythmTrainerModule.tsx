import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Hand,
  Mic,
  MicOff,
  Play,
  RefreshCw,
  Repeat,
  RotateCcw,
  Square,
  Volume2,
} from 'lucide-react';
import type { PracticeAttempt } from '../types/music';
import { audioEngine } from '../utils/audioEngine';
import { parseBeatsPerBar } from './MetronomeWidget';

export interface RhythmHitTarget {
  id: string;
  beat: number; // 0-based beat offset inside the pattern
  label: string; // e.g. '1', '2', '&', '3', 'a'
  kind: 'quarter' | 'eighth' | 'syncopation' | 'dotted';
  status: 'pending' | 'perfect' | 'good' | 'missed';
  offsetMs?: number;
}

interface RhythmPatternPreset {
  id: string;
  name: string;
  level: 'Beginner' | 'Intermediate' | 'Challenge';
  beatsPerBar: number;
  bars: number;
  description: string;
  events: { beat: number; label: string; kind: RhythmHitTarget['kind'] }[];
}

const PRESET_PATTERNS: RhythmPatternPreset[] = [
  {
    id: 'steady_pulse',
    name: 'Steady Quarter Groove',
    level: 'Beginner',
    beatsPerBar: 4,
    bars: 2,
    description: 'Clap or knock cleanly on every main beat (1 · 2 · 3 · 4).',
    events: [
      { beat: 0, label: '1', kind: 'quarter' },
      { beat: 1, label: '2', kind: 'quarter' },
      { beat: 2, label: '3', kind: 'quarter' },
      { beat: 3, label: '4', kind: 'quarter' },
      { beat: 4, label: '1', kind: 'quarter' },
      { beat: 5, label: '2', kind: 'quarter' },
      { beat: 6, label: '3', kind: 'quarter' },
      { beat: 7, label: '4', kind: 'quarter' },
    ],
  },
  {
    id: 'eighth_subdivision',
    name: 'Eighth-Note Subdivision',
    level: 'Beginner',
    beatsPerBar: 4,
    bars: 2,
    description: 'Stay even between quarter beats and crisp "&" eighth-note pairs.',
    events: [
      { beat: 0, label: '1', kind: 'quarter' },
      { beat: 1, label: '2', kind: 'eighth' },
      { beat: 1.5, label: '&', kind: 'eighth' },
      { beat: 2, label: '3', kind: 'quarter' },
      { beat: 3, label: '4', kind: 'eighth' },
      { beat: 3.5, label: '&', kind: 'eighth' },
      { beat: 4, label: '1', kind: 'eighth' },
      { beat: 4.5, label: '&', kind: 'eighth' },
      { beat: 5, label: '2', kind: 'quarter' },
      { beat: 6, label: '3', kind: 'quarter' },
      { beat: 7, label: '4', kind: 'quarter' },
    ],
  },
  {
    id: 'syncopated_pop',
    name: 'Syncopated Pop Snap',
    level: 'Intermediate',
    beatsPerBar: 4,
    bars: 2,
    description: 'Catch the off-beat "&" anticipation before beat 3.',
    events: [
      { beat: 0, label: '1', kind: 'quarter' },
      { beat: 1, label: '2', kind: 'eighth' },
      { beat: 1.5, label: '&', kind: 'syncopation' },
      { beat: 2.5, label: '&', kind: 'syncopation' },
      { beat: 3, label: '4', kind: 'quarter' },
      { beat: 4, label: '1', kind: 'dotted' },
      { beat: 5.5, label: '&', kind: 'syncopation' },
      { beat: 6, label: '3', kind: 'quarter' },
      { beat: 7, label: '4', kind: 'quarter' },
    ],
  },
  {
    id: 'waltz_lilt',
    name: 'Waltz Triple Lilt (3/4)',
    level: 'Intermediate',
    beatsPerBar: 3,
    bars: 2,
    description: 'Feel the strong-weak-weak 3/4 waltz pulse with an eighth-note pickup.',
    events: [
      { beat: 0, label: '1', kind: 'quarter' },
      { beat: 1, label: '2', kind: 'quarter' },
      { beat: 2, label: '3', kind: 'eighth' },
      { beat: 2.5, label: '&', kind: 'eighth' },
      { beat: 3, label: '1', kind: 'dotted' },
      { beat: 4.5, label: '&', kind: 'syncopation' },
      { beat: 5, label: '3', kind: 'quarter' },
    ],
  },
  {
    id: 'dotted_sixteenth',
    name: 'Dotted & Sixteenth Drive',
    level: 'Challenge',
    beatsPerBar: 4,
    bars: 2,
    description: 'Tight dotted-eighth and sixteenth-note precision drill.',
    events: [
      { beat: 0, label: '1', kind: 'dotted' },
      { beat: 0.75, label: 'a', kind: 'syncopation' },
      { beat: 1, label: '2', kind: 'quarter' },
      { beat: 2, label: '3', kind: 'eighth' },
      { beat: 2.5, label: '&', kind: 'eighth' },
      { beat: 3.5, label: '&', kind: 'syncopation' },
      { beat: 4, label: '1', kind: 'quarter' },
      { beat: 5, label: '2', kind: 'eighth' },
      { beat: 5.5, label: '&', kind: 'eighth' },
      { beat: 6, label: '3', kind: 'dotted' },
      { beat: 6.75, label: 'a', kind: 'syncopation' },
      { beat: 7, label: '4', kind: 'quarter' },
    ],
  },
];

function createCustomGeneratedPattern(beatsPerBar: number): RhythmPatternPreset {
  const events: { beat: number; label: string; kind: RhythmHitTarget['kind'] }[] = [];
  for (let bar = 0; bar < 2; bar++) {
    const offset = bar * beatsPerBar;
    for (let b = 0; b < beatsPerBar; b++) {
      const roll = Math.random();
      if (b === 0 || roll < 0.45) {
        events.push({ beat: offset + b, label: String(b + 1), kind: 'quarter' });
      } else if (roll < 0.78) {
        events.push({ beat: offset + b, label: String(b + 1), kind: 'eighth' });
        events.push({ beat: offset + b + 0.5, label: '&', kind: 'eighth' });
      } else {
        events.push({ beat: offset + b + 0.5, label: '&', kind: 'syncopation' });
      }
    }
  }
  return {
    id: `custom_${Date.now()}`,
    name: `Generated ${beatsPerBar}/4 Sight-Rhythm`,
    level: 'Intermediate',
    beatsPerBar,
    bars: 2,
    description: 'Freshly generated 2-bar tap-to-rhythm drill matched to your meter.',
    events,
  };
}

interface TapSample {
  id: number;
  offsetMs: number; // negative = early, positive = late
  grade: 'perfect' | 'good' | 'offbeat';
}

interface RhythmTrainerModuleProps {
  bpm: number;
  timeSignature: string;
  metronomeClickOn: boolean;
  micEnabled: boolean;
  liveRms: number;
  tapThreshold: number;
  onToggleMic: () => void;
  onChangeTapThreshold: (val: number) => void;
  registerTransientHandler: (handler: ((rms: number, ts: number) => void) | null) => void;
  onCompleteDrillAttempt: (attempt: PracticeAttempt) => void;
}

export function RhythmTrainerModule({
  bpm,
  timeSignature,
  metronomeClickOn,
  micEnabled,
  liveRms,
  tapThreshold,
  onToggleMic,
  onChangeTapThreshold,
  registerTransientHandler,
  onCompleteDrillAttempt,
}: RhythmTrainerModuleProps) {
  const [patterns, setPatterns] = useState<RhythmPatternPreset[]>(PRESET_PATTERNS);
  const [selectedPatternId, setSelectedPatternId] = useState<string>(PRESET_PATTERNS[0].id);
  const [loopEnabled, setLoopEnabled] = useState<boolean>(false);
  const [isDrillRunning, setIsDrillRunning] = useState<boolean>(false);
  const [isDemoPlaying, setIsDemoPlaying] = useState<boolean>(false);
  const [countInRemaining, setCountInRemaining] = useState<number | null>(null);
  const [playheadBeat, setPlayheadBeat] = useState<number>(0);

  const [targets, setTargets] = useState<RhythmHitTarget[]>([]);
  const [recentOffsets, setRecentOffsets] = useState<TapSample[]>([]);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    text: string;
    detail: string;
    tone: 'perfect' | 'good' | 'warn';
  } | null>(null);
  const [summaryStats, setSummaryStats] = useState<{
    accuracy: number;
    avgOffsetMs: number;
    perfectCount: number;
    totalCount: number;
    xpEarned: number;
  } | null>(null);

  const selectedPattern = useMemo(
    () => patterns.find((p) => p.id === selectedPatternId) || patterns[0],
    [patterns, selectedPatternId]
  );

  const totalBeats = selectedPattern.beatsPerBar * selectedPattern.bars;
  const beatsPerSec = Math.max(30, Math.min(240, bpm)) / 60;

  const isDrillRunningRef = useRef<boolean>(false);
  const targetsRef = useRef<RhythmHitTarget[]>([]);
  const beatRef = useRef<number>(-selectedPattern.beatsPerBar);
  const lastFrameRef = useRef<number>(0);
  const lastMetronomeBeatRef = useRef<number>(-99);
  const loopCountRef = useRef<number>(0);
  const tapIdRef = useRef<number>(1);
  const demoTimersRef = useRef<number[]>([]);

  const rebuildTargets = useCallback((pat: RhythmPatternPreset): RhythmHitTarget[] => {
    const built: RhythmHitTarget[] = pat.events.map((ev, i) => ({
      id: `${pat.id}_${i}`,
      beat: ev.beat,
      label: ev.label,
      kind: ev.kind,
      status: 'pending',
    }));
    targetsRef.current = built;
    setTargets(built);
    return built;
  }, []);

  useEffect(() => {
    rebuildTargets(selectedPattern);
    setSummaryStats(null);
    setFeedbackBanner(null);
    setRecentOffsets([]);
    setPlayheadBeat(0);
  }, [selectedPattern, rebuildTargets]);

  const stopDemo = useCallback(() => {
    for (const tid of demoTimersRef.current) {
      window.clearTimeout(tid);
    }
    demoTimersRef.current = [];
    setIsDemoPlaying(false);
  }, []);

  const stopDrill = useCallback(() => {
    isDrillRunningRef.current = false;
    setIsDrillRunning(false);
    setCountInRemaining(null);
  }, []);

  useEffect(() => {
    return () => {
      stopDemo();
      stopDrill();
      registerTransientHandler(null);
    };
  }, [registerTransientHandler, stopDemo, stopDrill]);

  const playDemoPattern = useCallback(() => {
    stopDrill();
    stopDemo();
    void audioEngine.ensureToneReady().then(() => {
      setIsDemoPlaying(true);
      const msPerBeat = 60000 / Math.max(30, Math.min(240, bpm));
      const ids: number[] = [];

      // Play pattern events with gentle pitch accents
      selectedPattern.events.forEach((ev) => {
        const tid = window.setTimeout(() => {
          const isDownbeat = ev.beat % selectedPattern.beatsPerBar === 0;
          audioEngine.playNote(isDownbeat ? 659.25 : 523.25, 0.14, isDownbeat ? 0.75 : 0.55);
          setPlayheadBeat(ev.beat);
        }, ev.beat * msPerBeat);
        ids.push(tid);
      });

      const endTid = window.setTimeout(() => {
        setIsDemoPlaying(false);
        setPlayheadBeat(0);
      }, totalBeats * msPerBeat + 250);
      ids.push(endTid);
      demoTimersRef.current = ids;
    });
  }, [bpm, selectedPattern, stopDemo, stopDrill, totalBeats]);

  const finishDrillPass = useCallback(() => {
    isDrillRunningRef.current = false;
    setIsDrillRunning(false);
    setCountInRemaining(null);

    const evaluated = targetsRef.current.map((t) =>
      t.status === 'pending' ? { ...t, status: 'missed' as const } : t
    );
    targetsRef.current = evaluated;
    setTargets(evaluated);

    const total = evaluated.length;
    const hits = evaluated.filter((t) => t.status === 'perfect' || t.status === 'good');
    const perfectCount = evaluated.filter((t) => t.status === 'perfect').length;
    const accuracy = total > 0 ? Math.round((hits.length / total) * 100) : 100;
    const offsets = hits
      .map((h) => h.offsetMs)
      .filter((v): v is number => typeof v === 'number');
    const avgOffsetMs = offsets.length
      ? Math.round(offsets.reduce((a, b) => a + Math.abs(b), 0) / offsets.length)
      : 0;
    const stars = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 45 ? 1 : 0;
    const xpEarned = Math.round(35 + accuracy * 1.1 + stars * 20);
    const durationSec = Math.max(4, Math.round(totalBeats / beatsPerSec));

    setSummaryStats({
      accuracy,
      avgOffsetMs,
      perfectCount,
      totalCount: total,
      xpEarned,
    });

    onCompleteDrillAttempt({
      id: `rt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: 'local',
      exerciseId: `rhythm_trainer_${selectedPattern.id}`,
      exerciseTitle: `Rhythm Trainer: ${selectedPattern.name}`,
      activityType: 'rhythm',
      score: hits.length * 100 + perfectCount * 50,
      accuracy,
      maxCombo: hits.length,
      stars,
      avgOffsetMs,
      durationSec,
      xpEarned,
      createdAtMs: Date.now(),
    });
  }, [beatsPerSec, onCompleteDrillAttempt, selectedPattern.id, selectedPattern.name, totalBeats]);

  // Evaluate incoming microphone knock/clap or manual Space/Tap hit
  const evaluateTap = useCallback(
    (source: 'mic' | 'pad') => {
      if (!isDrillRunningRef.current) return;
      const nowBeat = beatRef.current;
      if (nowBeat < -0.35) return;

      const msPerBeat = 1000 / beatsPerSec;
      const maxWindowMs = 155;
      const perfectWindowMs = 52;

      let bestIdx = -1;
      let bestAbsMs = Infinity;
      let signedMs = 0;

      targetsRef.current.forEach((t, idx) => {
        if (t.status !== 'pending') return;
        const deltaMs = (nowBeat - t.beat) * msPerBeat;
        const absMs = Math.abs(deltaMs);
        if (absMs < bestAbsMs && absMs <= maxWindowMs) {
          bestAbsMs = absMs;
          bestIdx = idx;
          signedMs = Math.round(deltaMs);
        }
      });

      if (bestIdx >= 0) {
        const grade: 'perfect' | 'good' = bestAbsMs <= perfectWindowMs ? 'perfect' : 'good';
        const updated = [...targetsRef.current];
        const target = updated[bestIdx];
        updated[bestIdx] = { ...target, status: grade, offsetMs: signedMs };
        targetsRef.current = updated;
        setTargets(updated);

        if (source === 'pad') {
          void audioEngine.ensureToneReady().then(() => {
            audioEngine.playNote(grade === 'perfect' ? 659.25 : 523.25, 0.1, 0.45);
          });
        }

        const dirText =
          Math.abs(signedMs) <= 15
            ? 'Dead On!'
            : signedMs < 0
            ? `${Math.abs(signedMs)}ms early`
            : `${signedMs}ms late`;

        setFeedbackBanner({
          text: grade === 'perfect' ? `Perfect (${target.label})` : `Good (${target.label})`,
          detail: dirText,
          tone: grade,
        });
        setRecentOffsets((prev) => [
          ...prev.slice(-7),
          { id: tapIdRef.current++, offsetMs: signedMs, grade },
        ]);
      } else {
        setFeedbackBanner({
          text: 'Off-Beat Tap',
          detail: source === 'mic' ? 'Wait for the next note marker' : 'Watch the sweeping playhead',
          tone: 'warn',
        });
        setRecentOffsets((prev) => [
          ...prev.slice(-7),
          { id: tapIdRef.current++, offsetMs: 140, grade: 'offbeat' },
        ]);
      }
    },
    [beatsPerSec]
  );

  // Register synchronous mic transient callback with PracticeStage
  useEffect(() => {
    registerTransientHandler(() => {
      evaluateTap('mic');
    });
    return () => registerTransientHandler(null);
  }, [evaluateTap, registerTransientHandler]);

  // Spacebar support while Rhythm Trainer drill is active
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space' && isDrillRunningRef.current) {
        e.preventDefault();
        evaluateTap('pad');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [evaluateTap]);

  const startDrill = useCallback(() => {
    stopDemo();
    void audioEngine.ensureToneReady();
    rebuildTargets(selectedPattern);
    setSummaryStats(null);
    setRecentOffsets([]);
    setFeedbackBanner(null);
    beatRef.current = -selectedPattern.beatsPerBar;
    lastMetronomeBeatRef.current = -99;
    loopCountRef.current = 0;
    lastFrameRef.current = performance.now();
    isDrillRunningRef.current = true;
    setIsDrillRunning(true);
  }, [rebuildTargets, selectedPattern, stopDemo]);

  // Real-time 60fps rhythm drill ticker
  useEffect(() => {
    if (!isDrillRunning) return;
    let rafId = 0;

    const tick = (now: number) => {
      if (!isDrillRunningRef.current) return;
      const dt = Math.min(0.06, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      beatRef.current += dt * beatsPerSec;
      const bNow = beatRef.current;

      if (bNow < 0) {
        setCountInRemaining(Math.max(1, Math.ceil(Math.abs(bNow))));
        setPlayheadBeat(0);
      } else {
        setCountInRemaining(null);
        setPlayheadBeat(bNow);
      }

      const wholeBeat = Math.floor(bNow);
      if (wholeBeat > lastMetronomeBeatRef.current) {
        lastMetronomeBeatRef.current = wholeBeat;
        if (metronomeClickOn || bNow < 0) {
          const isDownbeat =
            ((wholeBeat % selectedPattern.beatsPerBar) + selectedPattern.beatsPerBar) %
              selectedPattern.beatsPerBar ===
            0;
          audioEngine.playMetronomeClick(isDownbeat);
        }
      }

      // Mark passed pending targets as missed
      let changed = false;
      const missToleranceBeats = 0.22 * beatsPerSec;
      const nextTargets = targetsRef.current.map((t) => {
        if (t.status === 'pending' && bNow > t.beat + missToleranceBeats) {
          changed = true;
          return { ...t, status: 'missed' as const };
        }
        return t;
      });
      if (changed) {
        targetsRef.current = nextTargets;
        setTargets(nextTargets);
      }

      if (bNow >= totalBeats) {
        if (loopEnabled) {
          loopCountRef.current += 1;
          beatRef.current = 0;
          lastMetronomeBeatRef.current = -1;
          rebuildTargets(selectedPattern);
        } else {
          finishDrillPass();
          return;
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    beatsPerSec,
    finishDrillPass,
    isDrillRunning,
    loopEnabled,
    metronomeClickOn,
    rebuildTargets,
    selectedPattern,
    totalBeats,
  ]);

  const handleGenerateRandomDrill = () => {
    stopDrill();
    const beats = parseBeatsPerBar(timeSignature);
    const created = createCustomGeneratedPattern(beats);
    setPatterns((prev) => [created, ...prev.slice(0, 6)]);
    setSelectedPatternId(created.id);
  };

  return (
    <div className="space-y-4">
      {/* Rhythm Trainer Header & Pattern Picker */}
      <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[4px_4px_0_#080808] space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#EC4899]">
              Rhythm Trainer · Real-Time Mic Transient Coach
            </div>
            <h2 className="font-display text-2xl font-bold text-[#080808]">
              {selectedPattern.name}
            </h2>
            <p className="text-xs font-medium text-slate-600">
              {selectedPattern.description} Synced to {bpm} BPM · {selectedPattern.beatsPerBar}/4 meter.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleMic}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] px-3.5 py-1.5 text-xs font-bold cursor-pointer ${
                micEnabled ? 'bg-[#3898EC] text-white' : 'bg-[#FFF9D6] text-[#080808]'
              }`}
            >
              {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              {micEnabled ? 'Mic Listening' : 'Enable Mic'}
            </button>

            <button
              type="button"
              onClick={playDemoPattern}
              disabled={isDemoPlaying || isDrillRunning}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-3.5 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6] disabled:opacity-50"
            >
              <Volume2 className="h-4 w-4 text-[#2D40EA]" />
              {isDemoPlaying ? 'Playing Demo...' : 'Hear Pattern'}
            </button>

            {!isDrillRunning ? (
              <button
                type="button"
                onClick={startDrill}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-1.5 text-xs font-extrabold text-[#080808] shadow-[2px_2px_0_#080808] cursor-pointer hover:bg-[#FEC700]"
              >
                <Play className="h-4 w-4" />
                Start Drill
              </button>
            ) : (
              <button
                type="button"
                onClick={stopDrill}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FF6565] px-4 py-1.5 text-xs font-extrabold text-white shadow-[2px_2px_0_#080808] cursor-pointer"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Pattern Selector + Loop & Randomize Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {patterns.map((pat) => {
              const active = pat.id === selectedPattern.id;
              return (
                <button
                  key={pat.id}
                  type="button"
                  disabled={isDrillRunning}
                  onClick={() => setSelectedPatternId(pat.id)}
                  className={`min-h-[34px] rounded-lg border-2 px-3 py-1 text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 ${
                    active
                      ? 'border-[#080808] bg-[#080808] text-[#FFD000]'
                      : 'border-slate-300 bg-white text-[#080808] hover:bg-[#FFF9D6]'
                  }`}
                >
                  {pat.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLoopEnabled((v) => !v)}
              aria-pressed={loopEnabled}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border-2 border-[#080808] px-3 py-1 text-xs font-bold cursor-pointer ${
                loopEnabled ? 'bg-[#EC4899] text-white' : 'bg-white text-[#080808]'
              }`}
            >
              <Repeat className="h-3.5 w-3.5" />
              Loop {loopEnabled ? 'On' : 'Off'}
            </button>

            <button
              type="button"
              onClick={handleGenerateRandomDrill}
              disabled={isDrillRunning}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border-2 border-[#080808] bg-white px-3 py-1 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6] disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#2D40EA]" />
              Randomize
            </button>
          </div>
        </div>
      </div>

      {/* Live Rhythm Visual Grid & Sweeping Playhead */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-[#080808] bg-[#0B132B] p-6 text-white shadow-[4px_4px_0_#080808] space-y-5">
        <div className="flex items-center justify-between text-xs font-mono text-slate-300 tabular-nums">
          <span>
            {selectedPattern.bars} Bars · {selectedPattern.beatsPerBar}/4 · {bpm} BPM
          </span>
          <span>
            {feedbackBanner ? (
              <span
                className={
                  feedbackBanner.tone === 'perfect'
                    ? 'text-[#10B981] font-bold'
                    : feedbackBanner.tone === 'good'
                    ? 'text-[#38BDF8] font-bold'
                    : 'text-[#F59E0B] font-bold'
                }
              >
                {feedbackBanner.text} — {feedbackBanner.detail}
              </span>
            ) : (
              'Tap your desk, clap into your mic, or press Spacebar'
            )}
          </span>
        </div>

        {/* Visual Beat Timeline */}
        <div className="relative h-36 rounded-xl border border-slate-700 bg-[#111827] px-4">
          {/* Measure divider */}
          <div className="pointer-events-none absolute inset-y-2 left-1/2 w-0.5 bg-[#FFD000]/45" />
          <div className="pointer-events-none absolute left-3 top-2 font-mono text-[10px] font-bold text-[#FFD000]/80">
            BAR 1
          </div>
          <div className="pointer-events-none absolute left-[51%] top-2 font-mono text-[10px] font-bold text-[#FFD000]/80">
            BAR 2
          </div>

          {/* Beat Grid Vertical Lines */}
          {Array.from({ length: totalBeats }).map((_, b) => (
            <div
              key={b}
              className="pointer-events-none absolute inset-y-6 w-px bg-slate-700/70"
              style={{ left: `${4 + (b / totalBeats) * 92}%` }}
            />
          ))}

          {/* Target Rhythm Markers */}
          {targets.map((t) => {
            const leftPct = 4 + (t.beat / totalBeats) * 92;
            const bgColor =
              t.status === 'perfect'
                ? 'bg-[#10B981] border-white text-[#080808]'
                : t.status === 'good'
                ? 'bg-[#3898EC] border-white text-white'
                : t.status === 'missed'
                ? 'bg-[#DC2626] border-red-200 text-white opacity-75'
                : t.kind === 'syncopation'
                ? 'bg-[#EC4899] border-white text-white'
                : t.kind === 'dotted'
                ? 'bg-[#F59E0B] border-white text-[#080808]'
                : 'bg-[#FFD000] border-white text-[#080808]';

            return (
              <div
                key={t.id}
                style={{ left: `${leftPct}%` }}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 font-mono text-sm font-extrabold shadow-md transition-transform ${bgColor} ${
                    t.status === 'perfect' ? 'scale-110' : ''
                  }`}
                >
                  {t.label}
                </div>
                <span className="font-mono text-[10px] font-semibold text-slate-300 tabular-nums">
                  {t.offsetMs !== undefined
                    ? `${t.offsetMs >= 0 ? '+' : ''}${t.offsetMs}ms`
                    : t.kind === 'syncopation'
                    ? 'sync'
                    : t.kind === 'eighth'
                    ? '1/8'
                    : 'beat'}
                </span>
              </div>
            );
          })}

          {/* Sweeping Playhead */}
          {(isDrillRunning || isDemoPlaying) && countInRemaining === null && (
            <div
              className="pointer-events-none absolute inset-y-1 w-1 rounded-full bg-white shadow-[0_0_10px_#FFD000]"
              style={{
                left: `${Math.max(4, Math.min(96, 4 + (playheadBeat / totalBeats) * 92))}%`,
              }}
            />
          )}

          {/* Count-In Overlay */}
          {countInRemaining !== null && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B132B]/75">
              <div className="font-mono text-5xl font-extrabold text-[#FFD000] tabular-nums">
                {countInRemaining}
              </div>
              <div className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-200">
                Count-In — Get Ready to Tap
              </div>
            </div>
          )}
        </div>

        {/* Real-Time Timing Offset Deviation Meter + Mic Input Strip */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-[#111827] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-200">Timing Accuracy Gauge</span>
              <span className="font-mono text-[11px] text-slate-400">Early ← 0ms → Late</span>
            </div>
            <div className="relative h-6 rounded-lg bg-[#0B132B] border border-slate-700">
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[#10B981]" />
              {recentOffsets.map((sample) => {
                const clamped = Math.max(-150, Math.min(150, sample.offsetMs));
                const leftPct = 50 + (clamped / 150) * 45;
                const dotColor =
                  sample.grade === 'perfect'
                    ? 'bg-[#10B981]'
                    : sample.grade === 'good'
                    ? 'bg-[#3898EC]'
                    : 'bg-[#F59E0B]';
                return (
                  <div
                    key={sample.id}
                    title={`${sample.offsetMs}ms`}
                    style={{ left: `${leftPct}%` }}
                    className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white ${dotColor}`}
                  />
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-[#111827] p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-200">Mic Transient Sensitivity</span>
              <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                {micEnabled ? `RMS ${(liveRms * 100).toFixed(1)}` : 'Mic Off'} · Gate {(tapThreshold * 100).toFixed(1)}
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-[#0B132B]">
              <div
                className={`h-full transition-all duration-75 ${
                  liveRms > tapThreshold ? 'bg-[#10B981]' : 'bg-[#3898EC]'
                }`}
                style={{ width: `${Math.min(100, liveRms * 360)}%` }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-[#FFD000]"
                style={{ left: `${Math.min(98, tapThreshold * 360)}%` }}
              />
            </div>
            <input
              type="range"
              aria-label="Rhythm trainer microphone threshold"
              min={0.025}
              max={0.25}
              step={0.005}
              value={tapThreshold}
              onChange={(e) => onChangeTapThreshold(Number(e.target.value))}
              className="w-full accent-[#FFD000]"
            />
          </div>
        </div>
      </div>

      {/* Big Tactile Clap/Knock Pad */}
      <button
        type="button"
        onMouseDown={() => evaluateTap('pad')}
        className="flex min-h-[86px] w-full items-center justify-center gap-3 rounded-2xl border-2 border-[#080808] bg-[#FFD000] px-5 py-3 text-sm sm:text-base font-extrabold text-[#080808] shadow-[4px_4px_0_#080808] cursor-pointer transition-transform active:scale-[0.99] hover:bg-[#FEC700]"
      >
        <Hand className="h-6 w-6 text-[#EC4899]" />
        Clap into Microphone, Press Spacebar, or Tap Here on the Beat!
      </button>

      {/* Drill Pass Result Summary */}
      {summaryStats && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[#080808] bg-[#ECFDF5] p-5 text-[#064E3B] shadow-[4px_4px_0_#080808]">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-7 w-7 shrink-0 text-[#059669]" />
            <div>
              <h3 className="font-display text-lg font-bold">
                Drill Complete · {summaryStats.accuracy}% Rhythm Accuracy
              </h3>
              <p className="font-mono text-xs font-semibold tabular-nums">
                Perfect Hits: {summaryStats.perfectCount}/{summaryStats.totalCount} · Avg Timing Offset: ±{summaryStats.avgOffsetMs}ms · +{summaryStats.xpEarned} Studio XP
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={startDrill}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-2 text-xs font-bold text-[#080808] cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            Practice Again
          </button>
        </div>
      )}
    </div>
  );
}
