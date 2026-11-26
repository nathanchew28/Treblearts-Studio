import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
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
  PitchCalibrationSettings,
  PracticeAttempt,
  RecordedPerformance,
  UserProfile,
} from './types/music';
import type { CommunitySection } from './components/CommunityHub';
import type { CreateScanTool } from './components/CreateScanHub';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PracticeHub } from './components/PracticeHub';
import { TopBar, type NavTab } from './components/TopBar';
import { audioEngine } from './utils/audioEngine';
import type { LearningExperienceMode } from './utils/kidFriendlyTheme';
import {
  compactPerformancesForLocalStorage,
  loadRecordedAudioMapFromIdb,
  readLocalJson,
  saveRecordedAudioToIdb,
  writeLocalJson,
} from './utils/localStorageManager';

const OpenSourceLabsHub = lazy(() =>
  import('./components/labs/OpenSourceLabsHub').then((m) => ({ default: m.OpenSourceLabsHub }))
);
const CommunityHub = lazy(() =>
  import('./components/CommunityHub').then((m) => ({ default: m.CommunityHub }))
);
const CreateScanHub = lazy(() =>
  import('./components/CreateScanHub').then((m) => ({ default: m.CreateScanHub }))
);
const MelodyDashGame = lazy(() =>
  import('./components/MelodyDashGame').then((m) => ({ default: m.MelodyDashGame }))
);
const PitchCalibrationModal = lazy(() =>
  import('./components/PitchCalibrationModal').then((m) => ({ default: m.PitchCalibrationModal }))
);
const PracticeStage = lazy(() =>
  import('./components/PracticeStage').then((m) => ({ default: m.PracticeStage }))
);

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

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('practice');
  const [selectedExercise, setSelectedExercise] = useState<MusicExercise | null>(null);
  const [learningMode, setLearningMode] = useState<LearningExperienceMode>(() =>
    readLocalJson<LearningExperienceMode>(LOCAL_LEARNING_MODE_KEY, 'kids')
  );

  const handleChangeLearningMode = useCallback((mode: LearningExperienceMode) => {
    setLearningMode(mode);
    writeLocalJson(LOCAL_LEARNING_MODE_KEY, mode);
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
  const [createTool, setCreateTool] = useState<CreateScanTool>('scanner');
  const [communitySection, setCommunitySection] = useState<CommunitySection>('progress');
  const [calibrationOpen, setCalibrationOpen] = useState<boolean>(false);
  const [pitchCalibration, setPitchCalibration] = useState<PitchCalibrationSettings>(() =>
    audioEngine.getPitchCalibration()
  );

  useEffect(() => {
    return audioEngine.subscribePitchCalibration((nextCal) => {
      setPitchCalibration(nextCal);
    });
  }, []);

  // Hydrate bulky guest audio recordings from IndexedDB on boot
  useEffect(() => {
    const localSaved = readLocalJson<RecordedPerformance[]>(LOCAL_PERFS_KEY, []);
    const missingAudioIds = localSaved.filter((p) => !p.audioDataUrl).map((p) => p.id);
    if (missingAudioIds.length === 0) return;

    void loadRecordedAudioMapFromIdb(missingAudioIds).then((audioMap) => {
      if (audioMap.size === 0) return;
      setPerformances((prev) =>
        prev.map((p) => {
          const idbAudio = audioMap.get(p.id);
          return idbAudio && !p.audioDataUrl ? { ...p, audioDataUrl: idbAudio } : p;
        })
      );
    });
  }, []);

  // Check ?share=<performanceId> deep link on boot
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (!shareId) return;

    setActiveTab('community');
    setCommunitySection('stage');
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
      writeLocalJson(LOCAL_PROFILE_KEY, nextProfile);
      writeLocalJson(
        LOCAL_ATTEMPTS_KEY,
        [hydratedAttempt, ...attempts].slice(0, 60)
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
      writeLocalJson(LOCAL_EXERCISES_KEY, updated);
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    if (user) {
      await deleteExerciseFromCloud(exerciseId);
      await refreshCommunityData(user.uid);
    } else {
      const updated = localExercises.filter((e) => e.id !== exerciseId);
      setLocalExercises(updated);
      writeLocalJson(LOCAL_EXERCISES_KEY, updated);
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

    const updated = [perfRecord, ...performances].slice(0, 15);
    setPerformances(updated);
    if (perfRecord.audioDataUrl) {
      await saveRecordedAudioToIdb(perfRecord.id, perfRecord.audioDataUrl);
    }
    writeLocalJson(LOCAL_PERFS_KEY, compactPerformancesForLocalStorage(updated));
    setNotice('Recorded performance saved to your local Shared Stage. Sign in with Google to share links across devices.');
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

  const handleAwardLabXp = useCallback(
    async (xp: number) => {
      const nextProfile: UserProfile = {
        ...profile,
        xp: profile.xp + xp,
        exercisesCompleted: profile.exercisesCompleted + 1,
      };
      setProfile(nextProfile);
      if (user) {
        try {
          await updateUserProfileStats(user.uid, nextProfile);
        } catch {
          // Non-fatal local sync
        }
      } else {
        writeLocalJson(LOCAL_PROFILE_KEY, nextProfile);
      }
    },
    [profile, user]
  );

  return (
    <div className="min-h-screen bg-[#FFFDF4] text-[#080808]">
      {activeTab !== 'game' && (
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
      )}

      {notice && activeTab !== 'game' && (
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

      <main className={activeTab === 'game' ? '' : 'pb-16'}>
        <Suspense
          fallback={
            <div className="mx-auto max-w-[1360px] px-6 py-10">
              <div className="rounded-2xl border-2 border-[#080808] bg-white p-8 text-center text-sm font-bold text-[#080808] shadow-[4px_4px_0_#080808]">
                Loading Treblearts Studio workspace...
              </div>
            </div>
          }
        >
          {activeTab === 'game' && (
            <MelodyDashGame
              exercises={allExercises}
              calibration={pitchCalibration}
              onOpenCalibration={() => setCalibrationOpen(true)}
              onExitToStudio={() => setActiveTab('practice')}
              onAwardXp={(xp) => void handleAwardLabXp(xp)}
            />
          )}

          {activeTab === 'practice' && selectedExercise && (
            <PracticeStage
              exercise={selectedExercise}
              learningMode={learningMode}
              onChangeLearningMode={handleChangeLearningMode}
              onBackToLibrary={() => setSelectedExercise(null)}
              onCompleteAttempt={handleCompleteAttempt}
              onSharePerformance={handleSharePerformance}
              onOpenCalibration={() => setCalibrationOpen(true)}
            />
          )}

          {activeTab === 'practice' && !selectedExercise && (
            <PracticeHub
              exercises={allExercises}
              attempts={attempts}
              learningMode={learningMode}
              onChangeLearningMode={handleChangeLearningMode}
              onSelectExercise={handleSelectExercise}
              onOpenCreateTool={(tool) => {
                setCreateTool(tool);
                setActiveTab('create');
              }}
              calibration={pitchCalibration}
              onOpenCalibration={() => setCalibrationOpen(true)}
              onOpenGame={() => setActiveTab('game')}
            />
          )}

          {activeTab === 'create' && (
            <CreateScanHub
              activeTool={createTool}
              onChangeTool={setCreateTool}
              authorId={user?.uid || 'guest-musician'}
              authorName={profile.displayName}
              myExercises={myExercises}
              onPublishExercise={handlePublishExercise}
              onDeleteExercise={handleDeleteExercise}
              onPracticeExercise={handleSelectExercise}
              onAwardXp={(xp) => void handleAwardLabXp(xp)}
            />
          )}

          {activeTab === 'labs' && (
            <OpenSourceLabsHub
              exercises={allExercises}
              authorId={user?.uid || 'guest-musician'}
              authorName={profile.displayName}
              onLaunchAsExercise={handleSelectExercise}
              onSaveExercise={handlePublishExercise}
              onAwardLabXp={(xp) => void handleAwardLabXp(xp)}
            />
          )}

          {activeTab === 'community' && (
            <CommunityHub
              activeSection={communitySection}
              onChangeSection={setCommunitySection}
              profile={profile}
              attempts={attempts}
              exercises={allExercises}
              onPracticeExercise={handleSelectExercise}
              leaderboardEntries={leaderboard}
              isSignedIn={Boolean(user)}
              onSignIn={handleAuthAction}
              performances={performances}
              spotlightPerformance={spotlightPerf}
              onApplaud={handleApplaud}
              onClearSpotlight={() => {
                setSpotlightPerf(null);
                window.history.replaceState({}, '', window.location.pathname);
              }}
            />
          )}
        </Suspense>
      </main>

      {calibrationOpen && (
        <Suspense fallback={null}>
          <PitchCalibrationModal
            isOpen={calibrationOpen}
            onClose={() => setCalibrationOpen(false)}
            onSaved={(nextCal) => {
              setPitchCalibration(nextCal);
              setNotice(
                `Global pitch calibration updated: ${nextCal.instrumentLabel} (A4 = ${nextCal.referenceA4Hz.toFixed(1)} Hz).`
              );
            }}
          />
        </Suspense>
      )}

      <OfflineIndicator />
    </div>
  );
}
