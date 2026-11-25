import { useMemo, useState } from 'react';
import { FileUp, Play, Plus, Square, Trash2 } from 'lucide-react';
import type {
  DifficultyLevel,
  ExerciseFocus,
  MusicExercise,
  SourceFormat,
} from '../types/music';
import {
  parseAbcNotation,
  parseMidiFile,
  parseMusicXmlFile,
} from '../utils/notationParser';
import { audioEngine } from '../utils/audioEngine';
import { AudioToSheetStudio } from './AudioToSheetStudio';
import { SheetMusicViewer } from './SheetMusicViewer';
import { SheetPhotoScanner } from './SheetPhotoScanner';

interface TeacherStudioProps {
  authorId: string;
  authorName: string;
  myExercises: MusicExercise[];
  onPublishExercise: (
    exercise: Omit<MusicExercise, 'playsCount' | 'createdAtMs'>
  ) => Promise<void>;
  onDeleteExercise: (exerciseId: string) => Promise<void>;
  onPracticeExercise: (exercise: MusicExercise) => void;
  embedded?: boolean;
}

const QUICK_TEMPLATES: { label: string; abc: string }[] = [
  {
    label: 'C Major Scale & Arpeggio',
    abc: `X:1
T:C Major Scale & Triad Warmup
C:Studio Warmup
M:4/4
L:1/8
Q:1/4=96
K:C
C2 D2 E2 F2 | G2 A2 B2 c2 | c2 G2 E2 C2 | C2 E2 G2 c2 |]`,
  },
  {
    label: 'Syncopated Rhythm Clapping',
    abc: `X:1
T:Eighth-Note Syncopation Drill
C:Rhythm Curriculum
M:4/4
L:1/8
Q:1/4=92
K:C
C2 C C z C C2 | C C2 C z C C2 | C2 z C C C C2 | C4 z4 |]`,
  },
  {
    label: 'Two-Hand Folk Canon',
    abc: `X:1
T:Two-Hand Folk Canon
C:Ensemble Etude
M:3/4
L:1/8
Q:1/4=108
K:G
G,2 B2 d2 | D2 c2 A2 | G,2 B2 d2 | G2 B2 G2 |
C,2 e2 c2 | G,2 d2 B2 | D2 A2 F2 | G6 |]`,
  },
];

export function TeacherStudio({
  authorId,
  authorName,
  myExercises,
  onPublishExercise,
  onDeleteExercise,
  onPracticeExercise,
  embedded = false,
}: TeacherStudioProps) {
  const [abcInput, setAbcInput] = useState<string>(QUICK_TEMPLATES[0].abc);
  const [sourceFormat, setSourceFormat] = useState<SourceFormat>('abc');
  const [rawNotationText, setRawNotationText] = useState<string>(QUICK_TEMPLATES[0].abc);
  const [title, setTitle] = useState<string>('C Major Scale & Triad Warmup');
  const [composer, setComposer] = useState<string>('Studio Warmup');
  const [bpm, setBpm] = useState<number>(96);
  const [timeSignature, setTimeSignature] = useState<string>('4/4');
  const [keySignature, setKeySignature] = useState<string>('C');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Beginner');
  const [focus, setFocus] = useState<ExerciseFocus>('Complete');
  const [coachingTip, setCoachingTip] = useState<string>(
    'Practice slowly at 80% speed first, then challenge yourself at full tempo.'
  );
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [uploadedNotes, setUploadedNotes] = useState<MusicExercise['notes'] | null>(null);
  const [parseStatus, setParseStatus] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);

  const parsedPreview = useMemo(() => {
    if (sourceFormat === 'abc') {
      try {
        return parseAbcNotation(abcInput);
      } catch {
        return null;
      }
    }
    return null;
  }, [abcInput, sourceFormat]);

  const previewExercise = useMemo<MusicExercise>(() => {
    const notes =
      sourceFormat === 'abc' && parsedPreview
        ? parsedPreview.notes
        : uploadedNotes || [];
    return {
      id: 'teacher-preview',
      authorId,
      authorName,
      title: title || 'Untitled Exercise',
      composer: composer || 'Teacher Arrangement',
      sourceFormat,
      notationText: sourceFormat === 'abc' ? abcInput : rawNotationText,
      bpm,
      timeSignature,
      keySignature,
      difficulty,
      focus,
      coachingTip,
      notes,
      isPublic,
      playsCount: 0,
    };
  }, [
    abcInput,
    authorId,
    authorName,
    bpm,
    coachingTip,
    composer,
    difficulty,
    focus,
    isPublic,
    keySignature,
    parsedPreview,
    rawNotationText,
    sourceFormat,
    timeSignature,
    title,
    uploadedNotes,
  ]);

  const handleFileUpload = async (file: File) => {
    setParseStatus(null);
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.abc') || lower.endsWith('.txt')) {
        const text = await file.text();
        const parsed = parseAbcNotation(text);
        setSourceFormat('abc');
        setAbcInput(parsed.notationText);
        setRawNotationText(parsed.notationText);
        setTitle(parsed.title);
        setComposer(parsed.composer);
        setBpm(parsed.bpm);
        setTimeSignature(parsed.timeSignature);
        setKeySignature(parsed.keySignature);
        setUploadedNotes(null);
        setParseStatus(`Parsed ${parsed.notes.length} notes from ABC file.`);
      } else if (lower.endsWith('.xml') || lower.endsWith('.musicxml') || lower.endsWith('.mxl')) {
        const parsed = await parseMusicXmlFile(file);
        setSourceFormat('musicxml');
        setRawNotationText(parsed.notationText);
        setTitle(parsed.title);
        setComposer(parsed.composer);
        setBpm(parsed.bpm);
        setTimeSignature(parsed.timeSignature);
        setKeySignature(parsed.keySignature);
        setUploadedNotes(parsed.notes);
        setParseStatus(`Parsed ${parsed.notes.length} notes from MusicXML score.`);
      } else if (lower.endsWith('.mid') || lower.endsWith('.midi')) {
        const parsed = await parseMidiFile(file);
        setSourceFormat('abc');
        setAbcInput(parsed.notationText);
        setRawNotationText(parsed.notationText);
        setTitle(parsed.title);
        setComposer(parsed.composer);
        setBpm(parsed.bpm);
        setTimeSignature(parsed.timeSignature);
        setKeySignature(parsed.keySignature);
        setUploadedNotes(parsed.notes);
        setParseStatus(`Imported ${parsed.notes.length} notes from MIDI file.`);
      } else {
        setParseStatus('Unsupported file format. Please upload .musicxml, .xml, .mxl, .abc, or .mid.');
      }
    } catch (err) {
      setParseStatus(err instanceof Error ? err.message : 'Failed to parse notation file.');
    }
  };

  const handleAbcChange = (nextAbc: string) => {
    setSourceFormat('abc');
    setAbcInput(nextAbc);
    setRawNotationText(nextAbc);
    setUploadedNotes(null);
    try {
      const p = parseAbcNotation(nextAbc);
      setTitle(p.title);
      setComposer(p.composer);
      setBpm(p.bpm);
      setTimeSignature(p.timeSignature);
      setKeySignature(p.keySignature);
    } catch {
      // Allow partial typing
    }
  };

  const previewAudio = async () => {
    if (isPreviewing) {
      setIsPreviewing(false);
      return;
    }
    await audioEngine.ensureToneReady();
    setIsPreviewing(true);
    const notes = previewExercise.notes.slice(0, 32);
    const secPerBeat = 60 / bpm;
    for (const n of notes) {
      setTimeout(() => {
        audioEngine.playNote(n.freq, Math.max(0.15, n.durationBeats * secPerBeat * 0.9), 0.7);
      }, n.beatStart * secPerBeat * 1000);
    }
    const totalMs =
      notes.reduce((m, n) => Math.max(m, (n.beatStart + n.durationBeats) * secPerBeat * 1000), 1000) + 300;
    setTimeout(() => setIsPreviewing(false), totalMs);
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (previewExercise.notes.length === 0) {
      setParseStatus('Add at least 1 valid note before publishing.');
      return;
    }
    setIsPublishing(true);
    try {
      const id = `ex_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await onPublishExercise({
        id,
        authorId,
        authorName,
        title: title.trim() || 'Untitled Exercise',
        composer: composer.trim() || 'Teacher Arrangement',
        sourceFormat,
        notationText: sourceFormat === 'abc' ? abcInput : rawNotationText,
        bpm,
        timeSignature,
        keySignature,
        difficulty,
        focus,
        coachingTip: coachingTip.trim(),
        notes: previewExercise.notes,
        isPublic,
      });
      setParseStatus('Published! All 4 learning activities (Rhythm, Pitch, Coordination, Stage) are ready.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <section className={embedded ? 'space-y-6' : 'mx-auto max-w-[1360px] px-6 py-8 space-y-8'}>
      {!embedded && (
        <>
          <div className="rounded-3xl border-2 border-[#080808] bg-[#FFD000] p-6 shadow-[4px_4px_0_#080808]">
            <h1 className="font-display text-3xl font-bold text-[#080808]">
              Teacher Exercise Studio
            </h1>
            <p className="mt-1 max-w-2xl text-sm font-medium text-[#080808]/90">
              Snap a sheet music photo or upload MusicXML (.musicxml, .xml, .mxl), ABC notation (.abc), or MIDI (.mid) scores.
              Every song automatically generates Rhythm Tap, Live Pitch, Two-Hand Coordination, and Stage Recording!
            </p>
          </div>

          <SheetPhotoScanner
            compact
            authorId={authorId}
            authorName={authorName}
            onStartExercise={onPracticeExercise}
            onSaveExercise={onPublishExercise}
          />

          <AudioToSheetStudio
            compact
            authorId={authorId}
            authorName={authorName}
            onStartExercise={onPracticeExercise}
            onSaveExercise={onPublishExercise}
          />
        </>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left: Upload & Notation Editor */}
        <form onSubmit={handlePublish} className="space-y-5 lg:col-span-6">
          <div className="rounded-2xl border-2 border-dashed border-[#080808] bg-white p-5">
            <label
              htmlFor="notation-file-upload"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 text-center"
            >
              <FileUp className="h-6 w-6 text-[#2D40EA]" />
              <span className="text-sm font-bold text-[#080808]">
                Upload Sheet Notation or MIDI File
              </span>
              <span className="text-xs font-medium text-slate-600">
                Supports .musicxml, .xml, .mxl (MuseScore/Finale/Sibelius), .abc, and .mid
              </span>
              <input
                id="notation-file-upload"
                type="file"
                accept=".xml,.musicxml,.mxl,.abc,.txt,.mid,.midi"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileUpload(file);
                }}
                className="sr-only"
              />
            </label>
          </div>

          {parseStatus && (
            <div className="rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-4 py-2.5 text-xs font-bold text-[#080808]">
              {parseStatus}
            </div>
          )}

          {/* Quick ABC Starter Templates */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-[#080808]">
              Or start from a notation template:
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => handleAbcChange(tpl.abc)}
                  className="min-h-[36px] rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFD000]"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {sourceFormat === 'abc' && (
            <div>
              <label
                htmlFor="abc-editor"
                className="mb-1.5 block text-xs font-bold text-[#080808]"
              >
                ABC Notation Source (Live Engraved)
              </label>
              <textarea
                id="abc-editor"
                rows={7}
                value={abcInput}
                onChange={(e) => handleAbcChange(e.target.value)}
                className="w-full rounded-xl border-2 border-[#080808] bg-white p-3 font-mono text-xs text-[#080808] focus:outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ex-title" className="mb-1 block text-xs font-bold text-[#080808]">
                Song / Exercise Title
              </label>
              <input
                id="ex-title"
                type="text"
                required
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-2 text-sm font-medium text-[#080808]"
              />
            </div>

            <div>
              <label htmlFor="ex-composer" className="mb-1 block text-xs font-bold text-[#080808]">
                Composer / Method Source
              </label>
              <input
                id="ex-composer"
                type="text"
                maxLength={80}
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-2 text-sm font-medium text-[#080808]"
              />
            </div>

            <div>
              <label htmlFor="ex-bpm" className="mb-1 block text-xs font-bold text-[#080808]">
                Target Tempo (BPM)
              </label>
              <input
                id="ex-bpm"
                type="number"
                min={40}
                max={220}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-2 font-mono text-sm font-bold text-[#080808]"
              />
            </div>

            <div>
              <label htmlFor="ex-diff" className="mb-1 block text-xs font-bold text-[#080808]">
                Difficulty Level
              </label>
              <select
                id="ex-diff"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-2 text-sm font-medium text-[#080808]"
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Master">Master</option>
              </select>
            </div>

            <div>
              <label htmlFor="ex-focus" className="mb-1 block text-xs font-bold text-[#080808]">
                Primary Skill Focus
              </label>
              <select
                id="ex-focus"
                value={focus}
                onChange={(e) => setFocus(e.target.value as ExerciseFocus)}
                className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-2 text-sm font-medium text-[#080808]"
              >
                <option value="Complete">Complete Song (All 4 Modes)</option>
                <option value="Rhythm">Rhythm</option>
                <option value="Pitch">Pitch & Intonation</option>
                <option value="Coordination">Coordination</option>
              </select>
            </div>

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-xs font-bold text-[#080808] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 accent-[#EC4899]"
                />
                Publish to Classroom Library
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="ex-tip" className="mb-1 block text-xs font-bold text-[#080808]">
              Teacher Coaching Tip for Students
            </label>
            <textarea
              id="ex-tip"
              rows={2}
              maxLength={400}
              value={coachingTip}
              onChange={(e) => setCoachingTip(e.target.value)}
              className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-2 text-sm text-[#080808]"
            />
          </div>

          <button
            type="submit"
            disabled={isPublishing}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-5 py-2.5 text-sm font-bold text-[#080808] shadow-[3px_3px_0_#080808] cursor-pointer hover:bg-[#FEC700] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {isPublishing ? 'Publishing Exercise...' : 'Create Exercise & Generate 4 Learning Activities'}
          </button>
        </form>

        {/* Right: Live Sheet Preview & Auto-Generated Activities */}
        <div className="space-y-5 lg:col-span-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-[#080808]">
              Live Score Preview ({previewExercise.notes.length} notes)
            </h2>
            <button
              type="button"
              onClick={previewAudio}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border-2 border-[#080808] bg-white px-3.5 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
            >
              {isPreviewing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPreviewing ? 'Previewing...' : 'Audition Score'}
            </button>
          </div>

          <SheetMusicViewer exercise={previewExercise} activeNoteIndex={-1} interactive />

          <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[3px_3px_0_#080808] space-y-3">
            <h3 className="font-display text-base font-bold text-[#080808]">
              Auto-Generated Learning Path for This Song
            </h3>
            <ul className="space-y-2 text-xs text-slate-700">
              <li>
                <strong className="text-[#EC4899]">01. Rhythm Tap &amp; Knock:</strong> Extracts all{' '}
                {previewExercise.notes.length} rhythmic onsets at {bpm} BPM for desk knocks or claps.
              </li>
              <li>
                <strong className="text-[#3898EC]">02. Pitch &amp; Instrument Lab:</strong> Tunes real-time
                voice or instrument intonation against {keySignature} pitches.
              </li>
              <li>
                <strong className="text-[#2D40EA]">03. Two-Hand Coordination:</strong> Pairs steady
                left-hand pulse with upper melodic accents.
              </li>
              <li>
                <strong className="text-[#080808]">04. Performance Stage:</strong> Records audio takes
                for student self-review and peer sharing.
              </li>
            </ul>
          </div>

          {/* Teacher's Published Exercises */}
          <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[3px_3px_0_#080808] space-y-3">
            <h3 className="font-display text-base font-bold text-[#080808]">
              Your Created Exercises ({myExercises.length})
            </h3>
            {myExercises.length === 0 ? (
              <p className="text-xs text-slate-600">
                Exercises you publish appear here for quick editing or classroom practice.
              </p>
            ) : (
              <div className="divide-y divide-slate-200">
                {myExercises.map((ex) => (
                  <div key={ex.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[#080808]">{ex.title}</div>
                      <div className="text-xs text-slate-600">
                        {ex.timeSignature} · {ex.bpm} BPM · {ex.notes.length} notes
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onPracticeExercise(ex)}
                        className="rounded-xl border-2 border-[#080808] bg-[#FFD000] px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#3898EC] hover:text-white"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteExercise(ex.id)}
                        aria-label={`Delete ${ex.title}`}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-[#FFDEDE] hover:text-[#FF6565] cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
