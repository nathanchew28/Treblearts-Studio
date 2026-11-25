import { Award, Crown, Radio } from 'lucide-react';
import type {
  MusicExercise,
  PracticeAttempt,
  RecordedPerformance,
  UserProfile,
} from '../types/music';
import { LeaderboardView } from './LeaderboardView';
import { ProgressDashboard } from './ProgressDashboard';
import { SharedPerformancesView } from './SharedPerformancesView';

export type CommunitySection = 'progress' | 'leaderboard' | 'stage';

interface CommunityHubProps {
  activeSection: CommunitySection;
  onChangeSection: (section: CommunitySection) => void;
  profile: UserProfile;
  attempts: PracticeAttempt[];
  exercises: MusicExercise[];
  onPracticeExercise: (exercise: MusicExercise) => void;
  leaderboardEntries: UserProfile[];
  isSignedIn: boolean;
  onSignIn: () => void;
  performances: RecordedPerformance[];
  spotlightPerformance: RecordedPerformance | null;
  onApplaud: (performanceId: string) => Promise<void>;
  onClearSpotlight: () => void;
}

const SECTION_TABS: { id: CommunitySection; label: string; icon: typeof Award }[] = [
  { id: 'progress', label: 'My Progress & Badges', icon: Award },
  { id: 'leaderboard', label: 'Leaderboard', icon: Crown },
  { id: 'stage', label: 'Shared Stage', icon: Radio },
];

export function CommunityHub({
  activeSection,
  onChangeSection,
  profile,
  attempts,
  exercises,
  onPracticeExercise,
  leaderboardEntries,
  isSignedIn,
  onSignIn,
  performances,
  spotlightPerformance,
  onApplaud,
  onClearSpotlight,
}: CommunityHubProps) {
  return (
    <section className="mx-auto max-w-[1360px] px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[#080808] bg-[#FFD000] p-5 shadow-[4px_4px_0_#080808]">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#080808] sm:text-3xl">
            Progress, Leaderboard &amp; Shared Stage
          </h1>
          <p className="mt-0.5 text-xs font-medium text-[#080808]/90 sm:text-sm">
            Track your mastery badges, compare ranks with friends, and listen to shared performances.
          </p>
        </div>

        <div
          className="grid w-full grid-cols-1 gap-1.5 rounded-xl border-2 border-[#080808] bg-white p-1.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center"
          role="tablist"
          aria-label="Progress and Community Sections"
        >
          {SECTION_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChangeSection(tab.id)}
                className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer transition-colors sm:justify-start ${
                  active
                    ? 'border-2 border-[#080808] bg-[#2D40EA] text-white'
                    : 'border-2 border-transparent text-[#080808] hover:bg-[#FFF9D6]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeSection === 'progress' && (
        <ProgressDashboard
          embedded
          profile={profile}
          attempts={attempts}
          exercises={exercises}
          onPracticeExercise={onPracticeExercise}
        />
      )}

      {activeSection === 'leaderboard' && (
        <LeaderboardView
          embedded
          entries={leaderboardEntries}
          currentUser={profile}
          isSignedIn={isSignedIn}
          onSignIn={onSignIn}
        />
      )}

      {activeSection === 'stage' && (
        <SharedPerformancesView
          embedded
          performances={performances}
          spotlightPerformance={spotlightPerformance}
          onApplaud={onApplaud}
          onClearSpotlight={onClearSpotlight}
        />
      )}
    </section>
  );
}
