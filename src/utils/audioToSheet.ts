import {
  BasicPitch,
  addPitchBendsToNoteEvents,
  noteFramesToTime,
  outputToNotesPoly,
  type NoteEventTime,
} from '@spotify/basic-pitch';
import type { MusicExercise, SongNote } from '../types/music';
import {
  midiToFreq,
  midiToNoteName,
  notesToAbc,
  notesToMusicXml,
} from './notationParser';

const BASIC_PITCH_MODEL_URL = '/models/basic-pitch/model.json';

// Krumhansl-Schmuckler major & minor pitch-class key profiles (C=0 .. B=11)
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

let sharedBasicPitch: BasicPitch | null = null;

function getSharedBasicPitch(): BasicPitch {
  if (!sharedBasicPitch) {
    sharedBasicPitch = new BasicPitch(BASIC_PITCH_MODEL_URL);
  }
  return sharedBasicPitch;
}

export async function decodeAndResampleTo22050(audioBlob: Blob): Promise<AudioBuffer> {
  const arrayBuf = await audioBlob.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AudioCtx();
  try {
    const decoded = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
    const targetRate = 22050;
    const duration = Math.min(decoded.duration, 90); // cap at 90s for responsive browser transcription
    const targetFrames = Math.max(targetRate, Math.ceil(duration * targetRate));
    const offline = new OfflineAudioContext(1, targetFrames, targetRate);

    // Downmix multi-channel audio cleanly into mono buffer
    const monoBuffer = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    const outChannel = monoBuffer.getChannelData(0);
    const chCount = decoded.numberOfChannels;
    for (let ch = 0; ch < chCount; ch++) {
      const chData = decoded.getChannelData(ch);
      for (let i = 0; i < decoded.length; i++) {
        outChannel[i] += chData[i] / chCount;
      }
    }

    const src = offline.createBufferSource();
    src.buffer = monoBuffer;
    src.connect(offline.destination);
    src.start(0);
    return await offline.startRendering();
  } finally {
    await decodeCtx.close().catch(() => {});
  }
}

function detectKeyFromMidis(events: { midi: number; durationBeats: number }[]): string {
  if (events.length === 0) return 'C';
  const weights = new Array<number>(12).fill(0);
  for (const ev of events) {
    const pc = ((ev.midi % 12) + 12) % 12;
    weights[pc] += Math.max(0.25, ev.durationBeats);
  }

  let bestScore = -Infinity;
  let bestKey = 'C';

  for (let tonic = 0; tonic < 12; tonic++) {
    let majScore = 0;
    let minScore = 0;
    for (let i = 0; i < 12; i++) {
      const w = weights[(tonic + i) % 12];
      majScore += w * MAJOR_PROFILE[i];
      minScore += w * MINOR_PROFILE[i];
    }
    if (majScore > bestScore) {
      bestScore = majScore;
      bestKey = MAJOR_KEYS[tonic];
    }
    if (minScore > bestScore) {
      bestScore = minScore;
      bestKey = MINOR_KEYS[tonic];
    }
  }
  return bestKey;
}

function estimateBpmFromOnsets(events: NoteEventTime[]): number {
  if (events.length < 4) return 100;
  const sorted = [...events].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

  // Deduplicate chord clusters (<70ms apart) before measuring inter-onset intervals
  const distinctOnsets: number[] = [];
  for (const ev of sorted) {
    if (
      distinctOnsets.length === 0 ||
      ev.startTimeSeconds - distinctOnsets[distinctOnsets.length - 1] > 0.07
    ) {
      distinctOnsets.push(ev.startTimeSeconds);
    }
  }
  if (distinctOnsets.length < 3) return 100;

  // Histogram voting across plausible 65..155 BPM candidates
  let bestBpm = 100;
  let bestFit = -Infinity;

  for (let candidateBpm = 66; candidateBpm <= 152; candidateBpm += 2) {
    const beatSec = 60 / candidateBpm;
    let fit = 0;
    for (let i = 0; i < distinctOnsets.length; i++) {
      const shifted = distinctOnsets[i] - distinctOnsets[0];
      const subBeatPos = (shifted / beatSec) * 2; // 8th-note grid
      const dist = Math.abs(subBeatPos - Math.round(subBeatPos));
      fit += Math.max(0, 0.25 - dist);
    }
    if (fit > bestFit) {
      bestFit = fit;
      bestBpm = candidateBpm;
    }
  }
  return bestBpm;
}

function parseBeatsPerMeasure(ts: string): number {
  const [nStr, dStr] = ts.split('/');
  const n = parseInt(nStr || '4', 10) || 4;
  const d = parseInt(dStr || '4', 10) || 4;
  return (n * 4) / d;
}

export interface AudioTranscriptionOptions {
  title: string;
  instrument: string;
  timeSignature: string;
  bpmOverride?: number;
  onsetThreshold?: number;
  frameThreshold?: number;
  authorId: string;
  authorName: string;
  onProgress?: (percent: number, stage: string) => void;
}

export interface AudioTranscriptionResult {
  exercise: MusicExercise;
  musicXml: string;
  abcNotation: string;
  detectedBpm: number;
  detectedKey: string;
  rawEventsCount: number;
  quantizedNotesCount: number;
}

export async function transcribeAudioToSheet(
  audioBlob: Blob,
  options: AudioTranscriptionOptions
): Promise<AudioTranscriptionResult> {
  options.onProgress?.(5, 'Decoding & resampling instrument audio to 22.05 kHz...');
  const resampledBuffer = await decodeAndResampleTo22050(audioBlob);

  const pcm = resampledBuffer.getChannelData(0);
  let peakAmp = 0;
  for (let i = 0; i < pcm.length; i++) {
    const abs = Math.abs(pcm[i]);
    if (abs > peakAmp) peakAmp = abs;
  }
  if (peakAmp < 0.003) {
    throw new Error(
      'The recording is too quiet to detect notes. Move closer to your instrument or increase input gain.'
    );
  }

  options.onProgress?.(18, 'Loading Spotify Basic Pitch neural transcription model...');
  const basicPitch = getSharedBasicPitch();
  try {
    await basicPitch.model;
  } catch (err) {
    sharedBasicPitch = null;
    throw err;
  }

  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  await basicPitch.evaluateModel(
    resampledBuffer,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (pct) => {
      const mapped = 20 + Math.round(pct * 65);
      options.onProgress?.(mapped, `Analyzing harmonic overtones & pitch (${Math.round(pct * 100)}%)...`);
    }
  );

  options.onProgress?.(88, 'Extracting polyphonic MIDI notes & quantizing sheet rhythm...');

  const onsetThresh = options.onsetThreshold ?? 0.45;
  const frameThresh = options.frameThreshold ?? 0.32;
  const rawNoteEvents = outputToNotesPoly(
    frames,
    onsets,
    onsetThresh,
    frameThresh,
    6,     // minNoteLen frames (~70ms)
    true,  // inferOnsets
    1800,  // maxFreq Hz
    50,    // minFreq Hz
    true,  // melodiaTrick
    11     // energyTolerance
  );
  const withBends = addPitchBendsToNoteEvents(contours, rawNoteEvents);
  const timedNotes = noteFramesToTime(withBends)
    .filter((n) => n.amplitude >= 0.16 && n.pitchMidi >= 36 && n.pitchMidi <= 96)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);

  if (timedNotes.length === 0) {
    throw new Error(
      'No clear musical notes were detected. Try playing louder, closer to the microphone, or lowering the sensitivity threshold.'
    );
  }

  const firstStartSec = timedNotes[0].startTimeSeconds;
  const detectedBpm = options.bpmOverride && options.bpmOverride > 0
    ? options.bpmOverride
    : estimateBpmFromOnsets(timedNotes);
  const beatsPerSecond = detectedBpm / 60;
  const beatsPerMeasure = parseBeatsPerMeasure(options.timeSignature);

  // Quantize timings onto 1/4-beat (16th-note) grid & group simultaneous notes into chords
  const gridStep = 0.25;
  const beatBuckets = new Map<number, { midis: number[]; durationBeats: number }>();

  for (const ev of timedNotes) {
    const rawBeat = Math.max(0, (ev.startTimeSeconds - firstStartSec) * beatsPerSecond);
    const quantBeat = Math.round(rawBeat / gridStep) * gridStep;
    const rawDurBeats = Math.max(0.25, ev.durationSeconds * beatsPerSecond);
    const quantDur = Math.min(4, Math.max(0.25, Math.round(rawDurBeats / 0.25) * 0.25));
    const midi = Math.max(36, Math.min(96, Math.round(ev.pitchMidi)));

    const existing = beatBuckets.get(quantBeat);
    if (!existing) {
      beatBuckets.set(quantBeat, { midis: [midi], durationBeats: quantDur });
    } else {
      if (!existing.midis.includes(midi)) {
        existing.midis.push(midi);
      }
      existing.durationBeats = Math.max(existing.durationBeats, quantDur);
    }
  }

  const sortedBeats = Array.from(beatBuckets.keys()).sort((a, b) => a - b);
  const songNotes: SongNote[] = [];

  for (let i = 0; i < sortedBeats.length && songNotes.length < 240; i++) {
    const beatStart = sortedBeats[i];
    const bucket = beatBuckets.get(beatStart)!;
    const midis = [...bucket.midis].sort((a, b) => a - b);
    const topMidi = midis[midis.length - 1];

    // Prevent overlapping durations from overflowing into the next note's onset
    const nextBeat = i + 1 < sortedBeats.length ? sortedBeats[i + 1] : beatStart + bucket.durationBeats;
    const clampedDur = Math.max(0.25, Math.min(bucket.durationBeats, nextBeat - beatStart));

    songNotes.push({
      id: `bp_${i + 1}`,
      midi: topMidi,
      chordMidis: midis.length > 1 ? midis : undefined,
      noteName: midiToNoteName(topMidi),
      freq: Number(midiToFreq(topMidi).toFixed(2)),
      beatStart: Number(beatStart.toFixed(3)),
      durationBeats: Number(clampedDur.toFixed(3)),
      measure: Math.floor(beatStart / beatsPerMeasure) + 1,
      hand: topMidi < 53 && midis.length === 1 ? 'left' : 'right',
      isRest: false,
    });
  }

  const detectedKey = detectKeyFromMidis(songNotes);
  const cleanTitle = options.title.trim() || `${options.instrument} Recording`;
  const composerLabel = `${options.instrument} · Transcribed via Basic Pitch`;

  const musicXml = notesToMusicXml({
    title: cleanTitle,
    composer: composerLabel,
    timeSignature: options.timeSignature,
    keySignature: detectedKey,
    bpm: detectedBpm,
    notes: songNotes,
  });

  const abcNotation = notesToAbc(
    cleanTitle,
    composerLabel,
    options.timeSignature,
    detectedKey,
    detectedBpm,
    songNotes
  );

  const exercise: MusicExercise = {
    id: `bp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    authorId: options.authorId,
    authorName: options.authorName,
    title: cleanTitle,
    composer: composerLabel,
    sourceFormat: 'musicxml',
    notationText: musicXml,
    bpm: detectedBpm,
    timeSignature: options.timeSignature,
    keySignature: detectedKey,
    difficulty: songNotes.length > 35 ? 'Intermediate' : 'Beginner',
    focus: 'Complete',
    coachingTip: `Transcribed directly from your ${options.instrument} recording! Slow the tempo down to 80% first or tap out the transcribed rhythms.`,
    notes: songNotes,
    isPublic: true,
    playsCount: 0,
  };

  options.onProgress?.(100, 'Sheet music engraved & ready to practice!');

  return {
    exercise,
    musicXml,
    abcNotation,
    detectedBpm,
    detectedKey,
    rawEventsCount: timedNotes.length,
    quantizedNotesCount: songNotes.length,
  };
}
