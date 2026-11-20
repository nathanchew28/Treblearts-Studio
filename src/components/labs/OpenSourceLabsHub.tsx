import { useState } from 'react';
import {
  Activity,
  Award,
  Blocks,
  BookOpen,
  Code2,
  Eye,
  FileMusic,
  Mic,
  Piano,
  Sparkles,
} from 'lucide-react';
import type { MusicExercise } from '../../types/music';
import { AudioToSheetStudio } from '../AudioToSheetStudio';
import { ChromeMusicLabSuite } from './ChromeMusicLabSuite';
import { EagerEarLab } from './EagerEarLab';
import { JalmusLab } from './JalmusLab';
import { MelodinoLab } from './MelodinoLab';
import { MinuetLab } from './MinuetLab';
import { MuseScoreLab } from './MuseScoreLab';
import { MusicBlocksLab } from './MusicBlocksLab';
import { PianoBoosterLab } from './PianoBoosterLab';
import { SolfegeLab } from './SolfegeLab';
import { SonicPiLab } from './SonicPiLab';

export type RepoLabId =
  | 'basicpitch'
  | 'musicblocks'
  | 'chromelab'
  | 'melodino'
  | 'sonicpi'
  | 'pianobooster'
  | 'minuet'
  | 'solfege'
  | 'jalmus'
  | 'eagerear'
  | 'musescore';

interface OpenSourceLabsHubProps {
  exercises: MusicExercise[];
  authorId: string;
  authorName: string;
  onLaunchAsExercise: (exercise: MusicExercise) => void;
  onSaveExercise: (
    exercise: Omit<MusicExercise, 'playsCount' | 'createdAtMs'>
  ) => Promise<void>;
  onAwardLabXp: (xp: number, label: string) => void;
}

const REPO_TABS: {
  id: RepoLabId;
  label: string;
  subtitle: string;
  icon: typeof Blocks;
}[] = [
  { id: 'basicpitch', label: 'Basic Pitch', subtitle: 'Audio to Sheet Music', icon: Mic },
  { id: 'musicblocks', label: 'Music Blocks', subtitle: 'Turtle & Code Blocks', icon: Blocks },
  { id: 'chromelab', label: 'Chrome Music Lab', subtitle: 'Song Maker & Spectrogram', icon: Activity },
  { id: 'melodino', label: 'Melodino', subtitle: 'Light-Up Piano Quests', icon: Piano },
  { id: 'sonicpi', label: 'Sonic Pi', subtitle: 'Live Coding Synth', icon: Code2 },
  { id: 'pianobooster', label: 'PianoBooster', subtitle: 'Wait-for-Note Tutor', icon: Piano },
  { id: 'minuet', label: 'KDE Minuet', subtitle: 'Intervals, Chords, Scales', icon: BookOpen },
  { id: 'solfege', label: 'GNU Solfège', subtitle: 'Dictation & Mic Singing', icon: Award },
  { id: 'jalmus', label: 'Jalmus', subtitle: 'Staff & Rhythm Sight-Read', icon: Eye },
  { id: 'eagerear', label: 'Eager Ear', subtitle: 'Kids Aural Puzzles', icon: Sparkles },
  { id: 'musescore', label: 'MuseScore', subtitle: 'Scorewriter & MusicXML', icon: FileMusic },
];

export function OpenSourceLabsHub({
  exercises,
  authorId,
  authorName,
  onLaunchAsExercise,
  onSaveExercise,
  onAwardLabXp,
}: OpenSourceLabsHubProps) {
  const [activeRepo, setActiveRepo] = useState<RepoLabId>('basicpitch');

  return (
    <section className="mx-auto max-w-[1360px] px-6 py-8 space-y-6">
      <div className="rounded-3xl border-2 border-[#080808] bg-[#2D40EA] p-6 text-white shadow-[5px_5px_0_#080808] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-[#FFD000]">
              11 Open-Source Music Tools Unified in One Studio Tab
            </p>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">
              Open-Source Music Labs
            </h1>
          </div>
          <p className="max-w-md text-xs font-medium text-white/90">
            Explore interactive music programming, live coding, piano coaching, sight-reading, ear training, and score engraving — every XP point and song exports right back into Cadence Studio.
          </p>
        </div>

        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
          role="tablist"
          aria-label="Open-Source Music Repositories"
        >
          {REPO_TABS.map((repo) => {
            const Icon = repo.icon;
            const isSelected = activeRepo === repo.id;
            return (
              <button
                key={repo.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setActiveRepo(repo.id)}
                className={`flex min-h-[54px] items-center gap-2.5 rounded-xl border-2 border-[#080808] px-3 py-2 text-left cursor-pointer transition-transform ${
                  isSelected
                    ? 'bg-[#FFD000] text-[#080808] shadow-[2px_2px_0_#FFFFFF] -translate-y-0.5'
                    : 'bg-white text-[#080808] hover:bg-[#FFF9D6]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 text-[#EC4899]" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold leading-tight">{repo.label}</div>
                  <div className="truncate text-[11px] font-medium text-slate-600">
                    {repo.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {activeRepo === 'basicpitch' && (
        <AudioToSheetStudio
          authorId={authorId}
          authorName={authorName}
          onStartExercise={onLaunchAsExercise}
          onSaveExercise={onSaveExercise}
          onAwardXp={onAwardLabXp}
        />
      )}

      {activeRepo === 'musicblocks' && (
        <MusicBlocksLab
          authorId={authorId}
          authorName={authorName}
          onLaunchAsExercise={onLaunchAsExercise}
        />
      )}

      {activeRepo === 'chromelab' && (
        <ChromeMusicLabSuite
          authorId={authorId}
          authorName={authorName}
          onLaunchAsExercise={onLaunchAsExercise}
        />
      )}

      {activeRepo === 'melodino' && (
        <MelodinoLab onAwardXp={onAwardLabXp} />
      )}

      {activeRepo === 'sonicpi' && (
        <SonicPiLab
          authorId={authorId}
          authorName={authorName}
          onLaunchAsExercise={onLaunchAsExercise}
        />
      )}

      {activeRepo === 'pianobooster' && (
        <PianoBoosterLab exercises={exercises} onAwardXp={onAwardLabXp} />
      )}

      {activeRepo === 'minuet' && (
        <MinuetLab onAwardXp={onAwardLabXp} />
      )}

      {activeRepo === 'solfege' && (
        <SolfegeLab onAwardXp={onAwardLabXp} />
      )}

      {activeRepo === 'jalmus' && (
        <JalmusLab onAwardXp={onAwardLabXp} />
      )}

      {activeRepo === 'eagerear' && (
        <EagerEarLab onAwardXp={onAwardLabXp} />
      )}

      {activeRepo === 'musescore' && (
        <MuseScoreLab
          authorId={authorId}
          authorName={authorName}
          onLaunchAsExercise={onLaunchAsExercise}
          onSaveToLibrary={onSaveExercise}
        />
      )}
    </section>
  );
}
