import { useMemo, useState } from 'react';
import {
  Camera,
  Gamepad2,
  Mic,
  Music,
  Play,
  Search,
  Sliders,
  X,
} from 'lucide-react';
import type { ExerciseFocus, MusicExercise, PitchCalibrationSettings } from '../types/music';
import type { LearningExperienceMode } from '../utils/kidFriendlyTheme';
import type { CreateScanTool } from './CreateScanHub';
import { WarmupSoundboard } from './WarmupSoundboard';

interface PracticeHubProps {
  exercises: MusicExercise[];
  learningMode: LearningExperienceMode;
  onChangeLearningMode: (mode: LearningExperienceMode) => void;
  onSelectExercise: (exercise: MusicExercise) => void;
  onOpenCreateTool: (tool: CreateScanTool) => void;
  calibration: PitchCalibrationSettings;
  onOpenCalibration: () => void;
  onOpenGame: () => void;
}

const COVER_BY_FOCUS: Record<ExerciseFocus, string> = {
  Rhythm: '/src/assets/images/cover_rhythm_atelier_1794840363449.jpg',
  Pitch: '/src/assets/images/cover_pitch_conservatory_1794840362925.jpg',
  Coordination: '/src/assets/images/cover_coordination_studio_1794840363772.jpg',
  Complete: '/src/assets/images/cover_pitch_conservatory_1794840362925.jpg',
};

const CARD_TOP_ACCENT: Record<ExerciseFocus, string> = {
  Rhythm: 'bg-[#FFD000]',
  Pitch: 'bg-[#3898EC]',
  Coordination: 'bg-[#EC4899]',
  Complete: 'bg-[#2D40EA]',
};

export function PracticeHub({
  exercises,
  learningMode,
  onChangeLearningMode,
  onSelectExercise,
  onOpenCreateTool,
  calibration,
  onOpenCalibration,
  onOpenGame,
}: PracticeHubProps) {
  const [practiceView, setPracticeView] = useState<'songs' | 'warmup'>('songs');
  const [focusFilter, setFocusFilter] = useState<'All' | ExerciseFocus>('All');
  const [queryText, setQueryText] = useState<string>('');
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (focusFilter !== 'All' && ex.focus !== focusFilter) return false;
      if (!q) return true;
      return (
        ex.title.toLowerCase().includes(q) ||
        ex.composer.toLowerCase().includes(q) ||
        ex.authorName.toLowerCase().includes(q)
      );
    });
  }, [exercises, focusFilter, queryText]);

  const uploadedSong = useMemo(
    () => exercises.find((ex) => !ex.isBuiltIn),
    [exercises]
  );
  const isKids = learningMode === 'kids';

  return (
    <section className="mx-auto max-w-[1360px] px-6 py-6 space-y-5">
      {/* Top Exercise Library Search Bar */}
      <div className="flex flex-col gap-2 rounded-2xl border-2 border-[#080808] bg-white p-3 shadow-[4px_4px_0_#080808] sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#080808]" />
          <input
            type="text"
            value={queryText}
            onChange={(e) => {
              const nextVal = e.target.value;
              setQueryText(nextVal);
              if (nextVal.trim() && practiceView !== 'songs') {
                setPracticeView('songs');
              }
            }}
            placeholder="Search exercise library by title or composer..."
            aria-label="Filter exercise library by title or composer"
            className="min-h-[42px] w-full rounded-xl border-2 border-[#080808] bg-[#FFFDF4] py-2 pl-10 pr-10 text-sm font-medium text-[#080808] placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#2D40EA]"
          />
          {queryText && (
            <button
              type="button"
              onClick={() => setQueryText('')}
              aria-label="Clear search query"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-600 hover:bg-[#FFD000] hover:text-[#080808] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-1 text-xs font-bold text-[#080808] tabular-nums sm:shrink-0">
          <span>
            {filtered.length} of {exercises.length} exercises
          </span>
          {(queryText || focusFilter !== 'All') && (
            <button
              type="button"
              onClick={() => {
                setQueryText('');
                setFocusFilter('All');
              }}
              className="rounded-lg border-2 border-[#080808] bg-[#FFF9D6] px-2.5 py-1 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFD000]"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Compact Studio Command Header */}
      <div className="rounded-2xl border-2 border-[#080808] bg-[#FFD000] p-5 shadow-[4px_4px_0_#080808] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#080808] sm:text-3xl">
              {isKids
                ? 'Practice Spots & Rainbow Songs'
                : 'Practice Spots & Exercise Repertoire'}
            </h1>
            <p className="mt-0.5 text-xs font-semibold text-[#080808]/85 tabular-nums">
              Global Mic Profile: {calibration.instrumentLabel} · A4 ={' '}
              {calibration.referenceA4Hz.toFixed(1)} Hz
              {calibration.semitoneTranspose !== 0
                ? ` · ${calibration.semitoneTranspose > 0 ? '+' : ''}${calibration.semitoneTranspose} semitones`
                : ''}
            </p>
          </div>

          {/* Learning Style Toggle */}
          <div className="flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-white p-1">
            <button
              type="button"
              onClick={() => onChangeLearningMode('kids')}
              className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold cursor-pointer transition-colors ${
                isKids ? 'bg-[#EC4899] text-white' : 'text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              Kids Explorer (5–8)
            </button>
            <button
              type="button"
              onClick={() => onChangeLearningMode('studio')}
              className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold cursor-pointer transition-colors ${
                !isKids ? 'bg-[#2D40EA] text-white' : 'text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              Studio Mode (9+)
            </button>
          </div>
        </div>

        {/* One-Click Studio Shortcuts */}
        <div className="flex flex-wrap items-center gap-2.5">
          {uploadedSong && (
            <button
              type="button"
              onClick={() => onSelectExercise(uploadedSong)}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#080808] px-4 py-2 text-xs font-bold text-[#FFD000] shadow-[2px_2px_0_#FFFFFF] whitespace-nowrap shrink-0 cursor-pointer hover:bg-[#2D40EA] hover:text-white"
            >
              <Play className="h-4 w-4" />
              Play Uploaded Song
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenCreateTool('scanner')}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#EC4899] px-4 py-2 text-xs font-bold text-white shadow-[2px_2px_0_#080808] whitespace-nowrap shrink-0 cursor-pointer hover:opacity-95"
          >
            <Camera className="h-4 w-4" />
            Photo Scanner
          </button>

          <button
            type="button"
            onClick={() => onOpenCreateTool('audio')}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#3898EC] px-4 py-2 text-xs font-bold text-white shadow-[2px_2px_0_#080808] whitespace-nowrap shrink-0 cursor-pointer hover:opacity-95"
          >
            <Mic className="h-4 w-4" />
            Audio &rarr; Sheet
          </button>

          <button
            type="button"
            onClick={onOpenGame}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#10B981] px-4 py-2 text-xs font-bold text-[#080808] shadow-[2px_2px_0_#080808] whitespace-nowrap shrink-0 cursor-pointer hover:opacity-95"
          >
            <Gamepad2 className="h-4 w-4" />
            Play Melody Dash
          </button>

          <button
            type="button"
            onClick={onOpenCalibration}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-white px-4 py-2 text-xs font-bold text-[#080808] shadow-[2px_2px_0_#080808] whitespace-nowrap shrink-0 cursor-pointer hover:bg-[#FFFDF4]"
          >
            <Sliders className="h-4 w-4 text-[#EC4899]" />
            Calibrate Mic ({calibration.referenceA4Hz.toFixed(0)} Hz)
          </button>
        </div>
      </div>

      {/* Practice View Sub-Tabs + Search/Focus Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-white p-1">
            <button
              type="button"
              onClick={() => setPracticeView('songs')}
              className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                practiceView === 'songs'
                  ? 'border border-[#080808] bg-[#080808] text-[#FFD000]'
                  : 'text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              Song Library ({filtered.length})
            </button>
            <button
              type="button"
              onClick={() => setPracticeView('warmup')}
              className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                practiceView === 'warmup'
                  ? 'border border-[#080808] bg-[#080808] text-[#FFD000]'
                  : 'text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              Warmup Soundboard
            </button>
          </div>

          {practiceView === 'songs' && (
            <div className="flex flex-wrap items-center gap-1 rounded-xl border-2 border-[#080808] bg-white p-1">
              {(['All', 'Rhythm', 'Pitch', 'Coordination', 'Complete'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFocusFilter(tab)}
                  className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    focusFilter === tab
                      ? 'bg-[#FFD000] text-[#080808] border border-[#080808]'
                      : 'text-slate-700 hover:bg-[#FFF9D6]'
                  }`}
                >
                  {tab === 'All' ? 'All' : tab}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area: Either Song Grid OR Warmup Soundboard (Zero Stacking Scroll) */}
      {practiceView === 'warmup' ? (
        <WarmupSoundboard />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-[#080808] bg-white p-10 text-center text-sm font-medium text-slate-700 space-y-3">
          <p>
            No matching exercises found{queryText.trim() ? ` for "${queryText.trim()}"` : ''}.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {(queryText || focusFilter !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setQueryText('');
                  setFocusFilter('All');
                }}
                className="min-h-[40px] rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
              >
                Clear Search &amp; Filters
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenCreateTool('scanner')}
              className="min-h-[40px] rounded-xl border-2 border-[#080808] bg-[#2D40EA] px-4 py-1.5 text-xs font-bold text-white cursor-pointer hover:opacity-95"
            >
              Open Create &amp; Scan
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ex) => {
            const coverSrc = ex.coverImage || COVER_BY_FOCUS[ex.focus];
            return (
              <article
                key={ex.id}
                className="flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-[#080808] bg-white shadow-[4px_4px_0_#080808] transition-transform hover:-translate-y-0.5"
              >
                <div>
                  <div className={`h-2 w-full border-b-2 border-[#080808] ${CARD_TOP_ACCENT[ex.focus]}`} />
                  <div className="aspect-[16/10] w-full overflow-hidden border-b-2 border-[#080808] bg-[#FFFDF4]">
                    {!failedImages.has(coverSrc) ? (
                      <img
                        src={coverSrc}
                        alt={`${ex.title} artwork`}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => new Set(prev).add(coverSrc))
                        }
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#FFF9D6]">
                        <Music className="h-8 w-8 text-[#080808]" />
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-1.5">
                    <div className="text-xs font-bold text-[#2D40EA] tabular-nums">
                      {ex.focus} · {ex.difficulty} · {ex.timeSignature} · {ex.bpm} BPM
                    </div>
                    <h2 className="font-display text-lg font-bold text-[#080808]">
                      {ex.title}
                    </h2>
                    <p className="text-xs font-semibold text-slate-600">
                      {ex.composer} · Prepared by {ex.authorName}
                    </p>
                    <p className="pt-0.5 text-xs leading-relaxed text-slate-700 line-clamp-2">
                      {ex.coachingTip}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t-2 border-[#080808] bg-[#FFFDF4] px-4 py-3">
                  <span className="font-mono text-xs font-bold text-[#080808] tabular-nums">
                    5 Practice Modes · {ex.notes.length} notes
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectExercise(ex)}
                    className="min-h-[38px] rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-1.5 text-xs font-bold text-[#080808] cursor-pointer transition-colors hover:bg-[#3898EC] hover:text-white"
                  >
                    Open Practice Stage
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
