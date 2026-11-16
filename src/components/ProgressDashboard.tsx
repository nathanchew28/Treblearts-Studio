import { Award, Flame, Star, Trophy } from 'lucide-react';
import { BADGE_CATALOG, getRankForXp } from '../data/gamification';
import type { MusicExercise, PracticeAttempt, UserProfile } from '../types/music';

interface ProgressDashboardProps {
  profile: UserProfile;
  attempts: PracticeAttempt[];
  exercises: MusicExercise[];
  onPracticeExercise: (exercise: MusicExercise) => void;
}

export function ProgressDashboard({
  profile,
  attempts,
  exercises,
  onPracticeExercise,
}: ProgressDashboardProps) {
  const rank = getRankForXp(profile.xp);
  const avgAccuracy = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + a.accuracy, 0) / attempts.length)
    : 0;

  return (
    <section className="mx-auto max-w-[1360px] px-6 py-8 space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="font-display text-3xl font-semibold text-slate-900">
          Progress & Conservatory Rewards
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Track mastery across rhythm, pitch, and coordination activities as you level up your studio rank.
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Conservatory Rank</span>
            <Trophy className="h-4 w-4 text-blue-700" />
          </div>
          <div className="mt-2 font-display text-2xl font-semibold text-slate-900">
            Lv.{rank.level} · {rank.title}
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-blue-700 transition-all duration-300"
              style={{ width: `${rank.progressPct}%` }}
            />
          </div>
          <div className="mt-1.5 font-mono text-xs text-slate-500 tabular-nums">
            {profile.xp} / {rank.nextXp} XP
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Practice Streak</span>
            <Flame className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {profile.streakDays} Days
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {profile.totalMinutes} total practice minutes logged
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Exercises Completed</span>
            <Star className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {profile.exercisesCompleted}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Across {attempts.length} recorded studio runs
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Average Accuracy</span>
            <Award className="h-4 w-4 text-blue-700" />
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {avgAccuracy}%
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {profile.badges.length} of {BADGE_CATALOG.length} badges unlocked
          </p>
        </div>
      </div>

      {/* Per-Song 4-Activity Mastery Matrix */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="font-display text-xl font-semibold text-slate-900">
          Song Mastery Breakdown
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2.5 pr-4 font-medium">Piece / Exercise</th>
                <th className="px-3 py-2.5 font-medium">Rhythm</th>
                <th className="px-3 py-2.5 font-medium">Pitch</th>
                <th className="px-3 py-2.5 font-medium">Coordination</th>
                <th className="px-3 py-2.5 font-medium">Stage</th>
                <th className="pl-3 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exercises.slice(0, 8).map((ex) => {
                const bestFor = (type: PracticeAttempt['activityType']) => {
                  const matching = attempts.filter(
                    (a) => a.exerciseId === ex.id && a.activityType === type
                  );
                  if (matching.length === 0) return '—';
                  return `${Math.max(...matching.map((m) => m.accuracy))}%`;
                };
                return (
                  <tr key={ex.id}>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-900">{ex.title}</div>
                      <div className="text-xs text-slate-500">{ex.composer}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700 tabular-nums">
                      {bestFor('rhythm')}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700 tabular-nums">
                      {bestFor('pitch')}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700 tabular-nums">
                      {bestFor('coordination')}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700 tabular-nums">
                      {bestFor('performance')}
                    </td>
                    <td className="pl-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onPracticeExercise(ex)}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white cursor-pointer hover:bg-blue-700"
                      >
                        Practice
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Achievement Badges */}
      <div className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-slate-900">
          Achievement Badges
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BADGE_CATALOG.map((badge) => {
            const unlocked = profile.badges.includes(badge.id);
            return (
              <div
                key={badge.id}
                className={`rounded-xl border p-4 transition-colors ${
                  unlocked
                    ? 'border-blue-200 bg-white'
                    : 'border-slate-200 bg-slate-50/70 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">{badge.name}</span>
                  <span
                    className={`text-[11px] font-medium ${
                      unlocked ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {unlocked ? 'Unlocked' : 'Locked'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600">{badge.description}</p>
                <p className="mt-2 font-mono text-[11px] text-slate-400">{badge.criteria}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Runs Log */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="font-display text-xl font-semibold text-slate-900">
          Recent Practice Log
        </h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-slate-500">
            Complete any Rhythm, Pitch, Coordination, or Stage activity to start logging your practice history.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pr-4 font-medium">Exercise</th>
                  <th className="px-3 py-2 font-medium">Activity</th>
                  <th className="px-3 py-2 font-medium">Accuracy</th>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Combo</th>
                  <th className="pl-3 py-2 text-right font-medium">XP Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attempts.slice(0, 15).map((att) => (
                  <tr key={att.id}>
                    <td className="py-2.5 pr-4 font-medium text-slate-900">
                      {att.exerciseTitle}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-slate-600">
                      {att.activityType}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-800 tabular-nums">
                      {att.accuracy}%
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-800 tabular-nums">
                      {att.score}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 tabular-nums">
                      {att.maxCombo}
                    </td>
                    <td className="pl-3 py-2.5 text-right font-mono font-medium text-blue-700 tabular-nums">
                      +{att.xpEarned}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
