import { useMemo, useState } from 'react';
import { Music, Play, Search, Upload } from 'lucide-react';
import type { ExerciseFocus, MusicExercise } from '../types/music';

interface PracticeHubProps {
  exercises: MusicExercise[];
  onSelectExercise: (exercise: MusicExercise) => void;
  onOpenTeacherStudio: () => void;
}

const COVER_BY_FOCUS: Record<ExerciseFocus, string> = {
  Rhythm: '/src/assets/images/cover_rhythm_atelier_1794840363449.jpg',
  Pitch: '/src/assets/images/cover_pitch_conservatory_1794840362925.jpg',
  Coordination: '/src/assets/images/cover_coordination_studio_1794840363772.jpg',
  Complete: '/src/assets/images/cover_pitch_conservatory_1794840362925.jpg',
};

export function PracticeHub({
  exercises,
  onSelectExercise,
  onOpenTeacherStudio,
}: PracticeHubProps) {
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

  const featured = exercises[0];

  return (
    <section className="mx-auto max-w-[1360px] px-6 py-8 space-y-10">
      {/* Editorial Hero Split */}
      <div className="grid grid-cols-1 items-stretch gap-8 rounded-2xl border border-slate-200 bg-white p-6 md:p-8 lg:grid-cols-12">
        <div className="flex flex-col justify-between space-y-6 lg:col-span-7">
          <div className="space-y-3">
            <p className="text-xs font-medium text-blue-700">
              Real-Time Microphone Listening · MusicXML, ABC &amp; MIDI
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl [text-wrap:balance]">
              Turn any sheet score into interactive rhythm, pitch, and coordination drills.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-slate-600">
              Practice tapping on your desk, singing or playing your acoustic instrument into the
              chromatic tuner, training two-hand coordination, and recording takes to share with friends.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {featured && (
              <button
                type="button"
                onClick={() => onSelectExercise(featured)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white cursor-pointer transition-colors hover:bg-blue-800"
              >
                <Play className="h-4 w-4" />
                Practice Featured Song
              </button>
            )}
            <button
              type="button"
              onClick={onOpenTeacherStudio}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 cursor-pointer transition-colors hover:bg-slate-50"
            >
              <Upload className="h-4 w-4 text-slate-600" />
              Upload Notation as Teacher
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 lg:col-span-5">
          {[
            {
              title: 'Rhythm Lab',
              src: COVER_BY_FOCUS.Rhythm,
              alt: 'Metronome and percussion sticks illustration',
            },
            {
              title: 'Pitch Tuner',
              src: COVER_BY_FOCUS.Pitch,
              alt: 'Tuning fork and piano keyboard illustration',
            },
            {
              title: 'Coordination',
              src: COVER_BY_FOCUS.Coordination,
              alt: 'Grand staff two-hand arcs illustration',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
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
                  <div className="flex h-full w-full items-center justify-center bg-slate-100">
                    <Music className="h-6 w-6 text-slate-400" />
                  </div>
                )}
              </div>
              <div className="px-2.5 py-2 text-xs font-semibold text-slate-800">
                {item.title}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Toolbar & Song Library Grid */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['All', 'Rhythm', 'Pitch', 'Coordination', 'Complete'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFocusFilter(tab)}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  focusFilter === tab
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'All' ? 'All Repertoire' : tab}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search songs or composers..."
              aria-label="Search exercises"
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            No matching exercises found. Try clearing your filter or create one in Teacher Studio.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((ex) => {
              const coverSrc = ex.coverImage || COVER_BY_FOCUS[ex.focus];
              return (
                <article
                  key={ex.id}
                  className="flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-sm"
                >
                  <div>
                    <div className="aspect-[4/3] w-full overflow-hidden border-b border-slate-100 bg-slate-50">
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
                        <div className="flex h-full w-full items-center justify-center bg-slate-100">
                          <Music className="h-8 w-8 text-slate-400" />
                        </div>
                      )}
                    </div>

                    <div className="p-5 space-y-2">
                      <div className="text-xs text-slate-500">
                        {ex.focus} · {ex.difficulty} · {ex.timeSignature} · {ex.bpm} BPM
                      </div>
                      <h2 className="font-display text-lg font-semibold text-slate-900">
                        {ex.title}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {ex.composer} · Prepared by {ex.authorName}
                      </p>
                      <p className="pt-1 text-xs leading-relaxed text-slate-600 line-clamp-2">
                        {ex.coachingTip}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5">
                    <span className="font-mono text-xs text-slate-500 tabular-nums">
                      4 Activities · {ex.notes.length} notes
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectExercise(ex)}
                      className="min-h-[38px] rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white cursor-pointer transition-colors hover:bg-blue-700"
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
