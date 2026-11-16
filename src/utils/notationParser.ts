import ABCJS from 'abcjs';
import { Midi } from '@tonejs/midi';
import JSZip from 'jszip';
import type { HandAssignment, SongNote, SourceFormat } from '../types/music';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const octave = Math.floor(clamped / 12) - 1;
  return `${NOTE_NAMES[clamped % 12]}${octave}`;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidiAndCents(freq: number): { midi: number; noteName: string; cents: number } {
  const midiFloat = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  return {
    midi,
    noteName: midiToNoteName(midi),
    cents,
  };
}

export interface ParsedNotationResult {
  title: string;
  composer: string;
  bpm: number;
  timeSignature: string;
  keySignature: string;
  sourceFormat: SourceFormat;
  notationText: string;
  notes: SongNote[];
}

function parseTimeSignatureBeats(timeSig: string): number {
  const parts = timeSig.split('/').map((n) => parseInt(n.trim(), 10));
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1]) && parts[1] > 0) {
    return (parts[0] * 4) / parts[1];
  }
  return 4;
}

const PITCH_LETTER_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function abcPitchToMidi(pitchValue: number): number {
  // In abcjs, pitch 0 is middle C (C4 = MIDI 60) in diatonic steps (0..6 -> C..B)
  const scale = [0, 2, 4, 5, 7, 9, 11];
  const octaveOffset = Math.floor(pitchValue / 7);
  const step = ((pitchValue % 7) + 7) % 7;
  return 60 + octaveOffset * 12 + scale[step];
}

function getAbcKeyAccidentals(keyRoot: string): Record<number, number> {
  const sharpOrder = [5, 0, 7, 2, 9, 4, 11]; // F C G D A E B (semitones)
  const flatOrder = [11, 4, 9, 2, 7, 0, 5];  // B E A D G C F
  const clean = keyRoot.trim().replace(/\s+/g, '');
  const sharpCounts: Record<string, number> = {
    C: 0, Am: 0, Ddor: 0, G: 1, Em: 1, D: 2, Bm: 2, A: 3, 'F#m': 3,
    E: 4, 'C#m': 4, B: 5, 'G#m': 5, 'F#': 6, 'D#m': 6, 'C#': 7,
  };
  const flatCounts: Record<string, number> = {
    F: 1, Dm: 1, Bb: 2, Gm: 2, Eb: 3, Cm: 3, Ab: 4, Fm: 4, Db: 5, Bbm: 5, Gb: 6, Cb: 7,
  };
  const map: Record<number, number> = {};
  if (clean in sharpCounts) {
    for (let i = 0; i < sharpCounts[clean]; i++) map[sharpOrder[i]] = 1;
  } else if (clean in flatCounts) {
    for (let i = 0; i < flatCounts[clean]; i++) map[flatOrder[i]] = -1;
  }
  return map;
}

export function parseAbcNotation(abcText: string): ParsedNotationResult {
  const trimmed = abcText.trim();
  const parsedTunes = ABCJS.parseOnly(trimmed);
  const tune = parsedTunes[0];

  const titleMatch = trimmed.match(/^T:\s*(.+)$/m);
  const composerMatch = trimmed.match(/^C:\s*(.+)$/m);
  const meterMatch = trimmed.match(/^M:\s*(.+)$/m);
  const keyMatch = trimmed.match(/^K:\s*(.+)$/m);
  const tempoMatch = trimmed.match(/^Q:\s*(?:\d+\/\d+\s*=\s*)?(\d+)/m);

  const title = tune?.metaText?.title || titleMatch?.[1]?.trim() || 'Untitled Score';
  const composer = tune?.metaText?.composer || composerMatch?.[1]?.trim() || 'Traditional';
  const timeSignature = meterMatch?.[1]?.trim() || '4/4';
  const keySignature = keyMatch?.[1]?.trim() || 'C';
  const bpm = tempoMatch ? Math.min(220, Math.max(40, parseInt(tempoMatch[1], 10))) : 100;
  const beatsPerMeasure = parseTimeSignatureBeats(timeSignature);

  const notes: SongNote[] = [];
  const keyAccidentals = getAbcKeyAccidentals(keySignature);
  let cursorBeats = 0;

  if (tune && Array.isArray(tune.lines)) {
    for (const line of tune.lines) {
      if (!line.staff) continue;
      for (let staffIdx = 0; staffIdx < line.staff.length; staffIdx++) {
        const staff = line.staff[staffIdx];
        if (!staff.voices) continue;
        // Parse voice 0 primarily; if multi-staff, reset cursor per staff
        let staffBeat = staffIdx === 0 ? cursorBeats : 0;
        for (let voiceIdx = 0; voiceIdx < staff.voices.length; voiceIdx++) {
          const voice = staff.voices[voiceIdx];
          let beatPos = voiceIdx === 0 ? staffBeat : 0;
          const measureAccidentals: Record<number, number> = {};

          for (const el of voice) {
            if (el.el_type === 'bar') {
              for (const k of Object.keys(measureAccidentals)) {
                delete measureAccidentals[Number(k)];
              }
              continue;
            }
            if (el.el_type === 'note') {
              const durationBeats = Math.max(0.125, (el.duration || 0.25) * 4);
              const measureNum = Math.floor(beatPos / beatsPerMeasure) + 1;
              const isRest = Boolean(el.rest) || !el.pitches || el.pitches.length === 0;

              if (!isRest && el.pitches && el.pitches.length > 0) {
                const topPitch = el.pitches[el.pitches.length - 1];
                const baseMidi = abcPitchToMidi(topPitch.pitch);
                const diatonicMod = ((baseMidi % 12) + 12) % 12;
                let accidentalShift = 0;

                if (topPitch.accidental === 'sharp') {
                  accidentalShift = 1;
                  measureAccidentals[baseMidi] = 1;
                } else if (topPitch.accidental === 'dblsharp') {
                  accidentalShift = 2;
                  measureAccidentals[baseMidi] = 2;
                } else if (topPitch.accidental === 'flat') {
                  accidentalShift = -1;
                  measureAccidentals[baseMidi] = -1;
                } else if (topPitch.accidental === 'dblflat') {
                  accidentalShift = -2;
                  measureAccidentals[baseMidi] = -2;
                } else if (topPitch.accidental === 'natural') {
                  accidentalShift = 0;
                  measureAccidentals[baseMidi] = 0;
                } else if (baseMidi in measureAccidentals) {
                  accidentalShift = measureAccidentals[baseMidi];
                } else if (diatonicMod in keyAccidentals) {
                  accidentalShift = keyAccidentals[diatonicMod];
                }

                const midi = Math.max(36, Math.min(96, baseMidi + accidentalShift));
                const hand: HandAssignment =
                  staffIdx > 0 || voiceIdx > 0 || midi < 57 ? 'left' : 'right';

                notes.push({
                  id: `n_${notes.length + 1}`,
                  midi,
                  noteName: midiToNoteName(midi),
                  freq: Number(midiToFreq(midi).toFixed(2)),
                  beatStart: Number(beatPos.toFixed(3)),
                  durationBeats: Number(durationBeats.toFixed(3)),
                  measure: measureNum,
                  hand,
                  isRest: false,
                });
              }

              beatPos += durationBeats;
            }
          }
          if (staffIdx === 0 && voiceIdx === 0) {
            cursorBeats = beatPos;
          }
        }
      }
    }
  }

  // Fallback simple pattern if ABC had no extractable note events
  const finalNotes =
    notes.length > 0
      ? notes.slice(0, 400).sort((a, b) => a.beatStart - b.beatStart)
      : createFallbackNotes();

  return {
    title,
    composer,
    bpm,
    timeSignature,
    keySignature,
    sourceFormat: 'abc',
    notationText: trimmed,
    notes: finalNotes,
  };
}

export async function parseMusicXmlFile(file: File): Promise<ParsedNotationResult> {
  let xmlText = '';
  if (file.name.toLowerCase().endsWith('.mxl')) {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const xmlEntry = Object.keys(zip.files).find(
      (name) => name.endsWith('.xml') && !name.startsWith('META-INF')
    );
    if (!xmlEntry) {
      throw new Error('Could not find a MusicXML score inside the .mxl archive.');
    }
    xmlText = await zip.files[xmlEntry].async('string');
  } else {
    xmlText = await file.text();
  }
  return parseMusicXmlString(xmlText, file.name.replace(/\.(musicxml|xml|mxl)$/i, ''));
}

export function parseMusicXmlString(xmlText: string, fallbackTitle = 'Uploaded Score'): ParsedNotationResult {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid MusicXML file structure.');
  }

  const workTitle =
    doc.querySelector('work > work-title')?.textContent?.trim() ||
    doc.querySelector('movement-title')?.textContent?.trim() ||
    fallbackTitle;
  const composer =
    doc.querySelector('identification > creator[type="composer"]')?.textContent?.trim() ||
    doc.querySelector('identification > creator')?.textContent?.trim() ||
    'Uploaded Composer';

  const soundTempo = doc.querySelector('sound[tempo]')?.getAttribute('tempo');
  const perMinute = doc.querySelector('metronome > per-minute')?.textContent?.trim();
  const bpm = Math.min(
    220,
    Math.max(40, Math.round(Number(soundTempo || perMinute || 100) || 100))
  );

  const beatsEl = doc.querySelector('attributes > time > beats')?.textContent?.trim() || '4';
  const beatTypeEl = doc.querySelector('attributes > time > beat-type')?.textContent?.trim() || '4';
  const timeSignature = `${beatsEl}/${beatTypeEl}`;

  const fifths = Number(doc.querySelector('attributes > key > fifths')?.textContent?.trim() || '0');
  const fifthsNames: Record<number, string> = {
    '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F',
    0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B',
  };
  const keySignature = fifthsNames[fifths] || 'C';

  const parts = Array.from(doc.querySelectorAll('part'));
  const targetPart = parts[0];
  const notes: SongNote[] = [];

  if (targetPart) {
    let divisions = 1;
    let measureBeatOffset = 0;
    const measures = Array.from(targetPart.querySelectorAll('measure'));
    const beatsPerMeasure = parseTimeSignatureBeats(timeSignature);

    measures.forEach((measureEl, mIdx) => {
      const divText = measureEl.querySelector('attributes > divisions')?.textContent?.trim();
      if (divText && Number(divText) > 0) {
        divisions = Number(divText);
      }

      let cursorInMeasure = 0;
      let lastNoteStart = 0;
      const children = Array.from(measureEl.children);

      for (const child of children) {
        if (child.tagName === 'backup') {
          const dur = Number(child.querySelector('duration')?.textContent || '0');
          cursorInMeasure = Math.max(0, cursorInMeasure - dur / divisions);
        } else if (child.tagName === 'forward') {
          const dur = Number(child.querySelector('duration')?.textContent || '0');
          cursorInMeasure += dur / divisions;
        } else if (child.tagName === 'note') {
          const isChord = Boolean(child.querySelector('chord'));
          const isRest = Boolean(child.querySelector('rest'));
          const isGrace = Boolean(child.querySelector('grace'));
          const durVal = Number(child.querySelector('duration')?.textContent || divisions);
          const durationBeats = isGrace ? 0.25 : Math.max(0.125, durVal / divisions);
          const startInMeasure = isChord ? lastNoteStart : cursorInMeasure;
          const absoluteBeat = measureBeatOffset + startInMeasure;

          const tieStop = Array.from(child.querySelectorAll('tie')).some(
            (t) => t.getAttribute('type') === 'stop'
          );

          if (!isRest && !tieStop) {
            const step = child.querySelector('pitch > step')?.textContent?.trim() || 'C';
            const alter = Number(child.querySelector('pitch > alter')?.textContent?.trim() || '0');
            const octave = Number(child.querySelector('pitch > octave')?.textContent?.trim() || '4');
            const semitone = PITCH_LETTER_TO_SEMITONE[step.toUpperCase()] ?? 0;
            const midi = Math.max(36, Math.min(96, (octave + 1) * 12 + semitone + alter));
            const staffNum = Number(child.querySelector('staff')?.textContent?.trim() || '1');
            const hand: HandAssignment = staffNum >= 2 || midi < 57 ? 'left' : 'right';

            notes.push({
              id: `xml_${notes.length + 1}`,
              midi,
              noteName: midiToNoteName(midi),
              freq: Number(midiToFreq(midi).toFixed(2)),
              beatStart: Number(absoluteBeat.toFixed(3)),
              durationBeats: Number(durationBeats.toFixed(3)),
              measure: mIdx + 1,
              hand,
              isRest: false,
            });
          }

          if (!isChord && !isGrace) {
            lastNoteStart = cursorInMeasure;
            cursorInMeasure += durationBeats;
          }
        }
      }

      measureBeatOffset += Math.max(beatsPerMeasure, cursorInMeasure);
    });
  }

  return {
    title: workTitle,
    composer,
    bpm,
    timeSignature,
    keySignature,
    sourceFormat: 'musicxml',
    notationText: xmlText.slice(0, 118000),
    notes: notes.length > 0 ? notes.slice(0, 400) : createFallbackNotes(),
  };
}

export async function parseMidiFile(file: File): Promise<ParsedNotationResult> {
  const buffer = await file.arrayBuffer();
  const midi = new Midi(buffer);

  const bpm = Math.min(
    220,
    Math.max(40, Math.round(midi.header.tempos[0]?.bpm || 108))
  );
  const ts = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
  const timeSignature = `${ts[0]}/${ts[1]}`;
  const beatsPerMeasure = parseTimeSignatureBeats(timeSignature);
  const ppq = midi.header.ppq || 480;

  const rawNotes: SongNote[] = [];
  midi.tracks.forEach((track, trackIdx) => {
    track.notes.forEach((n) => {
      const beatStart = n.ticks / ppq;
      const durationBeats = Math.max(0.25, n.durationTicks / ppq);
      const hand: HandAssignment =
        trackIdx > 0 || n.midi < 58 ? 'left' : 'right';
      rawNotes.push({
        id: `mid_${rawNotes.length + 1}`,
        midi: Math.max(36, Math.min(96, n.midi)),
        noteName: midiToNoteName(n.midi),
        freq: Number(midiToFreq(n.midi).toFixed(2)),
        beatStart: Number(beatStart.toFixed(3)),
        durationBeats: Number(durationBeats.toFixed(3)),
        measure: Math.floor(beatStart / beatsPerMeasure) + 1,
        hand,
        isRest: false,
      });
    });
  });

  rawNotes.sort((a, b) => a.beatStart - b.beatStart);
  const sliced = rawNotes.slice(0, 300);
  const title = midi.name?.trim() || file.name.replace(/\.(mid|midi)$/i, '');
  const abcFallback = notesToAbc(title, 'MIDI Import', timeSignature, 'C', bpm, sliced);

  return {
    title,
    composer: 'MIDI Import',
    bpm,
    timeSignature,
    keySignature: 'C',
    sourceFormat: 'midi',
    notationText: abcFallback,
    notes: sliced.length > 0 ? sliced : createFallbackNotes(),
  };
}

function midiToAbcToken(midi: number, durationBeats: number): string {
  const letters = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
  const pitch = letters[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  let token = pitch;
  if (octave >= 5) {
    token = pitch.toLowerCase();
    for (let i = 5; i < octave; i++) token += "'";
  } else if (octave <= 3) {
    for (let i = 4; i > octave; i--) token += ',';
  }
  const eighths = Math.max(1, Math.round(durationBeats * 2));
  return eighths === 2 ? `${token}2` : eighths === 1 ? token : `${token}${eighths}`;
}

export function notesToAbc(
  title: string,
  composer: string,
  timeSignature: string,
  keySignature: string,
  bpm: number,
  notes: SongNote[]
): string {
  const beatsPerMeasure = parseTimeSignatureBeats(timeSignature);
  let body = '';
  let currentMeasure = 1;
  const maxNotes = notes.slice(0, 64);

  for (const note of maxNotes) {
    if (note.measure > currentMeasure) {
      body += ' | ';
      currentMeasure = note.measure;
    }
    body += `${midiToAbcToken(note.midi, note.durationBeats)} `;
  }
  if (!body.trim()) {
    body = 'C2 D2 E2 F2 | G4 G4 |]';
  } else {
    body += '|]';
  }

  return [
    'X:1',
    `T:${title}`,
    `C:${composer}`,
    `M:${timeSignature}`,
    'L:1/8',
    `Q:1/4=${bpm}`,
    `K:${keySignature}`,
    body,
  ].join('\n');
}

function createFallbackNotes(): SongNote[] {
  const pattern = [60, 62, 64, 65, 67, 67, 69, 69, 67];
  return pattern.map((midi, i) => ({
    id: `fb_${i + 1}`,
    midi,
    noteName: midiToNoteName(midi),
    freq: Number(midiToFreq(midi).toFixed(2)),
    beatStart: i,
    durationBeats: 1,
    measure: Math.floor(i / 4) + 1,
    hand: i % 2 === 0 ? 'right' : 'left',
    isRest: false,
  }));
}
