import { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Gamepad2,
  Mic,
  Music,
  Play,
  Search,
  Sliders,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { ExerciseFocus, MusicExercise, PitchCalibrationSettings } from '../types/music';
import type { LearningExperienceMode } from '../utils/kidFriendlyTheme';
import { AudioToSheetStudio } from './AudioToSheetStudio';
import { SheetPhotoScanner } from './SheetPhotoScanner';
import { WarmupSoundboard } from './WarmupSoundboard';

interface PracticeHubProps {
  exercises: MusicExercise[];
  authorId: string;
  authorName: string;
  learningMode: LearningExperienceMode;
  onChangeLearningMode: (mode: LearningExperienceMode) => void;
  onSelectExercise: (exercise: MusicExercise) => void;
  onSaveScannedExercise: (
    exercise: Omit<MusicExercise, 'playsCount' | 'createdAtMs'>
  ) => Promise<void>;
  onOpenTeacherStudio: () => void;
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
  authorId,
  authorName,
  learningMode,
  onChangeLearningMode,
  onSelectExercise,
  onSaveScannedExercise,
  onOpenTeacherStudio,
  calibration,
  onOpenCalibration,
  onOpenGame,
}: PracticeHubProps) {
  const [focusFilter, setFocusFilter] = useState<'All' | ExerciseFocus>('All');
  const [queryText, setQueryText] = useState<string>('');
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const scannerSectionRef = useRef<HTMLDivElement | null>(null);
  const audioToSheetRef = useRef<HTMLDivElement | null>(null);

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

  const scrollToScanner = () => {
    scannerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToAudioToSheet = () => {
    audioToSheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="mx-auto max-w-[1360px] px-6 py-8 space-y-8">
      {/* Colourful Treble Arts + 3D Explorer Hero */}
      <div className="grid grid-cols-1 items-stretch gap-6 rounded-3xl border-2 border-[#080808] bg-[#FFD000] p-6 md:p-8 shadow-[6px_6px_0_#080808] lg:grid-cols-12">
        <div className="flex flex-col justify-between space-y-6 lg:col-span-7">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#080808]">
                <Sparkles className="h-4 w-4 text-[#EC4899]" />
                Real-Time Mic + Sheet Photo Scanner · Ages 5 to Adult
              </p>

              {/* Age & Learning Style Toggle */}
              <div className="flex items-center gap-1 rounded-xl border-2 border-[#080808] bg-white p-1">
                <button
                  type="button"
                  onClick={() => onChangeLearningMode('kids')}
                  className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold cursor-pointer transition-colors ${
                    isKids
                      ? 'bg-[#EC4899] text-white'
                      : 'text-[#080808] hover:bg-[#FFF9D6]'
                  }`}
                >
                  Kids Explorer (5–8)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeLearningMode('studio')}
                  className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold cursor-pointer transition-colors ${
                    !isKids
                      ? 'bg-[#2D40EA] text-white'
                      : 'text-[#080808] hover:bg-[#FFF9D6]'
                  }`}
                >
                  Studio Mode (9+)
                </button>
              </div>
            </div>

            <h1 className="font-display text-3xl font-bold tracking-tight text-[#080808] sm:text-5xl [text-wrap:balance]">
              {isKids
                ? 'Snap any sheet music, clap & sing rainbow notes, and earn golden stars!'
                : 'Turn any sheet music photo or score into live rhythm, pitch & coordination games.'}
            </h1>
            <p className="max-w-xl text-sm font-medium leading-relaxed text-[#080808]/90">
              {isKids
                ? 'Take a photo of any music book for piano, violin, flute, guitar, or voice! Play colorful Do-Re-Mi notes, bounce with Beat Buddy, and collect rewards.'
                : 'Point your camera at any score or upload MusicXML/MIDI to launch instant desk-tap rhythm drills, Pitchy chromatic tuning, two-hand sync, and shareable recordings.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={scrollToScanner}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#EC4899] px-5 py-2.5 text-sm font-bold text-white shadow-[3px_3px_0_#080808] cursor-pointer transition-transform hover:-translate-y-0.5"
            >
              <Camera className="h-4 w-4" />
              Snap Sheet Music Photo
            </button>

            {uploadedSong && (
              <button
                type="button"
                onClick={() => onSelectExercise(uploadedSong)}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#080808] px-5 py-2.5 text-sm font-bold text-[#FFD000] shadow-[3px_3px_0_#FFFFFF] cursor-pointer transition-transform hover:-translate-y-0.5"
              >
                <Play className="h-4 w-4" />
                Play Uploaded Song
              </button>
            )}

            <button
              type="button"
              onClick={scrollToAudioToSheet}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#3898EC] px-5 py-2.5 text-sm font-bold text-white shadow-[3px_3px_0_#080808] cursor-pointer transition-transform hover:-translate-y-0.5"
            >
              <Mic className="h-4 w-4" />
              Record Instrument &rarr; Sheet
            </button>

            <button
              type="button"
              onClick={onOpenGame}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#10B981] px-5 py-2.5 text-sm font-bold text-[#080808] shadow-[3px_3px_0_#080808] whitespace-nowrap shrink-0 cursor-pointer transition-transform hover:-translate-y-0.5"
            >
              <Gamepad2 className="h-4 w-4" />
              Play Melody Dash
            </button>

            <button
              type="button"
              onClick={onOpenCalibration}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-white px-4 py-2.5 text-sm font-bold text-[#080808] shadow-[3px_3px_0_#080808] whitespace-nowrap shrink-0 cursor-pointer transition-transform hover:-translate-y-0.5"
            >
              <Sliders className="h-4 w-4 text-[#EC4899]" />
              Calibrate Mic ({calibration.referenceA4Hz.toFixed(0)} Hz)
            </button>

            <button
              type="button"
              onClick={onOpenTeacherStudio}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-white px-4 py-2.5 text-sm font-bold text-[#080808] shadow-[3px_3px_0_#080808] whitespace-nowrap shrink-0 cursor-pointer transition-transform hover:-translate-y-0.5"
            >
              <Upload className="h-4 w-4 text-[#2D40EA]" />
              Teacher Studio
            </button>
          </div>
          <p className="text-xs font-semibold text-[#080808]/80 tabular-nums">
            Global Mic Tuning: {calibration.instrumentLabel} · A4 = {calibration.referenceA4Hz.toFixed(1)} Hz
            {calibration.semitoneTranspose !== 0
              ? ` · ${calibration.semitoneTranspose > 0 ? '+' : ''}${calibration.semitoneTranspose} semitones`
              : ''}
          </p>
        </div>

        {/* Illustrated Studio Focus Cards */}
        <div className="grid grid-cols-3 gap-3 lg:col-span-5">
          {[
            {
              title: 'Rhythm Lab',
              subtitle: 'Clap & Knock',
              accent: 'bg-[#FF6565]',
              src: COVER_BY_FOCUS.Rhythm,
              alt: 'Metronome and percussion sticks illustration',
            },
            {
              title: 'Pitch Tuner',
              subtitle: 'Sing & Play',
              accent: 'bg-[#3898EC]',
              src: COVER_BY_FOCUS.Pitch,
              alt: 'Tuning fork and piano keyboard illustration',
            },
            {
              title: 'Two-Hand Sync',
              subtitle: 'Coordination',
              accent: 'bg-[#EC4899]',
              src: COVER_BY_FOCUS.Coordination,
              alt: 'Grand staff two-hand arcs illustration',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-[#080808] bg-white shadow-[3px_3px_0_#080808]"
            >
              <div className={`h-2 w-full border-b-2 border-[#080808] ${item.accent}`} />
              <div className="aspect-[4/5] w-full overflow-hidden border-b-2 border-[#080808] bg-[#FFFDF4]">
                {!failedImages.has(item.src) ? (
                  <img
                    src={item.src}
                    alt={item.alt}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedImages((prev) => new Set(prev).add(item.src))
                    }
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#FFF9D6]">
                    <Music className="h-6 w-6 text-[#080808]" />
                  </div>
                )}
              </div>
              <div className="px-2.5 py-2.5">
                <div className="truncate text-xs font-bold text-[#080808]">{item.title}</div>
                <div className="truncate text-[11px] font-medium text-slate-600">
                  {item.subtitle}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Instant Camera / Photo Sheet Music Scanner */}
      <div ref={scannerSectionRef}>
        <SheetPhotoScanner
          authorId={authorId}
          authorName={authorName}
          onStartExercise={onSelectExercise}
          onSaveExercise={onSaveScannedExercise}
        />
      </div>

      {/* Record or Upload Any Instrument Sound -> MusicXML Sheet Music */}
      <div ref={audioToSheetRef}>
        <AudioToSheetStudio
          authorId={authorId}
          authorName={authorName}
          onStartExercise={onSelectExercise}
          onSaveExercise={onSaveScannedExercise}
        />
      </div>

      {/* Interactive Rainbow Xylophone & Drum Warm-Up Playground */}
      <WarmupSoundboard />

      {/* Filter Toolbar & Song Library Grid */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white p-1">
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
                {tab === 'All' ? 'All Repertoire' : tab}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#080808]" />
            <input
              type="search"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search songs or composers..."
              aria-label="Search exercises"
              className="w-full rounded-xl border-2 border-[#080808] bg-white py-2 pl-9 pr-3 text-sm font-medium text-[#080808] placeholder:text-slate-500 focus:bg-[#FFFDF4] focus:outline-none"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border-2 border-[#080808] bg-white p-10 text-center text-sm font-medium text-slate-700">
            No matching exercises found. Try clearing your filter, scanning a sheet photo above, or creating one in Teacher Studio.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((ex) => {
              const coverSrc = ex.coverImage || COVER_BY_FOCUS[ex.focus];
              return (
                <article
                  key={ex.id}
                  className="flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-[#080808] bg-white shadow-[4px_4px_0_#080808] transition-transform hover:-translate-y-0.5"
                >
                  <div>
                    <div className={`h-2 w-full border-b-2 border-[#080808] ${CARD_TOP_ACCENT[ex.focus]}`} />
                    <div className="aspect-[4/3] w-full overflow-hidden border-b-2 border-[#080808] bg-[#FFFDF4]">
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

                    <div className="p-5 space-y-2">
                      <div className="text-xs font-bold text-[#2D40EA] tabular-nums">
                        {ex.focus} · {ex.difficulty} · {ex.timeSignature} · {ex.bpm} BPM
                      </div>
                      <h2 className="font-display text-lg font-bold text-[#080808]">
                        {ex.title}
                      </h2>
                      <p className="text-xs font-semibold text-slate-600">
                        {ex.composer} · Prepared by {ex.authorName}
                      </p>
                      <p className="pt-1 text-xs leading-relaxed text-slate-700 line-clamp-2">
                        {ex.coachingTip}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t-2 border-[#080808] bg-[#FFFDF4] px-5 py-3.5">
                    <span className="font-mono text-xs font-bold text-[#080808] tabular-nums">
                      4 Activities · {ex.notes.length} notes
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectExercise(ex)}
                      className="min-h-[38px] rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-1.5 text-xs font-bold text-[#080808] cursor-pointer transition-colors hover:bg-[#3898EC] hover:text-white"
                    >
                      Start Practice
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
