import { useMemo, useState } from 'react';
import { Crown } from 'lucide-react';
import { getRankForXp } from '../data/gamification';
import type { UserProfile } from '../types/music';

interface LeaderboardViewProps {
  entries: UserProfile[];
  currentUser: UserProfile;
  isSignedIn: boolean;
  onSignIn: () => void;
}

export function LeaderboardView({
  entries,
  currentUser,
  isSignedIn,
  onSignIn,
}: LeaderboardViewProps) {
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'teacher'>('all');

  const mergedRows = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const entry of entries) {
      map.set(entry.uid, entry);
    }
    if (currentUser.xp > 0 || isSignedIn) {
      map.set(currentUser.uid, currentUser);
    }
    return Array.from(map.values())
      .filter((u) => (roleFilter === 'all' ? true : u.studioPersona === roleFilter))
      .sort((a, b) => b.xp - a.xp);
  }, [entries, currentUser, isSignedIn, roleFilter]);

  return (
    <section className="mx-auto max-w-[1360px] px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-3xl font-semibold text-slate-900">
            Social Conservatory Leaderboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Earn XP from accurate rhythm taps, in-tune pitch runs, and shared performances.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(['all', 'student', 'teacher'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRoleFilter(mode)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize cursor-pointer transition-colors ${
                roleFilter === mode
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {mode === 'all' ? 'All Musicians' : `${mode}s`}
            </button>
          ))}
        </div>
      </div>

      {!isSignedIn && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50/50 px-5 py-4">
          <p className="text-sm text-slate-700">
            Sign in with Google to sync your XP and claim your spot on the live global leaderboard.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="min-h-[40px] rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white cursor-pointer hover:bg-blue-800"
          >
            Sign In to Sync Rank
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="py-3 pl-5 pr-3 font-medium">Rank</th>
              <th className="px-3 py-3 font-medium">Musician</th>
              <th className="px-3 py-3 font-medium">Studio Tier</th>
              <th className="px-3 py-3 font-medium">Exercises</th>
              <th className="px-3 py-3 font-medium">Streak</th>
              <th className="pl-3 pr-5 py-3 text-right font-medium">Total XP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mergedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                  No leaderboard entries yet. Complete an exercise to set the first score!
                </td>
              </tr>
            ) : (
              mergedRows.map((row, idx) => {
                const rankTier = getRankForXp(row.xp);
                const isMe = row.uid === currentUser.uid;
                return (
                  <tr key={row.uid} className={isMe ? 'bg-blue-50/50' : ''}>
                    <td className="py-3.5 pl-5 pr-3 font-mono text-sm font-semibold text-slate-700 tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {idx === 0 && <Crown className="h-4 w-4 text-amber-500" />}
                        #{idx + 1}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-medium text-slate-900">
                        {row.displayName} {isMe ? '(You)' : ''}
                      </div>
                      <div className="text-xs capitalize text-slate-500">
                        {row.studioPersona} · {row.badges.length} badges
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-slate-700">
                      Lv.{rankTier.level} {rankTier.title}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-slate-700 tabular-nums">
                      {row.exercisesCompleted}
                    </td>
                    <td className="px-3 py-3.5 font-mono text-slate-700 tabular-nums">
                      {row.streakDays}d
                    </td>
                    <td className="pl-3 pr-5 py-3.5 text-right font-mono font-semibold text-blue-700 tabular-nums">
                      {row.xp.toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
