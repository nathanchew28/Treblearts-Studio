import { Suspense, lazy } from 'react';
import { Camera, FileMusic, Mic } from 'lucide-react';
import type { MusicExercise } from '../types/music';

const AudioToSheetStudio = lazy(() =>
  import('./AudioToSheetStudio').then((m) => ({ default: m.AudioToSheetStudio }))
);
const SheetPhotoScanner = lazy(() =>
  import('./SheetPhotoScanner').then((m) => ({ default: m.SheetPhotoScanner }))
);
const TeacherStudio = lazy(() =>
  import('./TeacherStudio').then((m) => ({ default: m.TeacherStudio }))
);

export type CreateScanTool = 'scanner' | 'audio' | 'notation';

interface CreateScanHubProps {
  activeTool: CreateScanTool;
  onChangeTool: (tool: CreateScanTool) => void;
  authorId: string;
  authorName: string;
  myExercises: MusicExercise[];
  onPublishExercise: (
    exercise: Omit<MusicExercise, 'playsCount' | 'createdAtMs'>
  ) => Promise<void>;
  onDeleteExercise: (exerciseId: string) => Promise<void>;
  onPracticeExercise: (exercise: MusicExercise) => void;
  onAwardXp: (xp: number, label: string) => void;
}

const TOOL_TABS: {
  id: CreateScanTool;
  label: string;
  subtitle: string;
  icon: typeof Camera;
}[] = [
  {
    id: 'scanner',
    label: 'Photo Sheet Scanner',
    subtitle: 'Snap or upload sheet music photos',
    icon: Camera,
  },
  {
    id: 'audio',
    label: 'Audio to Sheet Music',
    subtitle: 'Record or upload any instrument sound',
    icon: Mic,
  },
  {
    id: 'notation',
    label: 'Notation & MIDI Studio',
    subtitle: 'Edit ABC, MusicXML, or MIDI & manage exercises',
    icon: FileMusic,
  },
];

export function CreateScanHub({
  activeTool,
  onChangeTool,
  authorId,
  authorName,
  myExercises,
  onPublishExercise,
  onDeleteExercise,
  onPracticeExercise,
  onAwardXp,
}: CreateScanHubProps) {
  return (
    <section className="mx-auto max-w-[1360px] px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[#080808] bg-[#FFD000] p-5 shadow-[4px_4px_0_#080808]">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#080808] sm:text-3xl">
            Create &amp; Scan Studio
          </h1>
          <p className="mt-0.5 text-xs font-medium text-[#080808]/90 sm:text-sm">
            Convert sheet music photos, live instrument recordings, or MusicXML/MIDI files into interactive exercises.
          </p>
        </div>

        <div
          className="grid w-full grid-cols-1 gap-2 rounded-xl border-2 border-[#080808] bg-white p-1.5 sm:w-auto sm:grid-cols-3"
          role="tablist"
          aria-label="Create and Scan Tools"
        >
          {TOOL_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTool === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChangeTool(tab.id)}
                className={`flex min-h-[44px] items-center gap-2 rounded-lg px-3.5 py-1.5 text-left cursor-pointer transition-colors ${
                  active
                    ? 'border-2 border-[#080808] bg-[#EC4899] text-white'
                    : 'border-2 border-transparent text-[#080808] hover:bg-[#FFF9D6]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold leading-tight">{tab.label}</div>
                  <div
                    className={`truncate text-[10px] font-medium ${
                      active ? 'text-white/90' : 'text-slate-600'
                    }`}
                  >
                    {tab.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Suspense
        fallback={
          <div className="rounded-2xl border-2 border-[#080808] bg-white p-8 text-center text-sm font-bold text-[#080808] shadow-[4px_4px_0_#080808]">
            Loading studio tool...
          </div>
        }
      >
        {activeTool === 'scanner' && (
          <SheetPhotoScanner
            authorId={authorId}
            authorName={authorName}
            onStartExercise={onPracticeExercise}
            onSaveExercise={onPublishExercise}
          />
        )}

        {activeTool === 'audio' && (
          <AudioToSheetStudio
            authorId={authorId}
            authorName={authorName}
            onStartExercise={onPracticeExercise}
            onSaveExercise={onPublishExercise}
            onAwardXp={onAwardXp}
          />
        )}

        {activeTool === 'notation' && (
          <TeacherStudio
            embedded
            authorId={authorId}
            authorName={authorName}
            myExercises={myExercises}
            onPublishExercise={onPublishExercise}
            onDeleteExercise={onDeleteExercise}
            onPracticeExercise={onPracticeExercise}
          />
        )}
      </Suspense>
    </section>
  );
}
