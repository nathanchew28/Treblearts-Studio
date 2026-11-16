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
      <div className="rounded-3xl border-2 border-[#080808] bg-[#FFD000] p-6 shadow-[4px_4px_0_#080808]">
        <h1 className="font-display text-3xl font-bold text-[#080808]">
          Progress &amp; Conservatory Rewards
        </h1>
        <p className="mt-1 text-sm font-medium text-[#080808]/90">
          Track mastery across rhythm, pitch, and coordination activities as you level up your studio rank.
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[3px_3px_0_#080808]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Conservatory Rank</span>
            <Trophy className="h-4 w-4 text-[#2D40EA]" />
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-[#080808]">
            Lv.{rank.level} · {rank.title}
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full border border-[#080808] bg-[#FFFDF4]">
            <div
              className="h-full bg-[#3898EC] transition-all duration-300"
              style={{ width: `${rank.progressPct}%` }}
            />
          </div>
          <div className="mt-1.5 font-mono text-xs font-bold text-slate-600 tabular-nums">
            {profile.xp} / {rank.nextXp} XP
          </div>
        </div>

        <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[3px_3px_0_#080808]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Practice Streak</span>
            <Flame className="h-4 w-4 text-[#FF6565]" />
          </div>
          <div className="mt-2 font-mono text-3xl font-bold text-[#080808] tabular-nums">
            {profile.streakDays} Days
          </div>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {profile.totalMinutes} total practice minutes logged
          </p>
        </div>

        <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[3px_3px_0_#080808]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Exercises Completed</span>
            <Star className="h-4 w-4 text-[#FFD000]" />
          </div>
          <div className="mt-2 font-mono text-3xl font-bold text-[#080808] tabular-nums">
            {profile.exercisesCompleted}
          </div>
          <p className="mt-1 text-xs font-medium text-slate-600">
            Across {attempts.length} recorded studio runs
          </p>
        </div>

        <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[3px_3px_0_#080808]">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Average Accuracy</span>
            <Award className="h-4 w-4 text-[#EC4899]" />
          </div>
          <div className="mt-2 font-mono text-3xl font-bold text-[#080808] tabular-nums">
            {avgAccuracy}%
          </div>
          <p className="mt-1 text-xs font-medium text-slate-600">
            {profile.badges.length} of {BADGE_CATALOG.length} badges unlocked
          </p>
        </div>
      </div>

      {/* Per-Song 4-Activity Mastery Matrix */}
      <div className="rounded-2xl border-2 border-[#080808] bg-white p-6 shadow-[4px_4px_0_#080808] space-y-4">
        <h2 className="font-display text-xl font-bold text-[#080808]">
          Song Mastery Breakdown
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[#080808] text-xs font-bold text-[#080808]">
                <th className="py-2.5 pr-4">Piece / Exercise</th>
                <th className="px-3 py-2.5">Rhythm</th>
                <th className="px-3 py-2.5">Pitch</th>
                <th className="px-3 py-2.5">Coordination</th>
                <th className="px-3 py-2.5">Stage</th>
                <th className="pl-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {exercises.slice(0, 10).map((ex) => {
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
                      <div className="font-bold text-[#080808]">{ex.title}</div>
                      <div className="text-xs text-slate-600">{ex.composer}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-700 tabular-nums">
                      {bestFor('rhythm')}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-700 tabular-nums">
                      {bestFor('pitch')}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-700 tabular-nums">
                      {bestFor('coordination')}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-slate-700 tabular-nums">
                      {bestFor('performance')}
                    </td>
                    <td className="pl-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onPracticeExercise(ex)}
                        className="rounded-xl border-2 border-[#080808] bg-[#FFD000] px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#3898EC] hover:text-white"
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
        <h2 className="font-display text-xl font-bold text-[#080808]">
          Achievement Badges
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BADGE_CATALOG.map((badge) => {
            const unlocked = profile.badges.includes(badge.id);
            return (
              <div
                key={badge.id}
                className={`rounded-2xl border-2 border-[#080808] p-4 transition-colors ${
                  unlocked
                    ? 'bg-[#FFF9D6] shadow-[3px_3px_0_#080808]'
                    : 'bg-white opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#080808]">{badge.name}</span>
                  <span
                    className={`text-[11px] font-bold ${
                      unlocked ? 'text-[#EC4899]' : 'text-slate-400'
                    }`}
                  >
                    {unlocked ? 'Unlocked' : 'Locked'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-700">{badge.description}</p>
                <p className="mt-2 font-mono text-[11px] font-semibold text-slate-500">
                  {badge.criteria}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Runs Log */}
      <div className="rounded-2xl border-2 border-[#080808] bg-white p-6 shadow-[4px_4px_0_#080808] space-y-4">
        <h2 className="font-display text-xl font-bold text-[#080808]">
          Recent Practice Log
        </h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-slate-600">
            Complete any Rhythm, Pitch, Coordination, or Stage activity to start logging your practice history.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-[#080808] text-xs font-bold text-[#080808]">
                  <th className="py-2 pr-4">Exercise</th>
                  <th className="px-3 py-2">Activity</th>
                  <th className="px-3 py-2">Accuracy</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Combo</th>
                  <th className="pl-3 py-2 text-right">XP Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {attempts.slice(0, 15).map((att) => (
                  <tr key={att.id}>
                    <td className="py-2.5 pr-4 font-bold text-[#080808]">
                      {att.exerciseTitle}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-slate-700">
                      {att.activityType}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-[#080808] tabular-nums">
                      {att.accuracy}%
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-[#080808] tabular-nums">
                      {att.score}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 tabular-nums">
                      {att.maxCombo}
                    </td>
                    <td className="pl-3 py-2.5 text-right font-mono font-bold text-[#2D40EA] tabular-nums">
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
