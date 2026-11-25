import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Minus,
  Music,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';

const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8'] as const;

export function parseBeatsPerBar(timeSig: string): number {
  const num = parseInt(timeSig.split('/')[0] || '4', 10);
  if (Number.isNaN(num) || num < 1) return 4;
  return Math.min(12, num);
}

interface MetronomeWidgetProps {
  bpm: number;
  songDefaultBpm: number;
  onChangeBpm: (nextBpm: number) => void;
  timeSignature: string;
  songDefaultTimeSignature: string;
  onChangeTimeSignature: (nextTimeSig: string) => void;
  clickEnabled: boolean;
  onToggleClick: (enabled: boolean) => void;
  /** True when the main PracticeStage song/exercise runner is playing */
  exerciseRunning: boolean;
  /** Current 0-based beat index from PracticeStage while exerciseRunning is true */
  exerciseBeatIndex: number;
}

export function MetronomeWidget({
  bpm,
  songDefaultBpm,
  onChangeBpm,
  timeSignature,
  songDefaultTimeSignature,
  onChangeTimeSignature,
  clickEnabled,
  onToggleClick,
  exerciseRunning,
  exerciseBeatIndex,
}: MetronomeWidgetProps) {
  const [standaloneRunning, setStandaloneRunning] = useState<boolean>(false);
  const [accentDownbeat, setAccentDownbeat] = useState<boolean>(true);
  const [standaloneBeatIndex, setStandaloneBeatIndex] = useState<number>(-1);

  const tapTimestampsRef = useRef<number[]>([]);
  const nextTickAtMsRef = useRef<number>(0);
  const beatCounterRef = useRef<number>(0);
  const timerIdRef = useRef<number | null>(null);

  const beatsPerBar = parseBeatsPerBar(timeSignature);
  const activeBeat = exerciseRunning
    ? exerciseBeatIndex >= 0
      ? exerciseBeatIndex % beatsPerBar
      : -1
    : standaloneRunning
    ? standaloneBeatIndex
    : -1;

  // Automatically pause standalone metronome when main exercise starts running
  useEffect(() => {
    if (exerciseRunning && standaloneRunning) {
      setStandaloneRunning(false);
      setStandaloneBeatIndex(-1);
    }
  }, [exerciseRunning, standaloneRunning]);

  // Drift-corrected standalone metronome loop
  useEffect(() => {
    if (!standaloneRunning || exerciseRunning) {
      if (timerIdRef.current !== null) {
        window.clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const safeBpm = Math.max(30, Math.min(240, bpm || 100));
    const intervalMs = 60000 / safeBpm;
    beatCounterRef.current = 0;
    nextTickAtMsRef.current = performance.now();

    const step = () => {
      if (cancelled) return;
      const beatInBar = beatCounterRef.current % beatsPerBar;
      setStandaloneBeatIndex(beatInBar);

      if (clickEnabled) {
        const isAccent = accentDownbeat && beatInBar === 0;
        audioEngine.playMetronomeClick(isAccent);
      }

      beatCounterRef.current += 1;
      nextTickAtMsRef.current += intervalMs;
      const delay = Math.max(15, nextTickAtMsRef.current - performance.now());
      timerIdRef.current = window.setTimeout(step, delay);
    };

    void audioEngine.ensureToneReady().then(() => {
      if (!cancelled) step();
    });

    return () => {
      cancelled = true;
      if (timerIdRef.current !== null) {
        window.clearTimeout(timerIdRef.current);
        timerIdRef.current = null;
      }
    };
  }, [standaloneRunning, exerciseRunning, bpm, beatsPerBar, clickEnabled, accentDownbeat]);

  const handleToggleStandalone = useCallback(() => {
    if (exerciseRunning) return;
    if (standaloneRunning) {
      setStandaloneRunning(false);
      setStandaloneBeatIndex(-1);
    } else {
      void audioEngine.ensureToneReady();
      setStandaloneRunning(true);
    }
  }, [exerciseRunning, standaloneRunning]);

  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    const recent = tapTimestampsRef.current.filter((t) => now - t < 2400);
    recent.push(now);
    tapTimestampsRef.current = recent.slice(-6);

    if (recent.length >= 2) {
      let sum = 0;
      for (let i = 1; i < recent.length; i++) {
        sum += recent[i] - recent[i - 1];
      }
      const avgMs = sum / (recent.length - 1);
      const tappedBpm = Math.round(60000 / avgMs);
      onChangeBpm(Math.max(30, Math.min(240, tappedBpm)));
    }
  }, [onChangeBpm]);

  const clampedBpm = Math.max(30, Math.min(240, Math.round(bpm)));
  const signatureOptions = TIME_SIGNATURES.includes(
    timeSignature as (typeof TIME_SIGNATURES)[number]
  )
    ? [...TIME_SIGNATURES]
    : [timeSignature, ...TIME_SIGNATURES];

  const isCustomSongConfig =
    clampedBpm !== songDefaultBpm || timeSignature !== songDefaultTimeSignature;

  return (
    <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[4px_4px_0_#080808] space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-[#2D40EA]" />
          <h2 className="font-display text-base font-bold text-[#080808]">
            Metronome
          </h2>
        </div>

        <button
          type="button"
          onClick={() => onToggleClick(!clickEnabled)}
          aria-pressed={clickEnabled}
          className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border-2 border-[#080808] px-3 py-1 text-xs font-bold cursor-pointer transition-colors ${
            clickEnabled
              ? 'bg-[#FFF9D6] text-[#080808]'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {clickEnabled ? (
            <Volume2 className="h-3.5 w-3.5 text-[#059669]" />
          ) : (
            <VolumeX className="h-3.5 w-3.5 text-[#DC2626]" />
          )}
          {clickEnabled ? 'Click On' : 'Muted'}
        </button>
      </div>

      {/* Visual Beat Bar */}
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${beatsPerBar}, minmax(0, 1fr))` }}
        aria-label={`Beat indicator for ${timeSignature}`}
      >
        {Array.from({ length: beatsPerBar }).map((_, idx) => {
          const isCurrent = activeBeat === idx;
          const isDownbeat = idx === 0;
          return (
            <div
              key={idx}
              className={`flex h-9 items-center justify-center rounded-lg border-2 border-[#080808] font-mono text-xs font-extrabold tabular-nums transition-transform duration-75 ${
                isCurrent
                  ? isDownbeat
                    ? 'bg-[#EC4899] text-white scale-[1.04]'
                    : 'bg-[#FFD000] text-[#080808] scale-[1.03]'
                  : isDownbeat
                  ? 'bg-[#FFF9D6] text-[#080808]'
                  : 'bg-slate-50 text-slate-600'
              }`}
            >
              {idx + 1}
            </div>
          );
        })}
      </div>

      {/* BPM Adjustment Controls */}
      <div className="space-y-2 rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1.5">
            <input
              type="number"
              aria-label="Metronome BPM"
              min={30}
              max={240}
              value={clampedBpm}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                if (!Number.isNaN(parsed)) {
                  onChangeBpm(Math.max(30, Math.min(240, Math.round(parsed))));
                }
              }}
              className="w-16 rounded-lg border-2 border-[#080808] bg-white px-2 py-1 text-center font-mono text-lg font-extrabold text-[#080808] tabular-nums"
            />
            <span className="text-xs font-bold text-slate-600">BPM</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChangeBpm(Math.max(30, clampedBpm - 5))}
              aria-label="Decrease BPM by 5"
              className="min-h-[34px] rounded-lg border border-[#080808] bg-white px-2 font-mono text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
            >
              -5
            </button>
            <button
              type="button"
              onClick={() => onChangeBpm(Math.max(30, clampedBpm - 1))}
              aria-label="Decrease BPM by 1"
              className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-[#080808] bg-white text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChangeBpm(Math.min(240, clampedBpm + 1))}
              aria-label="Increase BPM by 1"
              className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-[#080808] bg-white text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChangeBpm(Math.min(240, clampedBpm + 5))}
              aria-label="Increase BPM by 5"
              className="min-h-[34px] rounded-lg border border-[#080808] bg-white px-2 font-mono text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
            >
              +5
            </button>
          </div>
        </div>

        <input
          type="range"
          aria-label="Adjust BPM slider"
          min={40}
          max={220}
          step={1}
          value={Math.max(40, Math.min(220, clampedBpm))}
          onChange={(e) => onChangeBpm(Number(e.target.value))}
          className="w-full accent-[#2D40EA]"
        />
      </div>

      {/* Time Signature Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-[#080808]">Time Signature</span>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={accentDownbeat}
              onChange={(e) => setAccentDownbeat(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#EC4899]"
            />
            Accent Beat 1
          </label>
        </div>

        <div className="grid grid-cols-6 gap-1.5">
          {signatureOptions.map((sig) => {
            const active = timeSignature === sig;
            return (
              <button
                key={sig}
                type="button"
                onClick={() => onChangeTimeSignature(sig)}
                className={`min-h-[34px] rounded-lg border-2 font-mono text-xs font-bold cursor-pointer transition-colors ${
                  active
                    ? 'border-[#080808] bg-[#2D40EA] text-white'
                    : 'border-slate-300 bg-white text-[#080808] hover:bg-[#FFF9D6]'
                }`}
              >
                {sig}
              </button>
            );
          })}
        </div>
      </div>

      {/* Standalone Beat Playback + Tap Tempo */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          disabled={exerciseRunning}
          onClick={handleToggleStandalone}
          className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-[#080808] px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_#080808] cursor-pointer disabled:opacity-50 ${
            standaloneRunning
              ? 'bg-[#FF6565] text-white'
              : 'bg-[#FFD000] text-[#080808] hover:bg-[#FEC700]'
          }`}
        >
          {standaloneRunning ? (
            <>
              <Pause className="h-3.5 w-3.5" />
              Stop Click
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              {exerciseRunning ? 'Synced to Stage' : 'Start Beat'}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleTapTempo}
          className="min-h-[40px] rounded-xl border-2 border-[#080808] bg-white px-3.5 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
        >
          Tap Tempo
        </button>

        {isCustomSongConfig && (
          <button
            type="button"
            onClick={() => {
              onChangeBpm(songDefaultBpm);
              onChangeTimeSignature(songDefaultTimeSignature);
            }}
            title="Restore song default BPM and time signature"
            aria-label="Restore song default BPM and time signature"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border-2 border-[#080808] bg-white text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
