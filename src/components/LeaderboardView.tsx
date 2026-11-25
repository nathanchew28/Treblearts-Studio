import { useMemo, useState } from 'react';
import { Crown } from 'lucide-react';
import { getRankForXp } from '../data/gamification';
import type { UserProfile } from '../types/music';

interface LeaderboardViewProps {
  entries: UserProfile[];
  currentUser: UserProfile;
  isSignedIn: boolean;
  onSignIn: () => void;
  embedded?: boolean;
}

export function LeaderboardView({
  entries,
  currentUser,
  isSignedIn,
  onSignIn,
  embedded = false,
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
    <section className={embedded ? 'space-y-5' : 'mx-auto max-w-[1360px] px-6 py-8 space-y-6'}>
      {!embedded ? (
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl border-2 border-[#080808] bg-[#FFD000] p-6 shadow-[4px_4px_0_#080808]">
          <div>
            <h1 className="font-display text-3xl font-bold text-[#080808]">
              Social Conservatory Leaderboard
            </h1>
            <p className="mt-1 text-sm font-medium text-[#080808]/90">
              Earn XP from accurate rhythm taps, in-tune pitch runs, and shared performances.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-white p-1">
            {(['all', 'student', 'teacher'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRoleFilter(mode)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize cursor-pointer transition-colors ${
                  roleFilter === mode
                    ? 'bg-[#3898EC] text-white'
                    : 'text-[#080808] hover:bg-[#FFF9D6]'
                }`}
              >
                {mode === 'all' ? 'All Musicians' : `${mode}s`}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-700">
            Earn XP from accurate rhythm taps, in-tune pitch runs, Melody Dash, and shared performances.
          </p>
          <div className="flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-white p-1">
            {(['all', 'student', 'teacher'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRoleFilter(mode)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize cursor-pointer transition-colors ${
                  roleFilter === mode
                    ? 'bg-[#3898EC] text-white'
                    : 'text-[#080808] hover:bg-[#FFF9D6]'
                }`}
              >
                {mode === 'all' ? 'All Musicians' : `${mode}s`}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isSignedIn && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[#080808] bg-white px-5 py-4 shadow-[3px_3px_0_#080808]">
          <p className="text-sm font-medium text-[#080808]">
            Sign in with Google to sync your XP and claim your spot on the live global leaderboard.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="min-h-[40px] rounded-xl border-2 border-[#080808] bg-[#EC4899] px-4 py-2 text-xs font-bold text-white cursor-pointer hover:bg-[#2D40EA]"
          >
            Sign In to Sync Rank
          </button>
        </div>
      )}

      <div className="rounded-2xl border-2 border-[#080808] bg-white shadow-[4px_4px_0_#080808] overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-[#080808] bg-[#FFFDF4] text-xs font-bold text-[#080808]">
              <th className="py-3 pl-5 pr-3">Rank</th>
              <th className="px-3 py-3">Musician</th>
              <th className="px-3 py-3">Studio Tier</th>
              <th className="px-3 py-3">Exercises</th>
              <th className="px-3 py-3">Streak</th>
              <th className="pl-3 pr-5 py-3 text-right">Total XP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {mergedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-600">
                  No leaderboard entries yet. Complete an exercise to set the first score!
                </td>
              </tr>
            ) : (
              mergedRows.map((row, idx) => {
                const rankTier = getRankForXp(row.xp);
                const isMe = row.uid === currentUser.uid;
                return (
                  <tr key={row.uid} className={isMe ? 'bg-[#FFF9D6]' : ''}>
                    <td className="py-3.5 pl-5 pr-3 font-mono text-sm font-bold text-[#080808] tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {idx === 0 && <Crown className="h-4 w-4 text-[#EC4899]" />}
                        #{idx + 1}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-bold text-[#080808]">
                        {row.displayName} {isMe ? '(You)' : ''}
                      </div>
                      <div className="text-xs capitalize text-slate-600">
                        {row.studioPersona} · {row.badges.length} badges
                      </div>
                    </td>
                    <td className="px-3 py-3.5 font-medium text-slate-800">
                      Lv.{rankTier.level} {rankTier.title}
                    </td>
                    <td className="px-3 py-3.5 font-mono font-semibold text-[#080808] tabular-nums">
                      {row.exercisesCompleted}
                    </td>
                    <td className="px-3 py-3.5 font-mono font-semibold text-[#080808] tabular-nums">
                      {row.streakDays}d
                    </td>
                    <td className="pl-3 pr-5 py-3.5 text-right font-mono font-bold text-[#2D40EA] tabular-nums">
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
