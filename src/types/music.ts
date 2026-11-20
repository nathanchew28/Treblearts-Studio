export type SourceFormat = 'abc' | 'musicxml' | 'midi';
export type DifficultyLevel = 'Beginner' | 'Intermediate' | 'Master';
export type ExerciseFocus = 'Rhythm' | 'Pitch' | 'Coordination' | 'Complete';
export type ActivityType = 'rhythm' | 'pitch' | 'coordination' | 'performance';
export type HandAssignment = 'right' | 'left' | 'percussion';

export interface SongNote {
  id: string;
  midi: number;
  chordMidis?: number[];
  noteName: string;
  freq: number;
  beatStart: number;
  durationBeats: number;
  measure: number;
  hand: HandAssignment;
  isRest: boolean;
}

export interface MusicExercise {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  composer: string;
  sourceFormat: SourceFormat;
  notationText: string;
  bpm: number;
  timeSignature: string;
  keySignature: string;
  difficulty: DifficultyLevel;
  focus: ExerciseFocus;
  coachingTip: string;
  notes: SongNote[];
  isPublic: boolean;
  playsCount: number;
  coverImage?: string;
  isBuiltIn?: boolean;
  createdAtMs?: number;
}

export interface PracticeAttempt {
  id: string;
  userId: string;
  exerciseId: string;
  exerciseTitle: string;
  activityType: ActivityType;
  score: number;
  accuracy: number;
  maxCombo: number;
  stars: number;
  avgOffsetMs: number;
  durationSec: number;
  xpEarned: number;
  createdAtMs: number;
}

export interface RecordedPerformance {
  id: string;
  userId: string;
  authorName: string;
  exerciseId: string;
  exerciseTitle: string;
  activityType: ActivityType;
  instrument: string;
  score: number;
  accuracy: number;
  stars: number;
  durationSec: number;
  audioDataUrl: string;
  applauseCount: number;
  isPublic: boolean;
  createdAtMs: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoUrl: string;
  studioPersona: 'student' | 'teacher';
  xp: number;
  streakDays: number;
  exercisesCompleted: number;
  totalMinutes: number;
  badges: string[];
  lastPracticeDate: string;
  isPublicProfile: boolean;
}

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  criteria: string;
}

export interface PitchReading {
  freq: number;
  clarity: number;
  midi: number;
  noteName: string;
  cents: number;
  rms: number;
}

export interface PitchCalibrationSettings {
  referenceA4Hz: number;
  semitoneTranspose: number;
  centsTolerance: number;
  minClarity: number;
  noiseGateRms: number;
  calibratedNoteName: string;
  instrumentLabel: string;
  calibratedAtMs?: number;
}
