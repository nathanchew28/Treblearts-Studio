import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Coffee, Pause, Play, RotateCcw, X } from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';

export type PomodoroPhase = 'focus' | 'break';

export interface PomodoroExpiredNotice {
  phase: PomodoroPhase;
  durationMin: number;
  completedBlocks: number;
}

const FOCUS_PRESETS_MIN = [5, 10, 15, 25];
const BREAK_PRESETS_MIN = [3, 5, 10];

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function usePomodoroTimer() {
  const [phase, setPhase] = useState<PomodoroPhase>('focus');
  const [focusDurationMin, setFocusDurationMin] = useState<number>(15);
  const [breakDurationMin, setBreakDurationMin] = useState<number>(5);
  const [remainingSec, setRemainingSec] = useState<number>(15 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [completedBlocks, setCompletedBlocks] = useState<number>(0);
  const [expiredNotice, setExpiredNotice] = useState<PomodoroExpiredNotice | null>(null);

  const endAtMsRef = useRef<number | null>(null);
  const remainingSecRef = useRef<number>(15 * 60);
  remainingSecRef.current = remainingSec;

  const activeDurationMin = phase === 'focus' ? focusDurationMin : breakDurationMin;
  const totalSec = Math.max(60, activeDurationMin * 60);

  const playGentleChime = useCallback(() => {
    void audioEngine.ensureToneReady().then(() => {
      audioEngine.playNote(523.25, 0.28, 0.35);
      window.setTimeout(() => {
        audioEngine.playNote(659.25, 0.36, 0.32);
      }, 150);
    });
  }, []);

  useEffect(() => {
    if (!isRunning) {
      endAtMsRef.current = null;
      return;
    }

    if (!endAtMsRef.current) {
      endAtMsRef.current = Date.now() + remainingSecRef.current * 1000;
    }

    const interval = window.setInterval(() => {
      if (!endAtMsRef.current) return;
      const msLeft = endAtMsRef.current - Date.now();
      const nextSec = Math.max(0, Math.ceil(msLeft / 1000));
      setRemainingSec(nextSec);

      if (msLeft <= 0) {
        endAtMsRef.current = null;
        setIsRunning(false);
        const nextCompleted =
          phase === 'focus' ? completedBlocks + 1 : completedBlocks;
        if (phase === 'focus') {
          setCompletedBlocks(nextCompleted);
        }
        setExpiredNotice({
          phase,
          durationMin: activeDurationMin,
          completedBlocks: nextCompleted,
        });
        playGentleChime();
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [isRunning, phase, activeDurationMin, completedBlocks, playGentleChime]);

  const startTimer = useCallback(() => {
    setExpiredNotice(null);
    const startSec = remainingSecRef.current <= 0 ? totalSec : remainingSecRef.current;
    remainingSecRef.current = startSec;
    setRemainingSec(startSec);
    endAtMsRef.current = Date.now() + startSec * 1000;
    setIsRunning(true);
  }, [totalSec]);

  const pauseTimer = useCallback(() => {
    if (endAtMsRef.current) {
      const msLeft = Math.max(0, endAtMsRef.current - Date.now());
      const secLeft = Math.ceil(msLeft / 1000);
      remainingSecRef.current = secLeft;
      setRemainingSec(secLeft);
      endAtMsRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const resetTimer = useCallback(() => {
    endAtMsRef.current = null;
    setIsRunning(false);
    setExpiredNotice(null);
    remainingSecRef.current = totalSec;
    setRemainingSec(totalSec);
  }, [totalSec]);

  const selectPhase = useCallback(
    (nextPhase: PomodoroPhase, autoStart = false) => {
      endAtMsRef.current = null;
      setExpiredNotice(null);
      setPhase(nextPhase);
      const mins = nextPhase === 'focus' ? focusDurationMin : breakDurationMin;
      const nextSec = mins * 60;
      remainingSecRef.current = nextSec;
      setRemainingSec(nextSec);
      if (autoStart) {
        endAtMsRef.current = Date.now() + nextSec * 1000;
        setIsRunning(true);
      } else {
        setIsRunning(false);
      }
    },
    [focusDurationMin, breakDurationMin]
  );

  const updateDurationMinutes = useCallback(
    (mins: number) => {
      const maxMin = phase === 'focus' ? 90 : 30;
      const clamped = Math.max(1, Math.min(maxMin, Math.round(mins) || 1));
      if (phase === 'focus') {
        setFocusDurationMin(clamped);
      } else {
        setBreakDurationMin(clamped);
      }
      if (!isRunning) {
        setExpiredNotice(null);
        remainingSecRef.current = clamped * 60;
        setRemainingSec(clamped * 60);
      }
    },
    [phase, isRunning]
  );

  const dismissNotice = useCallback(() => {
    setExpiredNotice(null);
  }, []);

  return {
    phase,
    focusDurationMin,
    breakDurationMin,
    activeDurationMin,
    remainingSec,
    totalSec,
    isRunning,
    completedBlocks,
    expiredNotice,
    startTimer,
    pauseTimer,
    resetTimer,
    selectPhase,
    updateDurationMinutes,
    dismissNotice,
  };
}

interface PomodoroNoticeBannerProps {
  notice: PomodoroExpiredNotice;
  breakDurationMin: number;
  focusDurationMin: number;
  onStartBreak: () => void;
  onStartFocus: () => void;
  onDismiss: () => void;
}

export function PomodoroNoticeBanner({
  notice,
  breakDurationMin,
  focusDurationMin,
  onStartBreak,
  onStartFocus,
  onDismiss,
}: PomodoroNoticeBannerProps) {
  const isFocusDone = notice.phase === 'focus';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[#080808] px-4 py-3 shadow-[3px_3px_0_#080808] transition-all duration-200 ${
        isFocusDone ? 'bg-[#ECFDF5] text-[#064E3B]' : 'bg-[#EFF6FF] text-[#1E3A8A]'
      }`}
    >
      <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold">
        {isFocusDone ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[#059669]" />
        ) : (
          <Coffee className="h-5 w-5 shrink-0 text-[#2563EB]" />
        )}
        <span>
          {isFocusDone
            ? `Practice session time is up (${notice.durationMin}m focus complete). Take a short breather or queue another block.`
            : `Break time is up (${notice.durationMin}m rest complete). Ready to jump back into focus!`}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isFocusDone ? (
          <button
            type="button"
            onClick={onStartBreak}
            className="min-h-[36px] rounded-xl border-2 border-[#080808] bg-[#FFD000] px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FEC700]"
          >
            Start {breakDurationMin}m Break
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartFocus}
            className="min-h-[36px] rounded-xl border-2 border-[#080808] bg-[#FFD000] px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FEC700]"
          >
            Start {focusDurationMin}m Focus
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss timer notification"
          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-xl border-2 border-[#080808] bg-white text-[#080808] cursor-pointer hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface PomodoroPracticeTimerCardProps {
  timer: ReturnType<typeof usePomodoroTimer>;
}

export function PomodoroPracticeTimerCard({ timer }: PomodoroPracticeTimerCardProps) {
  const presets = timer.phase === 'focus' ? FOCUS_PRESETS_MIN : BREAK_PRESETS_MIN;
  const progressPct = Math.max(
    0,
    Math.min(100, Math.round(((timer.totalSec - timer.remainingSec) / timer.totalSec) * 100))
  );
  const isFinalMinute = timer.isRunning && timer.remainingSec <= 60 && timer.remainingSec > 0;
  const isComplete = timer.remainingSec === 0;

  return (
    <div
      className={`rounded-2xl border-2 border-[#080808] p-5 shadow-[4px_4px_0_#080808] space-y-4 transition-colors duration-200 ${
        isComplete
          ? 'bg-[#ECFDF5]'
          : timer.phase === 'break'
          ? 'bg-[#EFF6FF]'
          : 'bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {timer.phase === 'focus' ? (
            <Clock className="h-4 w-4 text-[#EC4899]" />
          ) : (
            <Coffee className="h-4 w-4 text-[#2D40EA]" />
          )}
          <h2 className="font-display text-base font-bold text-[#080808]">
            Pomodoro Session Timer
          </h2>
        </div>

        <span className="font-mono text-xs font-bold text-slate-600 tabular-nums">
          Blocks: {timer.completedBlocks}
        </span>
      </div>

      {/* Focus / Break Switcher */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-1">
        <button
          type="button"
          onClick={() => timer.selectPhase('focus')}
          className={`min-h-[34px] rounded-lg text-xs font-bold cursor-pointer transition-colors ${
            timer.phase === 'focus'
              ? 'bg-[#FFD000] text-[#080808] border border-[#080808]'
              : 'text-slate-600 hover:text-[#080808]'
          }`}
        >
          Focus Session
        </button>
        <button
          type="button"
          onClick={() => timer.selectPhase('break')}
          className={`min-h-[34px] rounded-lg text-xs font-bold cursor-pointer transition-colors ${
            timer.phase === 'break'
              ? 'bg-[#3898EC] text-white border border-[#080808]'
              : 'text-slate-600 hover:text-[#080808]'
          }`}
        >
          Short Break
        </button>
      </div>

      {/* Countdown Readout & Play/Pause/Reset */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div
            className={`font-mono text-3xl font-extrabold tabular-nums tracking-tight ${
              isComplete
                ? 'text-[#059669]'
                : isFinalMinute
                ? 'text-[#D97706]'
                : 'text-[#080808]'
            }`}
          >
            {formatClock(timer.remainingSec)}
          </div>
          <div className="text-[11px] font-semibold text-slate-600">
            {isComplete
              ? 'Time is up!'
              : timer.isRunning
              ? timer.phase === 'focus'
                ? 'Focused practice active'
                : 'Rest break active'
              : `Target: ${timer.activeDurationMin} min`}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!timer.isRunning ? (
            <button
              type="button"
              onClick={timer.startTimer}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-3.5 py-1.5 text-xs font-bold text-[#080808] shadow-[2px_2px_0_#080808] cursor-pointer hover:bg-[#FEC700]"
            >
              <Play className="h-3.5 w-3.5" />
              {timer.remainingSec < timer.totalSec && timer.remainingSec > 0 ? 'Resume' : 'Start'}
            </button>
          ) : (
            <button
              type="button"
              onClick={timer.pauseTimer}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#080808] px-3.5 py-1.5 text-xs font-bold text-[#FFD000] shadow-[2px_2px_0_#080808] cursor-pointer"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          )}

          <button
            type="button"
            onClick={timer.resetTimer}
            aria-label="Reset Pomodoro session timer"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border-2 border-[#080808] bg-white text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Smooth Session Progress Bar */}
      <div className="h-2.5 w-full overflow-hidden rounded-full border border-[#080808] bg-slate-100">
        <div
          className={`h-full transition-all duration-300 ${
            isComplete
              ? 'bg-[#10B981]'
              : timer.phase === 'break'
              ? 'bg-[#3898EC]'
              : 'bg-[#EC4899]'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Preset & Custom Session Duration Controls */}
      <div className="space-y-2 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {presets.map((min) => (
              <button
                key={min}
                type="button"
                disabled={timer.isRunning}
                onClick={() => timer.updateDurationMinutes(min)}
                className={`min-h-[32px] rounded-lg border px-2.5 font-mono text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 ${
                  timer.activeDurationMin === min
                    ? 'border-[#080808] bg-[#080808] text-[#FFD000]'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-[#FFF9D6]'
                }`}
              >
                {min}m
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <label
              htmlFor="pomodoro-custom-mins"
              className="text-[11px] font-semibold text-slate-600"
            >
              Custom
            </label>
            <input
              id="pomodoro-custom-mins"
              type="number"
              min={1}
              max={timer.phase === 'focus' ? 90 : 30}
              disabled={timer.isRunning}
              value={timer.activeDurationMin}
              onChange={(e) => timer.updateDurationMinutes(Number(e.target.value))}
              className="min-h-[32px] w-16 rounded-lg border-2 border-[#080808] bg-white px-2 text-center font-mono text-xs font-bold text-[#080808] tabular-nums disabled:opacity-50"
            />
            <span className="text-[11px] font-semibold text-slate-500">min</span>
          </div>
        </div>
      </div>
    </div>
  );
}
