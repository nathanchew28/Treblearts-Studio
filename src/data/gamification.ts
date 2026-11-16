import type { BadgeDefinition, PracticeAttempt } from '../types/music';

export interface RankTier {
  level: number;
  title: string;
  minXp: number;
  nextXp: number;
}

export const RANK_TIERS: RankTier[] = [
  { level: 1, title: 'Apprentice', minXp: 0, nextXp: 250 },
  { level: 2, title: 'Chorister', minXp: 250, nextXp: 700 },
  { level: 3, title: 'Ensemble Player', minXp: 700, nextXp: 1500 },
  { level: 4, title: 'Soloist', minXp: 1500, nextXp: 3000 },
  { level: 5, title: 'Concertmaster', minXp: 3000, nextXp: 5500 },
  { level: 6, title: 'Virtuoso', minXp: 5500, nextXp: 10000 },
];

export function getRankForXp(xp: number): RankTier & { progressPct: number } {
  let current = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (xp >= tier.minXp) {
      current = tier;
    }
  }
  const span = Math.max(1, current.nextXp - current.minXp);
  const progressPct = Math.min(100, Math.round(((xp - current.minXp) / span) * 100));
  return { ...current, progressPct };
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  {
    id: 'first_downbeat',
    name: 'First Downbeat',
    description: 'Completed your very first practice activity in the studio.',
    criteria: '1+ completed exercise',
  },
  {
    id: 'metronome_heart',
    name: 'Metronome Heart',
    description: 'Kept rock-steady tempo in Rhythm Tap & Knock.',
    criteria: '90%+ accuracy in Rhythm',
  },
  {
    id: 'golden_ear',
    name: 'Golden Ear',
    description: 'Matched instrument or vocal pitches cleanly in tune.',
    criteria: '90%+ accuracy in Pitch Lab',
  },
  {
    id: 'two_hand_sync',
    name: 'Two-Hand Sync',
    description: 'Balanced steady pulse and melodic cues simultaneously.',
    criteria: '85%+ accuracy in Coordination',
  },
  {
    id: 'combo_master',
    name: 'Combo Virtuoso',
    description: 'Sustained an unbroken streak of 20+ consecutive accurate hits.',
    criteria: '20+ note combo',
  },
  {
    id: 'stage_debut',
    name: 'Stage Debut',
    description: 'Recorded and shared a live musical performance.',
    criteria: '1+ shared recording',
  },
  {
    id: 'studio_composer',
    name: 'Studio Arranger',
    description: 'Published an exercise from uploaded sheet notation.',
    criteria: '1+ published song',
  },
  {
    id: 'three_day_streak',
    name: 'Daily Discipline',
    description: 'Maintained a multi-day practice habit.',
    criteria: '3+ day streak',
  },
];

export function evaluateNewBadges(
  existingBadges: string[],
  attempt: PracticeAttempt,
  streakDays: number,
  options?: { sharedPerformance?: boolean; publishedExercise?: boolean }
): string[] {
  const unlocked = new Set(existingBadges);
  unlocked.add('first_downbeat');
  if (attempt.activityType === 'rhythm' && attempt.accuracy >= 90) {
    unlocked.add('metronome_heart');
  }
  if (attempt.activityType === 'pitch' && attempt.accuracy >= 90) {
    unlocked.add('golden_ear');
  }
  if (attempt.activityType === 'coordination' && attempt.accuracy >= 85) {
    unlocked.add('two_hand_sync');
  }
  if (attempt.maxCombo >= 20) {
    unlocked.add('combo_master');
  }
  if (streakDays >= 3) {
    unlocked.add('three_day_streak');
  }
  if (options?.sharedPerformance) {
    unlocked.add('stage_debut');
  }
  if (options?.publishedExercise) {
    unlocked.add('studio_composer');
  }
  return Array.from(unlocked).slice(0, 24);
}
