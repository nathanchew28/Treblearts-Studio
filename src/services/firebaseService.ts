import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  MusicExercise,
  PracticeAttempt,
  RecordedPerformance,
  UserProfile,
} from '../types/music';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function subscribeAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function ensureUserProfile(
  user: User,
  defaultPersona: 'student' | 'teacher' = 'student'
): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: String(data.uid),
        displayName: String(data.displayName || user.displayName || 'Musician'),
        photoUrl: String(data.photoUrl || ''),
        studioPersona: data.studioPersona === 'teacher' ? 'teacher' : 'student',
        xp: Number(data.xp || 0),
        streakDays: Number(data.streakDays || 1),
        exercisesCompleted: Number(data.exercisesCompleted || 0),
        totalMinutes: Number(data.totalMinutes || 0),
        badges: Array.isArray(data.badges) ? data.badges.map(String) : [],
        lastPracticeDate: String(data.lastPracticeDate || ''),
        isPublicProfile: data.isPublicProfile !== false,
      };
    }

    const newProfile: UserProfile = {
      uid: user.uid,
      displayName: (user.displayName || 'Musician').slice(0, 60),
      photoUrl: (user.photoURL || '').slice(0, 500),
      studioPersona: defaultPersona,
      xp: 0,
      streakDays: 0,
      exercisesCompleted: 0,
      totalMinutes: 0,
      badges: [],
      lastPracticeDate: '',
      isPublicProfile: true,
    };

    await setDoc(doc(db, 'users', user.uid), {
      ...newProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserProfileStats(
  uid: string,
  updates: Partial<Omit<UserProfile, 'uid'>>
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.displayName !== undefined) payload.displayName = updates.displayName.slice(0, 60);
    if (updates.photoUrl !== undefined) payload.photoUrl = updates.photoUrl.slice(0, 500);
    if (updates.studioPersona !== undefined) payload.studioPersona = updates.studioPersona;
    if (updates.xp !== undefined) payload.xp = Math.max(0, Math.min(10000000, Math.round(updates.xp)));
    if (updates.streakDays !== undefined) payload.streakDays = Math.max(0, Math.min(3650, Math.round(updates.streakDays)));
    if (updates.exercisesCompleted !== undefined) payload.exercisesCompleted = Math.max(0, Math.round(updates.exercisesCompleted));
    if (updates.totalMinutes !== undefined) payload.totalMinutes = Math.max(0, Math.round(updates.totalMinutes));
    if (updates.badges !== undefined) payload.badges = updates.badges.slice(0, 24);
    if (updates.lastPracticeDate !== undefined) payload.lastPracticeDate = updates.lastPracticeDate.slice(0, 20);
    if (updates.isPublicProfile !== undefined) payload.isPublicProfile = updates.isPublicProfile;

    await updateDoc(doc(db, 'users', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchLeaderboard(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const q = query(
      collection(db, 'users'),
      where('isPublicProfile', '==', true),
      orderBy('xp', 'desc'),
      limit(25)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: String(data.uid),
        displayName: String(data.displayName || 'Musician'),
        photoUrl: String(data.photoUrl || ''),
        studioPersona: data.studioPersona === 'teacher' ? 'teacher' : 'student',
        xp: Number(data.xp || 0),
        streakDays: Number(data.streakDays || 0),
        exercisesCompleted: Number(data.exercisesCompleted || 0),
        totalMinutes: Number(data.totalMinutes || 0),
        badges: Array.isArray(data.badges) ? data.badges.map(String) : [],
        lastPracticeDate: String(data.lastPracticeDate || ''),
        isPublicProfile: true,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchPublicExercises(uid?: string): Promise<MusicExercise[]> {
  const path = 'exercises';
  try {
    const publicQ = query(
      collection(db, 'exercises'),
      where('isPublic', '==', true),
      orderBy('createdAt', 'desc'),
      limit(40)
    );
    const publicSnap = await getDocs(publicQ);
    const map = new Map<string, MusicExercise>();

    const toExercise = (d: { id: string; data: () => Record<string, unknown> }): MusicExercise => {
      const data = d.data();
      const ts = data.createdAt as Timestamp | undefined;
      return {
        id: String(data.id || d.id),
        authorId: String(data.authorId || ''),
        authorName: String(data.authorName || 'Music Teacher'),
        title: String(data.title || 'Untitled'),
        composer: String(data.composer || ''),
        sourceFormat: (data.sourceFormat as MusicExercise['sourceFormat']) || 'abc',
        notationText: String(data.notationText || ''),
        bpm: Number(data.bpm || 100),
        timeSignature: String(data.timeSignature || '4/4'),
        keySignature: String(data.keySignature || 'C'),
        difficulty: (data.difficulty as MusicExercise['difficulty']) || 'Beginner',
        focus: (data.focus as MusicExercise['focus']) || 'Complete',
        coachingTip: String(data.coachingTip || ''),
        notes: Array.isArray(data.notes) ? (data.notes as MusicExercise['notes']) : [],
        isPublic: Boolean(data.isPublic),
        playsCount: Number(data.playsCount || 0),
        createdAtMs: ts?.toMillis ? ts.toMillis() : Date.now(),
      };
    };

    publicSnap.docs.forEach((d) => map.set(d.id, toExercise(d)));

    if (uid) {
      const ownQ = query(
        collection(db, 'exercises'),
        where('authorId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(30)
      );
      const ownSnap = await getDocs(ownQ);
      ownSnap.docs.forEach((d) => map.set(d.id, toExercise(d)));
    }

    return Array.from(map.values());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function saveExerciseToCloud(
  exercise: Omit<MusicExercise, 'playsCount' | 'createdAtMs'>
): Promise<void> {
  const path = `exercises/${exercise.id}`;
  try {
    await setDoc(doc(db, 'exercises', exercise.id), {
      id: exercise.id,
      authorId: exercise.authorId,
      authorName: exercise.authorName.slice(0, 60),
      title: exercise.title.slice(0, 100),
      composer: exercise.composer.slice(0, 80),
      sourceFormat: exercise.sourceFormat,
      notationText: exercise.notationText.slice(0, 118000),
      bpm: Math.min(240, Math.max(30, Math.round(exercise.bpm))),
      timeSignature: exercise.timeSignature.slice(0, 12),
      keySignature: exercise.keySignature.slice(0, 20),
      difficulty: exercise.difficulty,
      focus: exercise.focus,
      coachingTip: exercise.coachingTip.slice(0, 400),
      notes: exercise.notes.slice(0, 400),
      isPublic: exercise.isPublic,
      playsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteExerciseFromCloud(exerciseId: string): Promise<void> {
  const path = `exercises/${exerciseId}`;
  try {
    await deleteDoc(doc(db, 'exercises', exerciseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function incrementExercisePlays(exerciseId: string): Promise<void> {
  const path = `exercises/${exerciseId}`;
  try {
    await updateDoc(doc(db, 'exercises', exerciseId), {
      playsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveAttemptToCloud(attempt: Omit<PracticeAttempt, 'createdAtMs'>): Promise<void> {
  const path = `attempts/${attempt.id}`;
  try {
    await setDoc(doc(db, 'attempts', attempt.id), {
      ...attempt,
      exerciseTitle: attempt.exerciseTitle.slice(0, 100),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchUserAttempts(uid: string): Promise<PracticeAttempt[]> {
  const path = 'attempts';
  try {
    const q = query(
      collection(db, 'attempts'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(60)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      const ts = data.createdAt as Timestamp | undefined;
      return {
        id: String(data.id || d.id),
        userId: String(data.userId),
        exerciseId: String(data.exerciseId),
        exerciseTitle: String(data.exerciseTitle || ''),
        activityType: data.activityType as PracticeAttempt['activityType'],
        score: Number(data.score || 0),
        accuracy: Number(data.accuracy || 0),
        maxCombo: Number(data.maxCombo || 0),
        stars: Number(data.stars || 0),
        avgOffsetMs: Number(data.avgOffsetMs || 0),
        durationSec: Number(data.durationSec || 0),
        xpEarned: Number(data.xpEarned || 0),
        createdAtMs: ts?.toMillis ? ts.toMillis() : Date.now(),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function savePerformanceToCloud(
  perf: Omit<RecordedPerformance, 'applauseCount' | 'createdAtMs'>
): Promise<void> {
  const path = `performances/${perf.id}`;
  try {
    const safeAudio = perf.audioDataUrl.length <= 675000 ? perf.audioDataUrl : '';
    await setDoc(doc(db, 'performances', perf.id), {
      id: perf.id,
      userId: perf.userId,
      authorName: perf.authorName.slice(0, 60),
      exerciseId: perf.exerciseId,
      exerciseTitle: perf.exerciseTitle.slice(0, 100),
      activityType: perf.activityType,
      instrument: perf.instrument.slice(0, 40),
      score: Math.round(perf.score),
      accuracy: Math.round(perf.accuracy),
      stars: Math.min(3, Math.max(0, Math.round(perf.stars))),
      durationSec: Math.min(300, Math.max(0, Math.round(perf.durationSec))),
      audioDataUrl: safeAudio,
      applauseCount: 0,
      isPublic: perf.isPublic,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchPublicPerformances(uid?: string): Promise<RecordedPerformance[]> {
  const path = 'performances';
  try {
    const q = query(
      collection(db, 'performances'),
      where('isPublic', '==', true),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const snap = await getDocs(q);
    const map = new Map<string, RecordedPerformance>();

    const mapPerf = (d: { id: string; data: () => Record<string, unknown> }): RecordedPerformance => {
      const data = d.data();
      const ts = data.createdAt as Timestamp | undefined;
      return {
        id: String(data.id || d.id),
        userId: String(data.userId),
        authorName: String(data.authorName || 'Student'),
        exerciseId: String(data.exerciseId),
        exerciseTitle: String(data.exerciseTitle || ''),
        activityType: data.activityType as RecordedPerformance['activityType'],
        instrument: String(data.instrument || 'Voice / Instrument'),
        score: Number(data.score || 0),
        accuracy: Number(data.accuracy || 0),
        stars: Number(data.stars || 0),
        durationSec: Number(data.durationSec || 0),
        audioDataUrl: String(data.audioDataUrl || ''),
        applauseCount: Number(data.applauseCount || 0),
        isPublic: Boolean(data.isPublic),
        createdAtMs: ts?.toMillis ? ts.toMillis() : Date.now(),
      };
    };

    snap.docs.forEach((d) => map.set(d.id, mapPerf(d)));

    if (uid) {
      const ownQ = query(
        collection(db, 'performances'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const ownSnap = await getDocs(ownQ);
      ownSnap.docs.forEach((d) => map.set(d.id, mapPerf(d)));
    }

    return Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchPerformanceById(performanceId: string): Promise<RecordedPerformance | null> {
  const path = `performances/${performanceId}`;
  try {
    const snap = await getDoc(doc(db, 'performances', performanceId));
    if (!snap.exists()) return null;
    const data = snap.data();
    const ts = data.createdAt as Timestamp | undefined;
    return {
      id: String(data.id || snap.id),
      userId: String(data.userId),
      authorName: String(data.authorName || 'Student'),
      exerciseId: String(data.exerciseId),
      exerciseTitle: String(data.exerciseTitle || ''),
      activityType: data.activityType as RecordedPerformance['activityType'],
      instrument: String(data.instrument || 'Voice / Instrument'),
      score: Number(data.score || 0),
      accuracy: Number(data.accuracy || 0),
      stars: Number(data.stars || 0),
      durationSec: Number(data.durationSec || 0),
      audioDataUrl: String(data.audioDataUrl || ''),
      applauseCount: Number(data.applauseCount || 0),
      isPublic: Boolean(data.isPublic),
      createdAtMs: ts?.toMillis ? ts.toMillis() : Date.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function applaudPerformance(performanceId: string, uid: string): Promise<boolean> {
  const applauseRef = doc(db, 'performances', performanceId, 'applause', uid);
  const perfRef = doc(db, 'performances', performanceId);
  const path = `performances/${performanceId}/applause/${uid}`;
  try {
    const existing = await getDoc(applauseRef);
    if (existing.exists()) {
      return false;
    }
    const batch = writeBatch(db);
    batch.set(applauseRef, {
      userId: uid,
      createdAt: serverTimestamp(),
    });
    batch.update(perfRef, {
      applauseCount: increment(1),
    });
    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
