import { useMemo, useState } from 'react';
import { BarChart3, Calendar, Clock, Play, Target, TrendingUp } from 'lucide-react';
import type { MusicExercise, PracticeAttempt } from '../types/music';

interface SessionHistoryViewProps {
  attempts: PracticeAttempt[];
  exercises: MusicExercise[];
  onSelectExercise: (exercise: MusicExercise) => void;
}

interface DayBucket {
  dateKey: string;
  shortLabel: string;
  fullLabel: string;
  isToday: boolean;
  sessionsCount: number;
  totalMinutes: number;
  totalXp: number;
  avgAccuracy: number | null;
  dayAttempts: PracticeAttempt[];
}

function toLocalDateKey(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function SessionHistoryView({
  attempts,
  exercises,
  onSelectExercise,
}: SessionHistoryViewProps) {
  const [chartMetric, setChartMetric] = useState<'sessions' | 'minutes'>('sessions');
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const exerciseById = useMemo(() => {
    const map = new Map<string, MusicExercise>();
    for (const ex of exercises) {
      map.set(ex.id, ex);
    }
    return map;
  }, [exercises]);

  const { days, totalSessions30d, activeDays30d, totalMinutes30d, avgAccuracy30d } =
    useMemo(() => {
      const grouped = new Map<string, PracticeAttempt[]>();
      for (const att of attempts) {
        const key = toLocalDateKey(att.createdAtMs || Date.now());
        const list = grouped.get(key) ?? [];
        list.push(att);
        grouped.set(key, list);
      }

      const now = new Date();
      const todayKey = toLocalDateKey(now.getTime());
      const buckets: DayBucket[] = [];

      let sessionsSum = 0;
      let activeDays = 0;
      let secondsSum = 0;
      let accuracyWeightedSum = 0;

      for (let offset = 29; offset >= 0; offset--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
        const key = toLocalDateKey(d.getTime());
        const dayAttempts = (grouped.get(key) ?? [])
          .slice()
          .sort((a, b) => b.createdAtMs - a.createdAtMs);

        const daySec = dayAttempts.reduce((acc, a) => acc + Math.max(0, a.durationSec || 0), 0);
        const dayMinutes = dayAttempts.length > 0 ? Math.max(1, Math.round(daySec / 60)) : 0;
        const dayXp = dayAttempts.reduce((acc, a) => acc + (a.xpEarned || 0), 0);
        const dayAvgAcc = dayAttempts.length
          ? Math.round(
              dayAttempts.reduce((acc, a) => acc + (a.accuracy || 0), 0) / dayAttempts.length
            )
          : null;

        if (dayAttempts.length > 0) {
          activeDays += 1;
          sessionsSum += dayAttempts.length;
          secondsSum += daySec;
          for (const a of dayAttempts) {
            accuracyWeightedSum += a.accuracy || 0;
          }
        }

        buckets.push({
          dateKey: key,
          shortLabel: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          fullLabel: d.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }),
          isToday: key === todayKey,
          sessionsCount: dayAttempts.length,
          totalMinutes: dayMinutes,
          totalXp: dayXp,
          avgAccuracy: dayAvgAcc,
          dayAttempts,
        });
      }

      return {
        days: buckets,
        totalSessions30d: sessionsSum,
        activeDays30d: activeDays,
        totalMinutes30d: sessionsSum > 0 ? Math.max(1, Math.round(secondsSum / 60)) : 0,
        avgAccuracy30d: sessionsSum > 0 ? Math.round(accuracyWeightedSum / sessionsSum) : null,
      };
    }, [attempts]);

  const maxChartValue = useMemo(() => {
    const rawMax = days.reduce((max, d) => {
      const val = chartMetric === 'sessions' ? d.sessionsCount : d.totalMinutes;
      return Math.max(max, val);
    }, 0);
    return Math.max(chartMetric === 'sessions' ? 4 : 15, rawMax);
  }, [chartMetric, days]);

  const activeBucket = useMemo(
    () => days.find((d) => d.dateKey === selectedDayKey) ?? null,
    [days, selectedDayKey]
  );

  const visibleSessions = useMemo(() => {
    if (activeBucket) {
      return activeBucket.dayAttempts;
    }
    return attempts.slice().sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 16);
  }, [activeBucket, attempts]);

  return (
    <div className="space-y-5">
      {/* 30-Day Summary Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border-2 border-[#080808] bg-white p-4 shadow-[3px_3px_0_#080808]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Active Days (30d)</span>
            <Calendar className="h-4 w-4 text-[#2D40EA]" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#080808] tabular-nums">
            {activeDays30d} / 30
          </div>
        </div>

        <div className="rounded-2xl border-2 border-[#080808] bg-white p-4 shadow-[3px_3px_0_#080808]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>30-Day Sessions</span>
            <BarChart3 className="h-4 w-4 text-[#EC4899]" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#080808] tabular-nums">
            {totalSessions30d}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-[#080808] bg-white p-4 shadow-[3px_3px_0_#080808]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Practice Time</span>
            <Clock className="h-4 w-4 text-[#3898EC]" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#080808] tabular-nums">
            {totalMinutes30d}m
          </div>
        </div>

        <div className="rounded-2xl border-2 border-[#080808] bg-white p-4 shadow-[3px_3px_0_#080808]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Avg Accuracy</span>
            <Target className="h-4 w-4 text-[#10B981]" />
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#080808] tabular-nums">
            {avgAccuracy30d !== null ? `${avgAccuracy30d}%` : '—'}
          </div>
        </div>
      </div>

      {/* 30-Day Practice Frequency Chart */}
      <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[4px_4px_0_#080808] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-bold text-[#080808]">
              <TrendingUp className="h-5 w-5 text-[#2D40EA]" />
              Practice Frequency — Last 30 Days
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-600">
              Select any day bar to inspect the exercises completed on that date.
            </p>
          </div>

          <div
            className="flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-1"
            role="group"
            aria-label="Chart metric"
          >
            <button
              type="button"
              onClick={() => setChartMetric('sessions')}
              className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold cursor-pointer transition-colors ${
                chartMetric === 'sessions'
                  ? 'bg-[#080808] text-[#FFD000]'
                  : 'text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              Sessions / Day
            </button>
            <button
              type="button"
              onClick={() => setChartMetric('minutes')}
              className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold cursor-pointer transition-colors ${
                chartMetric === 'minutes'
                  ? 'bg-[#080808] text-[#FFD000]'
                  : 'text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              Minutes / Day
            </button>
          </div>
        </div>

        {/* Chart Plot */}
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[640px] rounded-xl border-2 border-[#080808] bg-[#FFFDF4] p-4">
            <div className="flex items-end gap-3">
              {/* Y-Axis Ticks */}
              <div className="flex h-44 flex-col justify-between pb-6 pr-1 text-right font-mono text-[11px] font-bold text-slate-500 tabular-nums">
                <span>{maxChartValue}</span>
                <span>{Math.round(maxChartValue / 2)}</span>
                <span>0</span>
              </div>

              {/* 30 Daily Columns */}
              <div className="relative flex-1">
                {/* Horizontal Reference Lines */}
                <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
                  <div className="border-t border-dashed border-slate-300" />
                  <div className="border-t border-dashed border-slate-300" />
                  <div className="border-t-2 border-[#080808]" />
                </div>

                <div className="relative grid h-44 grid-cols-30 items-end gap-1 pb-6">
                  {days.map((day) => {
                    const value =
                      chartMetric === 'sessions' ? day.sessionsCount : day.totalMinutes;
                    const heightPct = value > 0 ? Math.max(10, Math.round((value / maxChartValue) * 100)) : 0;
                    const isSelected = selectedDayKey === day.dateKey;

                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        onClick={() =>
                          setSelectedDayKey((prev) => (prev === day.dateKey ? null : day.dateKey))
                        }
                        title={`${day.fullLabel}: ${day.sessionsCount} session${
                          day.sessionsCount === 1 ? '' : 's'
                        }, ${day.totalMinutes}m`}
                        aria-label={`${day.fullLabel}: ${day.sessionsCount} sessions, ${day.totalMinutes} minutes`}
                        aria-pressed={isSelected}
                        className={`group relative flex h-full flex-col items-center justify-end rounded-t-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D40EA] ${
                          isSelected ? 'bg-[#FFD000]/35' : 'hover:bg-[#FFD000]/20'
                        }`}
                      >
                        {value > 0 ? (
                          <span
                            style={{ height: `${heightPct}%` }}
                            className={`w-full rounded-t-md border-2 border-[#080808] transition-colors ${
                              isSelected
                                ? 'bg-[#EC4899]'
                                : day.isToday
                                ? 'bg-[#FFD000]'
                                : 'bg-[#2D40EA] group-hover:bg-[#3898EC]'
                            }`}
                          />
                        ) : (
                          <span className="mb-0.5 h-1.5 w-full rounded-sm bg-slate-300/70 group-hover:bg-slate-400" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* X-Axis Tick Dates */}
                <div className="-mt-4 flex items-center justify-between font-mono text-[11px] font-bold text-slate-600 tabular-nums">
                  <span>{days[0]?.shortLabel}</span>
                  <span>{days[10]?.shortLabel}</span>
                  <span>{days[20]?.shortLabel}</span>
                  <span className="text-[#080808]">Today ({days[29]?.shortLabel})</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Day Summary Strip */}
        {activeBucket && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-4 py-3 text-xs font-bold text-[#080808] tabular-nums">
            <div>
              {activeBucket.fullLabel} · {activeBucket.sessionsCount} session
              {activeBucket.sessionsCount === 1 ? '' : 's'} · {activeBucket.totalMinutes}m ·{' '}
              {activeBucket.avgAccuracy !== null ? `${activeBucket.avgAccuracy}% avg accuracy · ` : ''}
              +{activeBucket.totalXp} XP
            </div>
            <button
              type="button"
              onClick={() => setSelectedDayKey(null)}
              className="rounded-lg border-2 border-[#080808] bg-white px-3 py-1 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFD000]"
            >
              Show All Recent Sessions
            </button>
          </div>
        )}
      </div>

      {/* Session Log List */}
      <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[4px_4px_0_#080808] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-[#080808]">
            {activeBucket
              ? `Sessions on ${activeBucket.fullLabel} (${visibleSessions.length})`
              : `Recent Practice Sessions (${visibleSessions.length})`}
          </h3>
        </div>

        {visibleSessions.length === 0 ? (
          <p className="text-sm font-medium text-slate-600">
            {activeBucket
              ? `No practice sessions logged on ${activeBucket.fullLabel}.`
              : 'Complete any song exercise or Rhythm Trainer drill to see your 30-day practice frequency and session log.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-[#080808] text-xs font-bold text-[#080808]">
                  <th className="py-2 pr-4">Date &amp; Time</th>
                  <th className="px-3 py-2">Exercise</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Accuracy</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">XP</th>
                  <th className="pl-3 py-2 text-right">Practice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visibleSessions.map((att) => {
                  const matchedExercise = exerciseById.get(att.exerciseId);
                  return (
                    <tr key={att.id}>
                      <td className="py-2.5 pr-4 font-mono text-xs font-semibold text-slate-600 whitespace-nowrap tabular-nums">
                        {new Date(att.createdAtMs).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        ·{' '}
                        {new Date(att.createdAtMs).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-[#080808]">
                        {att.exerciseTitle || 'Studio Exercise'}
                      </td>
                      <td className="px-3 py-2.5 capitalize text-xs font-semibold text-slate-700">
                        {att.activityType}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-bold text-[#080808] tabular-nums">
                        {att.accuracy}%
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700 tabular-nums">
                        {Math.max(1, Math.round(att.durationSec))}s
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-bold text-[#2D40EA] tabular-nums">
                        +{att.xpEarned}
                      </td>
                      <td className="pl-3 py-2.5 text-right">
                        {matchedExercise ? (
                          <button
                            type="button"
                            onClick={() => onSelectExercise(matchedExercise)}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border-2 border-[#080808] bg-[#FFD000] px-2.5 py-1 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#3898EC] hover:text-white"
                          >
                            <Play className="h-3 w-3" />
                            Play
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Drill</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
