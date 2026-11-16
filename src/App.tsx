import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { BUILT_IN_EXERCISES } from './data/builtInSongs';
import { evaluateNewBadges } from './data/gamification';
import {
  applaudPerformance,
  deleteExerciseFromCloud,
  ensureUserProfile,
  fetchLeaderboard,
  fetchPerformanceById,
  fetchPublicExercises,
  fetchPublicPerformances,
  fetchUserAttempts,
  incrementExercisePlays,
  saveAttemptToCloud,
  saveExerciseToCloud,
  savePerformanceToCloud,
  signInWithGoogle,
  signOutUser,
  subscribeAuth,
  updateUserProfileStats,
} from './services/firebaseService';
import type {
  ActivityType,
  MusicExercise,
  PracticeAttempt,
  RecordedPerformance,
  UserProfile,
} from './types/music';
import { LeaderboardView } from './components/LeaderboardView';
import { PracticeHub } from './components/PracticeHub';
import { PracticeStage } from './components/PracticeStage';
import { ProgressDashboard } from './components/ProgressDashboard';
import { SharedPerformancesView } from './components/SharedPerformancesView';
import { TeacherStudio } from './components/TeacherStudio';
import { TopBar, type NavTab } from './components/TopBar';
import type { LearningExperienceMode } from './utils/kidFriendlyTheme';

const LOCAL_EXERCISES_KEY = 'cadence_local_exercises_v1';
const LOCAL_ATTEMPTS_KEY = 'cadence_local_attempts_v1';
const LOCAL_PROFILE_KEY = 'cadence_local_profile_v1';
const LOCAL_PERFS_KEY = 'cadence_local_perfs_v1';
const LOCAL_LEARNING_MODE_KEY = 'cadence_learning_mode_v1';

const DEFAULT_GUEST_PROFILE: UserProfile = {
  uid: 'guest-musician',
  displayName: 'Guest Musician',
  photoUrl: '',
  studioPersona: 'student',
  xp: 0,
  streakDays: 0,
  exercisesCompleted: 0,
  totalMinutes: 0,
  badges: [],
  lastPracticeDate: '',
  isPublicProfile: true,
};

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('practice');
  const [selectedExercise, setSelectedExercise] = useState<MusicExercise | null>(null);
  const [learningMode, setLearningMode] = useState<LearningExperienceMode>(() =>
    readLocalJson<LearningExperienceMode>(LOCAL_LEARNING_MODE_KEY, 'kids')
  );

  const handleChangeLearningMode = useCallback((mode: LearningExperienceMode) => {
    setLearningMode(mode);
    localStorage.setItem(LOCAL_LEARNING_MODE_KEY, JSON.stringify(mode));
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile>(() =>
    readLocalJson(LOCAL_PROFILE_KEY, DEFAULT_GUEST_PROFILE)
  );
  const [cloudExercises, setCloudExercises] = useState<MusicExercise[]>([]);
  const [localExercises, setLocalExercises] = useState<MusicExercise[]>(() =>
    readLocalJson(LOCAL_EXERCISES_KEY, [])
  );
  const [attempts, setAttempts] = useState<PracticeAttempt[]>(() =>
    readLocalJson(LOCAL_ATTEMPTS_KEY, [])
  );
  const [leaderboard, setLeaderboard] = useState<UserProfile[]>([]);
  const [performances, setPerformances] = useState<RecordedPerformance[]>(() =>
    readLocalJson(LOCAL_PERFS_KEY, [])
  );
  const [spotlightPerf, setSpotlightPerf] = useState<RecordedPerformance | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Check ?share=<performanceId> deep link on boot
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (!shareId) return;

    setActiveTab('stage');
    void fetchPerformanceById(shareId)
      .then((perf) => {
        if (perf) {
          setSpotlightPerf(perf);
        }
      })
      .catch(() => {
        const localMatch = readLocalJson<RecordedPerformance[]>(LOCAL_PERFS_KEY, []).find(
          (p) => p.id === shareId
        );
        if (localMatch) setSpotlightPerf(localMatch);
      });
  }, []);

  const refreshCommunityData = useCallback(async (uid?: string) => {
    try {
      const [exs, lb, perfs] = await Promise.all([
        fetchPublicExercises(uid),
        fetchLeaderboard(),
        fetchPublicPerformances(uid),
      ]);
      setCloudExercises(exs);
      setLeaderboard(lb);
      setPerformances(perfs);
    } catch {
      // Graceful offline/unauthenticated fallback
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeAuth((firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        void (async () => {
          try {
            const prof = await ensureUserProfile(firebaseUser, 'student');
            setProfile(prof);
            const cloudAttempts = await fetchUserAttempts(firebaseUser.uid);
            setAttempts(cloudAttempts);
            await refreshCommunityData(firebaseUser.uid);
          } catch {
            setNotice('Signed in, but could not sync all cloud records yet.');
          }
        })();
      } else {
        setProfile(readLocalJson(LOCAL_PROFILE_KEY, DEFAULT_GUEST_PROFILE));
        setAttempts(readLocalJson(LOCAL_ATTEMPTS_KEY, []));
        void refreshCommunityData();
      }
    });
    return () => unsub();
  }, [refreshCommunityData]);

  const allExercises = useMemo(() => {
    const map = new Map<string, MusicExercise>();
    for (const ex of cloudExercises) map.set(ex.id, ex);
    for (const ex of localExercises) {
      if (!map.has(ex.id)) map.set(ex.id, ex);
    }
    for (const ex of BUILT_IN_EXERCISES) map.set(ex.id, ex);
    return Array.from(map.values());
  }, [cloudExercises, localExercises]);

  const myExercises = useMemo(() => {
    const myId = user?.uid || 'guest-musician';
    return allExercises.filter((ex) => ex.authorId === myId && !ex.isBuiltIn);
  }, [allExercises, user]);

  const handleAuthAction = async () => {
    setNotice(null);
    if (user) {
      await signOutUser();
      return;
    }
    try {
      await signInWithGoogle();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Google Sign-In was cancelled.');
    }
  };

  const handleSelectExercise = (ex: MusicExercise) => {
    setSelectedExercise(ex);
    setActiveTab('practice');
    if (user && !ex.isBuiltIn && ex.isPublic) {
      void incrementExercisePlays(ex.id).catch(() => {});
    }
  };

  const handleCompleteAttempt = async (attempt: PracticeAttempt) => {
    const today = new Date().toISOString().slice(0, 10);
    const nextStreak =
      profile.lastPracticeDate === today
        ? Math.max(1, profile.streakDays)
        : profile.streakDays + 1;
    const nextBadges = evaluateNewBadges(profile.badges, attempt, nextStreak);
    const nextProfile: UserProfile = {
      ...profile,
      xp: profile.xp + attempt.xpEarned,
      streakDays: nextStreak,
      exercisesCompleted: profile.exercisesCompleted + 1,
      totalMinutes: profile.totalMinutes + Math.max(1, Math.round(attempt.durationSec / 60)),
      badges: nextBadges,
      lastPracticeDate: today,
    };

    const hydratedAttempt: PracticeAttempt = {
      ...attempt,
      userId: user ? user.uid : 'guest-musician',
    };

    setProfile(nextProfile);
    setAttempts((prev) => [hydratedAttempt, ...prev]);

    if (user) {
      try {
        await Promise.all([
          saveAttemptToCloud(hydratedAttempt),
          updateUserProfileStats(user.uid, nextProfile),
        ]);
        void refreshCommunityData(user.uid);
      } catch {
        setNotice('Saved run locally; cloud sync will retry on next session.');
      }
    } else {
      localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(nextProfile));
      localStorage.setItem(
        LOCAL_ATTEMPTS_KEY,
        JSON.stringify([hydratedAttempt, ...attempts].slice(0, 60))
      );
    }
  };

  const handlePublishExercise = async (
    exercise: Omit<MusicExercise, 'playsCount' | 'createdAtMs'>
  ) => {
    if (user) {
      await saveExerciseToCloud(exercise);
      const nextBadges = Array.from(new Set([...profile.badges, 'studio_composer'])).slice(0, 24);
      const nextProfile: UserProfile = {
        ...profile,
        studioPersona: 'teacher',
        xp: profile.xp + 75,
        badges: nextBadges,
      };
      setProfile(nextProfile);
      await updateUserProfileStats(user.uid, nextProfile);
      await refreshCommunityData(user.uid);
    } else {
      const localEx: MusicExercise = {
        ...exercise,
        playsCount: 0,
        createdAtMs: Date.now(),
      };
      const updated = [localEx, ...localExercises];
      setLocalExercises(updated);
      localStorage.setItem(LOCAL_EXERCISES_KEY, JSON.stringify(updated));
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    if (user) {
      await deleteExerciseFromCloud(exerciseId);
      await refreshCommunityData(user.uid);
    } else {
      const updated = localExercises.filter((e) => e.id !== exerciseId);
      setLocalExercises(updated);
      localStorage.setItem(LOCAL_EXERCISES_KEY, JSON.stringify(updated));
    }
  };

  const handleSharePerformance = async (payload: {
    exercise: MusicExercise;
    activityType: ActivityType;
    instrument: string;
    score: number;
    accuracy: number;
    stars: number;
    durationSec: number;
    audioDataUrl: string;
  }): Promise<string | null> => {
    const id = `perf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const perfRecord: RecordedPerformance = {
      id,
      userId: user ? user.uid : 'guest-musician',
      authorName: profile.displayName,
      exerciseId: payload.exercise.id,
      exerciseTitle: payload.exercise.title,
      activityType: payload.activityType,
      instrument: payload.instrument,
      score: payload.score,
      accuracy: payload.accuracy,
      stars: payload.stars,
      durationSec: payload.durationSec,
      audioDataUrl: payload.audioDataUrl,
      applauseCount: 0,
      isPublic: true,
      createdAtMs: Date.now(),
    };

    if (user) {
      await savePerformanceToCloud(perfRecord);
      const nextBadges = Array.from(new Set([...profile.badges, 'stage_debut'])).slice(0, 24);
      const nextProfile: UserProfile = {
        ...profile,
        xp: profile.xp + 60,
        badges: nextBadges,
      };
      setProfile(nextProfile);
      await updateUserProfileStats(user.uid, nextProfile);
      await refreshCommunityData(user.uid);
      return id;
    }

    const updated = [perfRecord, ...performances];
    setPerformances(updated);
    localStorage.setItem(LOCAL_PERFS_KEY, JSON.stringify(updated.slice(0, 15)));
    setNotice('Recorded performance added to your local Shared Stage. Sign in with Google to share links across devices.');
    return id;
  };

  const handleApplaud = async (performanceId: string) => {
    if (user) {
      try {
        const added = await applaudPerformance(performanceId, user.uid);
        if (added) {
          setPerformances((prev) =>
            prev.map((p) =>
              p.id === performanceId ? { ...p, applauseCount: p.applauseCount + 1 } : p
            )
          );
          if (spotlightPerf?.id === performanceId) {
            setSpotlightPerf({ ...spotlightPerf, applauseCount: spotlightPerf.applauseCount + 1 });
          }
        }
      } catch {
        // Already applauded or offline
      }
      return;
    }

    setPerformances((prev) =>
      prev.map((p) =>
        p.id === performanceId ? { ...p, applauseCount: p.applauseCount + 1 } : p
      )
    );
  };

  return (
    <div className="min-h-screen bg-[#FFFDF4] text-[#080808]">
      <TopBar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'practice') setSelectedExercise(null);
        }}
        user={user}
        onAuthAction={handleAuthAction}
        displayName={profile.displayName}
      />

      {notice && (
        <div className="mx-auto mt-4 max-w-[1360px] px-6">
          <div className="flex items-center justify-between rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-4 py-2.5 text-xs font-semibold text-[#080808]">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="font-bold text-[#2D40EA] hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="pb-16">
        {activeTab === 'practice' && selectedExercise && (
          <PracticeStage
            exercise={selectedExercise}
            learningMode={learningMode}
            onChangeLearningMode={handleChangeLearningMode}
            onBackToLibrary={() => setSelectedExercise(null)}
            onCompleteAttempt={handleCompleteAttempt}
            onSharePerformance={handleSharePerformance}
          />
        )}

        {activeTab === 'practice' && !selectedExercise && (
          <PracticeHub
            exercises={allExercises}
            authorId={user?.uid || 'guest-musician'}
            authorName={profile.displayName}
            learningMode={learningMode}
            onChangeLearningMode={handleChangeLearningMode}
            onSelectExercise={handleSelectExercise}
            onSaveScannedExercise={handlePublishExercise}
            onOpenTeacherStudio={() => setActiveTab('teacher')}
          />
        )}

        {activeTab === 'teacher' && (
          <TeacherStudio
            authorId={user?.uid || 'guest-musician'}
            authorName={profile.displayName}
            myExercises={myExercises}
            onPublishExercise={handlePublishExercise}
            onDeleteExercise={handleDeleteExercise}
            onPracticeExercise={handleSelectExercise}
          />
        )}

        {activeTab === 'progress' && (
          <ProgressDashboard
            profile={profile}
            attempts={attempts}
            exercises={allExercises}
            onPracticeExercise={handleSelectExercise}
          />
        )}

        {activeTab === 'leaderboard' && (
          <LeaderboardView
            entries={leaderboard}
            currentUser={profile}
            isSignedIn={Boolean(user)}
            onSignIn={handleAuthAction}
          />
        )}

        {activeTab === 'stage' && (
          <SharedPerformancesView
            performances={performances}
            spotlightPerformance={spotlightPerf}
            onApplaud={handleApplaud}
            onClearSpotlight={() => {
              setSpotlightPerf(null);
              window.history.replaceState({}, '', window.location.pathname);
            }}
          />
        )}
      </main>
    </div>
  );
}
