import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileMusic, Play, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow';
import type { MusicExercise } from '../../types/music';
import { audioEngine } from '../../utils/audioEngine';
import { midiToFreq, midiToNoteName, parseAbcNotation } from '../../utils/notationParser';

interface MuseScoreLabProps {
  authorId: string;
  authorName: string;
  onLaunchAsExercise: (exercise: MusicExercise) => void;
  onSaveToLibrary: (
    exercise: Omit<MusicExercise, 'playsCount' | 'createdAtMs'>
  ) => Promise<void>;
}

interface ScoreItem {
  id: string;
  midi: number; // 0 = rest
  duration: 'w' | 'h' | 'q' | '8';
  isRest?: boolean;
}

const DURATION_BEATS: Record<'w' | 'h' | 'q' | '8', number> = {
  w: 4,
  h: 2,
  q: 1,
  '8': 0.5,
};

const PALETTE_NOTES = [
  { midi: 60, label: 'C4' },
  { midi: 62, label: 'D4' },
  { midi: 64, label: 'E4' },
  { midi: 65, label: 'F4' },
  { midi: 67, label: 'G4' },
  { midi: 69, label: 'A4' },
  { midi: 71, label: 'B4' },
  { midi: 72, label: 'C5' },
  { midi: 74, label: 'D5' },
  { midi: 76, label: 'E5' },
];

function midiToVexAndXml(midi: number, clef: 'treble' | 'bass') {
  const clamped = Math.max(36, Math.min(84, clef === 'bass' ? midi - 12 : midi));
  const full = midiToNoteName(clamped);
  const m = full.match(/^([A-G])(#|b)?(\d)$/);
  if (!m) {
    return { key: 'c/4', acc: undefined, step: 'C', alter: 0, octave: 4 };
  }
  const alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return {
    key: `${m[1].toLowerCase()}${m[2] || ''}/${m[3]}`,
    acc: m[2],
    step: m[1],
    alter,
    octave: Number(m[3]),
    actualMidi: clamped,
  };
}

function midiToAbcNote(midi: number, beats: number): string {
  const names = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
  const oct = Math.floor(midi / 12) - 1;
  const pc = names[((midi % 12) + 12) % 12];
  let tok = pc;
  if (oct >= 5) {
    tok = `${pc.toLowerCase()}${oct > 5 ? "'".repeat(oct - 5) : ''}`;
  } else if (oct < 4) {
    tok = `${pc}${','.repeat(4 - oct)}`;
  }
  const eighths = Math.max(1, Math.round(beats * 2));
  return `${tok}${eighths === 1 ? '' : eighths}`;
}

export function MuseScoreLab({
  authorId,
  authorName,
  onLaunchAsExercise,
  onSaveToLibrary,
}: MuseScoreLabProps) {
  const [title, setTitle] = useState<string>('MuseScore Studio Etude');
  const [clef, setClef] = useState<'treble' | 'bass'>('treble');
  const [timeSig, setTimeSig] = useState<'4/4' | '3/4' | '2/4'>('4/4');
  const [bpm, setBpm] = useState<number>(100);
  const [transpose, setTranspose] = useState<number>(0);
  const [selectedDuration, setSelectedDuration] = useState<'w' | 'h' | 'q' | '8'>('q');
  const [accidentalShift, setAccidentalShift] = useState<0 | 1 | -1>(0);
  const [items, setItems] = useState<ScoreItem[]>([
    { id: 'ms1', midi: 60, duration: 'q' },
    { id: 'ms2', midi: 64, duration: 'q' },
    { id: 'ms3', midi: 67, duration: 'q' },
    { id: 'ms4', midi: 72, duration: 'q' },
    { id: 'ms5', midi: 69, duration: 'h' },
    { id: 'ms6', midi: 67, duration: 'h' },
  ]);
  const [playingIdx, setPlayingIdx] = useState<number>(-1);
  const [savedFlag, setSavedFlag] = useState<boolean>(false);

  const staffRef = useRef<HTMLDivElement | null>(null);

  const transposedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        effectiveMidi: item.isRest ? 0 : item.midi + transpose,
      })),
    [items, transpose]
  );

  // Live VexFlow engraving
  useEffect(() => {
    const el = staffRef.current;
    if (!el) return;
    el.innerHTML = '';

    try {
      const renderer = new Renderer(el, Renderer.Backends.SVG);
      const width = Math.max(640, transposedItems.length * 46 + 110);
      renderer.resize(width, 138);
      const ctx = renderer.getContext();
      const stave = new Stave(16, 16, width - 32);
      stave.addClef(clef).addTimeSignature(timeSig).setContext(ctx).draw();

      if (transposedItems.length === 0) return;

      const staveNotes = transposedItems.map((item, idx) => {
        if (item.isRest) {
          return new StaveNote({
            clef,
            keys: [clef === 'bass' ? 'd/3' : 'b/4'],
            duration: `${item.duration}r`,
          });
        }
        const info = midiToVexAndXml(item.effectiveMidi, clef);
        const sn = new StaveNote({ clef, keys: [info.key], duration: item.duration });
        if (info.acc) sn.addModifier(new Accidental(info.acc));
        if (idx === playingIdx) {
          sn.setStyle({ fillStyle: '#EC4899', strokeStyle: '#EC4899' });
        } else {
          sn.setStyle({ fillStyle: '#080808', strokeStyle: '#080808' });
        }
        return sn;
      });

      const totalBeats = transposedItems.reduce((sum, it) => sum + DURATION_BEATS[it.duration], 0);
      const voice = new Voice({ numBeats: Math.max(1, totalBeats), beatValue: 4 }).setMode(
        Voice.Mode.SOFT
      );
      voice.addTickables(staveNotes);
      new Formatter().joinVoices([voice]).format([voice], width - 120);
      voice.draw(ctx, stave);
    } catch {
      // Allow graceful partial bars
    }
  }, [clef, playingIdx, timeSig, transposedItems]);

  const addNote = (baseMidi: number) => {
    const finalMidi = baseMidi + accidentalShift;
    void audioEngine.ensureToneReady().then(() => {
      audioEngine.playNote(midiToFreq((clef === 'bass' ? finalMidi - 12 : finalMidi) + transpose), 0.3, 0.75);
    });
    setItems((prev) => [
      ...prev,
      { id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, midi: finalMidi, duration: selectedDuration },
    ]);
    setSavedFlag(false);
  };

  const addRest = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `ms_r_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        midi: 0,
        duration: selectedDuration,
        isRest: true,
      },
    ]);
    setSavedFlag(false);
  };

  const playScore = async () => {
    await audioEngine.ensureToneReady();
    const secPerBeat = 60 / bpm;
    let beatCursor = 0;
    transposedItems.forEach((item, idx) => {
      const dur = DURATION_BEATS[item.duration];
      const delayMs = beatCursor * secPerBeat * 1000;
      window.setTimeout(() => {
        setPlayingIdx(idx);
        if (!item.isRest) {
          const actual = clef === 'bass' ? item.effectiveMidi - 12 : item.effectiveMidi;
          audioEngine.playNote(midiToFreq(actual), Math.max(0.16, dur * secPerBeat * 0.9), 0.8);
        }
      }, delayMs);
      beatCursor += dur;
    });
    window.setTimeout(() => setPlayingIdx(-1), beatCursor * secPerBeat * 1000 + 250);
  };

  const downloadMusicXml = () => {
    const divisions = 2; // 2 per quarter so eighth = 1, quarter = 2, half = 4, whole = 8
    const xmlTypeMap = { w: 'whole', h: 'half', q: 'quarter', '8': 'eighth' } as const;
    const beatsPerBar = Number(timeSig.split('/')[0]);
    const clefSign = clef === 'treble' ? 'G' : 'F';
    const clefLine = clef === 'treble' ? '2' : '4';

    const notesXml = transposedItems
      .map((item) => {
        const durDiv = Math.round(DURATION_BEATS[item.duration] * divisions);
        if (item.isRest) {
          return `      <note><rest/><duration>${durDiv}</duration><type>${xmlTypeMap[item.duration]}</type></note>`;
        }
        const info = midiToVexAndXml(item.effectiveMidi, clef);
        return `      <note>
        <pitch><step>${info.step}</step>${info.alter !== 0 ? `<alter>${info.alter}</alter>` : ''}<octave>${info.octave}</octave></pitch>
        <duration>${durDiv}</duration>
        <type>${xmlTypeMap[item.duration]}</type>
      </note>`;
      })
      .join('\n');

    const xmlDoc = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${title.replace(/[<>&]/g, '')}</work-title></work>
  <part-list><score-part id="P1"><part-name>Score Part</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>${beatsPerBar}</beats><beat-type>4</beat-type></time>
        <clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>
      </attributes>
      <direction placement="above"><sound tempo="${bpm}"/></direction>
${notesXml}
    </measure>
  </part>
</score-partwise>`;

    const blob = new Blob([xmlDoc], { type: 'application/vnd.recordare.musicxml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'score'}.musicxml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildExerciseObject = () => {
    const abcTokens = transposedItems.map((it) => {
      const b = DURATION_BEATS[it.duration];
      const eighths = Math.max(1, Math.round(b * 2));
      if (it.isRest) return `z${eighths === 1 ? '' : eighths}`;
      const actual = clef === 'bass' ? it.effectiveMidi - 12 : it.effectiveMidi;
      return midiToAbcNote(actual, b);
    });
    const abc = `X:1
T:${title}
C:${authorName} (MuseScore Studio)
M:${timeSig}
L:1/8
Q:1/4=${bpm}
K:C
${abcTokens.join(' ')} |]`;
    const parsed = parseAbcNotation(abc);
    return {
      id: `musescore_${Date.now()}`,
      authorId,
      authorName,
      title: title || 'MuseScore Studio Etude',
      composer: 'MuseScore Web Scorewriter',
      sourceFormat: 'abc' as const,
      notationText: parsed.notationText,
      bpm,
      timeSignature: timeSig,
      keySignature: 'C',
      difficulty: 'Intermediate' as const,
      focus: 'Complete' as const,
      coachingTip: 'Practice the score you engraved and transposed in MuseScore Studio!',
      notes: parsed.notes,
      isPublic: true,
    };
  };

  return (
    <div className="rounded-3xl border-2 border-[#080808] bg-white p-6 shadow-[5px_5px_0_#080808] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#2D40EA]">
            <FileMusic className="h-4 w-4 text-[#EC4899]" />
            <span>musescore/MuseScore</span>
            <span aria-hidden="true">·</span>
            <span>Web Scorewriter, Transposer &amp; MusicXML Export</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-[#080808]">
            MuseScore Interactive Notation Engraver
          </h2>
          <p className="max-w-2xl text-xs font-medium text-slate-700">
            Write notes &amp; rests on Treble or Bass clef, transpose semitones instantaneously, audition live, export valid MusicXML 3.1 files, or launch directly into Practice Stage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void playScore()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-4 py-2 text-xs font-bold text-[#080808] shadow-[2px_2px_0_#080808] cursor-pointer"
          >
            <Play className="h-4 w-4" />
            Play Score
          </button>

          <button
            type="button"
            onClick={downloadMusicXml}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-3.5 py-2 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#FFF9D6]"
          >
            <Download className="h-4 w-4" />
            Export .musicxml
          </button>

          <button
            type="button"
            onClick={() => {
              const ex = buildExerciseObject();
              if (ex.notes.length > 0) onLaunchAsExercise({ ...ex, playsCount: 0 });
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#2D40EA] px-4 py-2 text-xs font-bold text-white cursor-pointer"
          >
            Practice in Stage
          </button>

          <button
            type="button"
            disabled={savedFlag}
            onClick={() => {
              const ex = buildExerciseObject();
              if (ex.notes.length > 0) {
                void onSaveToLibrary(ex).then(() => setSavedFlag(true));
              }
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#EC4899] px-3.5 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {savedFlag ? 'Saved!' : 'Save to Library'}
          </button>
        </div>
      </div>

      {/* Score Settings */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border-2 border-[#080808] bg-[#FFFDF4] p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="ms-title" className="mb-1 block text-xs font-bold text-[#080808]">
            Score Title
          </label>
          <input
            id="ms-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-bold text-[#080808]"
          />
        </div>

        <div>
          <label htmlFor="ms-clef" className="mb-1 block text-xs font-bold text-[#080808]">
            Clef
          </label>
          <select
            id="ms-clef"
            value={clef}
            onChange={(e) => setClef(e.target.value as 'treble' | 'bass')}
            className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-bold text-[#080808]"
          >
            <option value="treble">Treble Clef (G)</option>
            <option value="bass">Bass Clef (F)</option>
          </select>
        </div>

        <div>
          <label htmlFor="ms-timesig" className="mb-1 block text-xs font-bold text-[#080808]">
            Time Signature
          </label>
          <select
            id="ms-timesig"
            value={timeSig}
            onChange={(e) => setTimeSig(e.target.value as '4/4' | '3/4' | '2/4')}
            className="w-full rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 text-xs font-bold text-[#080808]"
          >
            <option value="4/4">4/4 Common</option>
            <option value="3/4">3/4 Waltz</option>
            <option value="2/4">2/4 March</option>
          </select>
        </div>

        <div>
          <label htmlFor="ms-bpm" className="mb-1 block text-xs font-bold text-[#080808] tabular-nums">
            Tempo: {bpm} BPM
          </label>
          <input
            id="ms-bpm"
            type="range"
            min={55}
            max={180}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="mt-1.5 w-full accent-[#2D40EA]"
          />
        </div>

        <div>
          <label htmlFor="ms-trans" className="mb-1 block text-xs font-bold text-[#080808] tabular-nums">
            Transpose: {transpose >= 0 ? `+${transpose}` : transpose} st
          </label>
          <input
            id="ms-trans"
            type="range"
            min={-5}
            max={5}
            value={transpose}
            onChange={(e) => setTranspose(Number(e.target.value))}
            className="mt-1.5 w-full accent-[#EC4899]"
          />
        </div>
      </div>

      {/* Live Engraved Score Canvas */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[#080808] bg-white p-3">
        <div ref={staffRef} />
      </div>

      {/* Note Duration, Accidentals & Pitch Entry Toolbar */}
      <div className="space-y-3 rounded-2xl border-2 border-[#080808] bg-[#FFF9D6] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-[#080808]">Duration:</span>
            {[
              { id: 'w' as const, label: 'Whole' },
              { id: 'h' as const, label: 'Half' },
              { id: 'q' as const, label: 'Quarter' },
              { id: '8' as const, label: 'Eighth' },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDuration(d.id)}
                className={`min-h-[34px] rounded-lg border-2 border-[#080808] px-3 py-1 text-xs font-bold cursor-pointer ${
                  selectedDuration === d.id ? 'bg-[#3898EC] text-white' : 'bg-white text-[#080808]'
                }`}
              >
                {d.label}
              </button>
            ))}

            <span className="ml-2 text-xs font-bold text-[#080808]">Accidental:</span>
            {[
              { val: -1 as const, label: '♭ Flat' },
              { val: 0 as const, label: '♮ Natural' },
              { val: 1 as const, label: '♯ Sharp' },
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => setAccidentalShift(a.val)}
                className={`min-h-[34px] rounded-lg border-2 border-[#080808] px-2.5 py-1 text-xs font-bold cursor-pointer ${
                  accidentalShift === a.val ? 'bg-[#EC4899] text-white' : 'bg-white text-[#080808]'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addRest}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border-2 border-[#080808] bg-white px-3 py-1 text-xs font-bold text-[#080808] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Rest
            </button>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.slice(0, -1))}
              disabled={items.length === 0}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border-2 border-[#080808] bg-white px-3 py-1 text-xs font-bold text-[#080808] cursor-pointer disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Undo Note
            </button>
            <button
              type="button"
              onClick={() => setItems([])}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border-2 border-[#080808] bg-[#FFDEDE] px-3 py-1 text-xs font-bold text-[#080808] cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PALETTE_NOTES.map((n) => (
            <button
              key={n.midi}
              type="button"
              onClick={() => addNote(n.midi)}
              className="min-h-[44px] min-w-[54px] rounded-xl border-2 border-[#080808] bg-white px-3 py-1.5 font-display text-xs font-bold text-[#080808] shadow-[2px_2px_0_#080808] cursor-pointer hover:bg-[#FFD000]"
            >
              + {clef === 'bass' ? midiToNoteName(n.midi - 12) : n.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
