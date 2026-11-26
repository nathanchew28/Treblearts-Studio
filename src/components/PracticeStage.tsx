import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Hand,
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Share2,
  Sliders,
  Sparkles,
  Usb,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  ActivityType,
  MusicExercise,
  PitchReading,
  PracticeAttempt,
  SongNote,
} from '../types/music';
import { audioEngine } from '../utils/audioEngine';
import { getNoteColorInfo, type LearningExperienceMode } from '../utils/kidFriendlyTheme';
import { midiToFreq, midiToNoteName } from '../utils/notationParser';
import { MetronomeWidget, parseBeatsPerBar } from './MetronomeWidget';
import { PitchReferenceWidget } from './PitchReferenceWidget';
import {
  PomodoroNoticeBanner,
  PomodoroPracticeTimerCard,
  usePomodoroTimer,
} from './PomodoroPracticeTimer';
const RhythmTrainerModule = lazy(() =>
  import('./RhythmTrainerModule').then((m) => ({ default: m.RhythmTrainerModule }))
);
const SheetMusicViewer = lazy(() =>
  import('./SheetMusicViewer').then((m) => ({ default: m.SheetMusicViewer }))
);

interface PracticeStageProps {
  exercise: MusicExercise;
  learningMode: LearningExperienceMode;
  onChangeLearningMode: (mode: LearningExperienceMode) => void;
  onBackToLibrary: () => void;
  onCompleteAttempt: (attempt: PracticeAttempt) => void;
  onSharePerformance: (payload: {
    exercise: MusicExercise;
    activityType: ActivityType;
    instrument: string;
    score: number;
    accuracy: number;
    stars: number;
    durationSec: number;
    audioDataUrl: string;
  }) => Promise<string | null>;
  onOpenCalibration?: () => void;
}

interface TargetCue {
  id: string;
  beatStart: number;
  durationBeats: number;
  midi: number;
  chordMidis?: number[];
  noteName: string;
  freq: number;
  lane: 'right' | 'left';
  status: 'pending' | 'perfect' | 'good' | 'missed';
}

interface JudgmentFlash {
  text: string;
  color: string;
  subtext: string;
  createdAt: number;
}

interface HitParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
}

type StageTab = ActivityType | 'rhythm_trainer';

const ACTIVITY_TABS: { id: StageTab; label: string; subtitle: string }[] = [
  { id: 'rhythm', label: '1. Rhythm Tap & Knock', subtitle: 'Mic knocks or Spacebar' },
  { id: 'pitch', label: '2. Pitch & Instrument', subtitle: 'Live chromatic tuner' },
  { id: 'coordination', label: '3. Two-Hand Coordination', subtitle: 'Left pulse + Right melody' },
  { id: 'performance', label: '4. Record & Share Stage', subtitle: 'Full take & friend link' },
  { id: 'rhythm_trainer', label: '5. Rhythm Trainer', subtitle: 'Pattern drills + mic timing' },
];

const PIANO_KEYS = [
  { midi: 60, label: 'C4', keyHint: 'Z', sharp: false },
  { midi: 61, label: 'C#4', keyHint: 'S', sharp: true },
  { midi: 62, label: 'D4', keyHint: 'X', sharp: false },
  { midi: 63, label: 'D#4', keyHint: 'D', sharp: true },
  { midi: 64, label: 'E4', keyHint: 'C', sharp: false },
  { midi: 65, label: 'F4', keyHint: 'V', sharp: false },
  { midi: 66, label: 'F#4', keyHint: 'G', sharp: true },
  { midi: 67, label: 'G4', keyHint: 'B', sharp: false },
  { midi: 68, label: 'G#4', keyHint: 'H', sharp: true },
  { midi: 69, label: 'A4', keyHint: 'N', sharp: false },
  { midi: 70, label: 'A#4', keyHint: 'J', sharp: true },
  { midi: 71, label: 'B4', keyHint: 'M', sharp: false },
  { midi: 72, label: 'C5', keyHint: ',', sharp: false },
  { midi: 74, label: 'D5', keyHint: '.', sharp: false },
  { midi: 76, label: 'E5', keyHint: '/', sharp: false },
];

export function PracticeStage({
  exercise,
  learningMode,
  onChangeLearningMode,
  onBackToLibrary,
  onCompleteAttempt,
  onSharePerformance,
  onOpenCalibration,
}: PracticeStageProps) {
  const isKids = learningMode === 'kids';
  const [midiDeviceName, setMidiDeviceName] = useState<string | null>(null);
  const [stageTab, setStageTab] = useState<StageTab>('rhythm');
  const [sidebarTab, setSidebarTab] = useState<'metrics' | 'tools'>('metrics');
  const activity: ActivityType = stageTab === 'rhythm_trainer' ? 'rhythm' : stageTab;
  const [practiceBpm, setPracticeBpm] = useState<number>(() =>
    Math.max(30, Math.min(240, Math.round((exercise.bpm * (learningMode === 'kids' ? 85 : 100)) / 100)))
  );
  const [practiceTimeSignature, setPracticeTimeSignature] = useState<string>(exercise.timeSignature);
  const [exerciseBeatIndex, setExerciseBeatIndex] = useState<number>(-1);
  const [metronomeOn, setMetronomeOn] = useState<boolean>(true);
  const [guideAudioOn, setGuideAudioOn] = useState<boolean>(true);
  const [countInOn, setCountInOn] = useState<boolean>(true);
  const [guidedStepPitch, setGuidedStepPitch] = useState<boolean>(false);

  // Mic & DSP state
  const [micEnabled, setMicEnabled] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [tapThreshold, setTapThreshold] = useState<number>(0.085);
  const [liveRms, setLiveRms] = useState<number>(0);
  const [pitchReading, setPitchReading] = useState<PitchReading | null>(null);
  const [lastMicKnockAt, setLastMicKnockAt] = useState<number>(0);

  // Session run state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);
  const [activeNoteIndex, setActiveNoteIndex] = useState<number>(-1);
  const [stepCursorIndex, setStepCursorIndex] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [hitsCount, setHitsCount] = useState<number>(0);
  const [totalEvaluated, setTotalEvaluated] = useState<number>(0);
  const [avgOffsetMs, setAvgOffsetMs] = useState<number>(0);
  const [sessionSummary, setSessionSummary] = useState<PracticeAttempt | null>(null);

  // Stopwatch & Countdown Timer state
  const [timerMode, setTimerMode] = useState<'stopwatch' | 'countdown'>('stopwatch');
  const [countdownTargetSec, setCountdownTargetSec] = useState<number>(120);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [totalSongPracticeSec, setTotalSongPracticeSec] = useState<number>(0);
  const [timerExpired, setTimerExpired] = useState<boolean>(false);
  const pomodoro = usePomodoroTimer();

  // Recording & Sharing state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedDataUrl, setRecordedDataUrl] = useState<string>('');
  const [recordedDurationSec, setRecordedDurationSec] = useState<number>(0);
  const [instrumentLabel, setInstrumentLabel] = useState<string>('Voice / Piano');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cuesRef = useRef<TargetCue[]>([]);
  const currentBeatRef = useRef<number>(-4);
  const isRunningRef = useRef<boolean>(false);
  const lastFrameTimeRef = useRef<number>(0);
  const lastMetronomeBeatRef = useRef<number>(-99);
  const playedGuideIdsRef = useRef<Set<string>>(new Set());
  const accompanimentCuesRef = useRef<TargetCue[]>([]);
  const playedAccompIdsRef = useRef<Set<string>>(new Set());
  const offsetSamplesRef = useRef<number[]>([]);
  const comboRef = useRef<number>(0);
  const maxComboRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const hitsRef = useRef<number>(0);
  const evaluatedRef = useRef<number>(0);
  const flashRef = useRef<JudgmentFlash | null>(null);
  const pitchHoldMsRef = useRef<number>(0);
  const stepIndexRef = useRef<number>(0);
  const sessionStartMsRef = useRef<number>(0);
  const elapsedMsRef = useRef<number>(0);
  const timerLastTickRef = useRef<number>(0);
  const particlesRef = useRef<HitParticle[]>([]);
  const mascotBounceRef = useRef<number>(0);
  const trainerTransientHandlerRef = useRef<((rms: number, ts: number) => void) | null>(null);

  const effectiveBpm = practiceBpm;
  const tempoScale = Math.round((practiceBpm / Math.max(1, exercise.bpm)) * 100);
  const beatsPerSecond = effectiveBpm / 60;

  // Build cues for the selected activity directly from the exercise's parsed notation
  const { baseCues, accompanimentCues } = useMemo<{
    baseCues: TargetCue[];
    accompanimentCues: TargetCue[];
  }>(() => {
    const notes: SongNote[] = exercise.notes.filter((n) => !n.isRest);
    if (activity === 'coordination') {
      const hasLeft = notes.some((n) => n.hand === 'left');
      if (hasLeft) {
        return {
          baseCues: notes.map((n, i) => ({
            id: `coord_${i}`,
            beatStart: n.beatStart,
            durationBeats: n.durationBeats,
            midi: n.midi,
            chordMidis: n.chordMidis,
            noteName: n.noteName,
            freq: n.freq,
            lane: n.hand === 'left' ? 'left' : 'right',
            status: 'pending',
          })),
          accompanimentCues: [],
        };
      }
      // Auto-generate steady left-hand downbeat pulse alongside right-hand melody!
      const totalBeats = notes.reduce(
        (max, n) => Math.max(max, n.beatStart + n.durationBeats),
        8
      );
      const tsNumerator = parseInt(exercise.timeSignature.split('/')[0] || '4', 10) || 4;
      const generated: TargetCue[] = notes.map((n, i) => ({
        id: `coord_r_${i}`,
        beatStart: n.beatStart,
        durationBeats: n.durationBeats,
        midi: n.midi,
        chordMidis: n.chordMidis,
        noteName: n.noteName,
        freq: n.freq,
        lane: 'right',
        status: 'pending',
      }));
      for (let b = 0; b < Math.ceil(totalBeats); b += tsNumerator >= 4 ? 2 : tsNumerator) {
        generated.push({
          id: `coord_l_${b}`,
          beatStart: b,
          durationBeats: 0.75,
          midi: 48,
          noteName: 'C3',
          freq: midiToFreq(48),
          lane: 'left',
          status: 'pending',
        });
      }
      return {
        baseCues: generated.sort((a, b) => a.beatStart - b.beatStart),
        accompanimentCues: [],
      };
    }

    const melodyNotes = notes.filter((n) => n.hand !== 'left');
    const useMelodyOnly = melodyNotes.length > 0;
    const primaryNotes = useMelodyOnly ? melodyNotes : notes;
    const leftNotes = useMelodyOnly ? notes.filter((n) => n.hand === 'left') : [];

    return {
      baseCues: primaryNotes.map((n, i) => ({
        id: `${activity}_${i}`,
        beatStart: n.beatStart,
        durationBeats: n.durationBeats,
        midi: n.midi,
        chordMidis: n.chordMidis,
        noteName: n.noteName,
        freq: n.freq,
        lane: n.hand === 'left' ? 'left' : 'right',
        status: 'pending',
      })),
      accompanimentCues: leftNotes.map((n, i) => ({
        id: `accomp_${i}`,
        beatStart: n.beatStart,
        durationBeats: n.durationBeats,
        midi: n.midi,
        chordMidis: n.chordMidis,
        noteName: n.noteName,
        freq: n.freq,
        lane: 'left',
        status: 'pending',
      })),
    };
  }, [exercise.notes, exercise.timeSignature, activity]);

  const totalSongBeats = useMemo(() => {
    const last = baseCues.reduce((m, c) => Math.max(m, c.beatStart + c.durationBeats), 8);
    return Math.ceil(last + 2);
  }, [baseCues]);

  const resetSession = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    setCountInBeat(null);
    setActiveNoteIndex(-1);
    setStepCursorIndex(0);
    stepIndexRef.current = 0;
    pitchHoldMsRef.current = 0;
    currentBeatRef.current = countInOn ? -4 : -0.5;
    lastMetronomeBeatRef.current = -99;
    playedGuideIdsRef.current.clear();
    playedAccompIdsRef.current.clear();
    cuesRef.current = baseCues.map((c) => ({ ...c, status: 'pending' }));
    accompanimentCuesRef.current = accompanimentCues.map((c) => ({ ...c, status: 'pending' }));
    offsetSamplesRef.current = [];
    comboRef.current = 0;
    maxComboRef.current = 0;
    scoreRef.current = 0;
    hitsRef.current = 0;
    evaluatedRef.current = 0;
    flashRef.current = null;
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setHitsCount(0);
    setTotalEvaluated(0);
    setAvgOffsetMs(0);
    setSessionSummary(null);
    elapsedMsRef.current = 0;
    setElapsedMs(0);
    setTimerExpired(false);
    setExerciseBeatIndex(-1);
  }, [baseCues, accompanimentCues, countInOn]);

  useEffect(() => {
    setTotalSongPracticeSec(0);
    setPracticeBpm(
      Math.max(30, Math.min(240, Math.round((exercise.bpm * (isKids ? 85 : 100)) / 100)))
    );
    setPracticeTimeSignature(exercise.timeSignature);
  }, [exercise.id, exercise.bpm, exercise.timeSignature, isKids]);

  useEffect(() => {
    resetSession();
  }, [resetSession, activity, exercise.id]);

  useEffect(() => {
    audioEngine.updateTapThreshold(tapThreshold);
  }, [tapThreshold]);

  useEffect(() => {
    return () => {
      audioEngine.stopMicrophone();
    };
  }, []);

  const recordJudgment = useCallback(
    (
      cue: TargetCue,
      grade: 'perfect' | 'good' | 'missed',
      offsetMs: number,
      labelOverride?: string
    ) => {
      cue.status = grade;
      evaluatedRef.current += 1;
      setTotalEvaluated(evaluatedRef.current);

      if (grade === 'perfect' || grade === 'good') {
        hitsRef.current += 1;
        setHitsCount(hitsRef.current);
        comboRef.current += 1;
        maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
        setCombo(comboRef.current);
        setMaxCombo(maxComboRef.current);

        const basePts = grade === 'perfect' ? 100 : 65;
        const mult = 1 + Math.min(2, Math.floor(comboRef.current / 5) * 0.25);
        scoreRef.current += Math.round(basePts * mult);
        setScore(scoreRef.current);

        offsetSamplesRef.current.push(offsetMs);
        const avg = Math.round(
          offsetSamplesRef.current.reduce((a, b) => a + b, 0) / offsetSamplesRef.current.length
        );
        setAvgOffsetMs(avg);

        const timingLabel =
          Math.abs(offsetMs) <= 45
            ? 'Right on the beat!'
            : offsetMs < 0
            ? `${Math.abs(Math.round(offsetMs))}ms early`
            : `${Math.round(offsetMs)}ms late`;

        const kidsCheer = grade === 'perfect' ? 'Awesome!' : 'Great!';
        const studioCheer = grade === 'perfect' ? 'Perfect!' : 'Good';

        flashRef.current = {
          text: labelOverride || (isKids ? kidsCheer : studioCheer),
          color: grade === 'perfect' ? '#10b981' : '#38bdf8',
          subtext: timingLabel,
          createdAt: performance.now(),
        };

        // Spawn celebration burst particles at the strike zone
        const noteColor = isKids ? getNoteColorInfo(cue.midi).hex : '#3898EC';
        const burstColors = [noteColor, '#FFD000', '#EC4899', '#3898EC', '#34d399'];
        for (let p = 0; p < (grade === 'perfect' ? 12 : 6); p++) {
          const angle = (Math.PI * 2 * p) / (grade === 'perfect' ? 12 : 6);
          const speed = 1.6 + Math.random() * 2.4;
          particlesRef.current.push({
            x: 154,
            y: 105,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.8,
            radius: 3 + Math.random() * 3,
            color: burstColors[p % burstColors.length],
            life: 1,
          });
        }
        mascotBounceRef.current = 1;
      } else {
        comboRef.current = 0;
        setCombo(0);
        flashRef.current = {
          text: labelOverride || (isKids ? 'Nice try!' : 'Missed'),
          color: isKids ? '#f59e0b' : '#dc2626',
          subtext: isKids ? 'Listen & keep clapping!' : 'Keep listening to the pulse',
          createdAt: performance.now(),
        };
      }
    },
    [isKids]
  );

  // Trigger a tap/knock hit on a specific lane ('right' | 'left' | 'any')
  const handleRhythmStrike = useCallback(
    (laneFilter: 'right' | 'left' | 'any', playSound = true) => {
      if (!isRunningRef.current) return;
      const nowBeat = currentBeatRef.current;
      if (nowBeat < -0.35) return;

      const msPerBeat = 1000 / beatsPerSecond;
      const maxWindowMs = isKids ? 290 : 210;
      const perfectWindowMs = isKids ? 110 : 75;
      let bestCue: TargetCue | null = null;
      let bestAbsMs = Infinity;
      let signedOffsetMs = 0;

      for (const cue of cuesRef.current) {
        if (cue.status !== 'pending') continue;
        if (laneFilter !== 'any' && cue.lane !== laneFilter) continue;
        const deltaMs = (nowBeat - cue.beatStart) * msPerBeat;
        const absMs = Math.abs(deltaMs);
        if (absMs < bestAbsMs && absMs <= maxWindowMs) {
          bestAbsMs = absMs;
          bestCue = cue;
          signedOffsetMs = deltaMs;
        }
      }

      if (bestCue) {
        if (playSound) {
          audioEngine.playNote(bestCue.freq, 0.24, 0.72);
        }
        const grade = bestAbsMs <= perfectWindowMs ? 'perfect' : 'good';
        recordJudgment(bestCue, grade, signedOffsetMs);
      } else if (playSound) {
        audioEngine.playMetronomeClick(laneFilter === 'right');
      }
    },
    [beatsPerSecond, isKids, recordJudgment]
  );

  const finishRun = useCallback(async () => {
    if (!isRunningRef.current) return;
    isRunningRef.current = false;
    setIsRunning(false);
    setCountInBeat(null);
    setExerciseBeatIndex(-1);

    let finalEvaluated = evaluatedRef.current;
    for (const c of cuesRef.current) {
      if (c.status === 'pending') {
        c.status = 'missed';
        finalEvaluated += 1;
      }
    }
    const accuracy =
      finalEvaluated > 0 ? Math.round((hitsRef.current / finalEvaluated) * 100) : 100;
    const stars = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 40 ? 1 : 0;
    const rawElapsedSec =
      elapsedMsRef.current > 0
        ? elapsedMsRef.current / 1000
        : (performance.now() - sessionStartMsRef.current) / 1000;
    const durationSec = Math.max(1, Math.round(rawElapsedSec));
    setTotalSongPracticeSec((prev) => prev + durationSec);
    const xpEarned = Math.round(40 + accuracy * 1.4 + stars * 35);

    if (stars >= 2) {
      void import('canvas-confetti').then((mod) =>
        mod.default({ particleCount: stars === 3 ? 85 : 40, spread: 65, origin: { y: 0.65 } })
      );
    }

    if (isRecording) {
      try {
        const res = await audioEngine.stopRecording();
        const url = URL.createObjectURL(res.blob);
        setRecordedAudioUrl(url);
        setRecordedDataUrl(res.dataUrl);
        setRecordedDurationSec(res.durationSec);
      } catch {
        // Non-fatal if recording stopped already
      }
      setIsRecording(false);
    }

    const attempt: PracticeAttempt = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: 'local',
      exerciseId: exercise.id,
      exerciseTitle: exercise.title,
      activityType: activity,
      score: scoreRef.current,
      accuracy,
      maxCombo: maxComboRef.current,
      stars,
      avgOffsetMs: offsetSamplesRef.current.length
        ? Math.round(
            offsetSamplesRef.current.reduce((a, b) => a + b, 0) /
              offsetSamplesRef.current.length
          )
        : 0,
      durationSec,
      xpEarned,
      createdAtMs: Date.now(),
    };

    setSessionSummary(attempt);
    onCompleteAttempt(attempt);
  }, [activity, exercise.id, exercise.title, isRecording, onCompleteAttempt]);

  // Evaluate a played musical pitch (from Pitchy mic or interactive piano key)
  const handlePitchInput = useCallback(
    (midi: number, cents: number, source: 'mic' | 'piano') => {
      if (!isRunningRef.current) return;

      // Guided Step-by-Step Sight-Reading Mode (honors global pitch calibration)
      const cal = audioEngine.getPitchCalibration();
      const centsTolerance = Math.max(isKids ? 45 : 25, cal.centsTolerance);
      if (activity === 'pitch' && guidedStepPitch) {
        const target = cuesRef.current[stepIndexRef.current];
        if (!target) return;
        const samePitchClass =
          source === 'piano' ? midi === target.midi : midi % 12 === target.midi % 12;
        if (samePitchClass && Math.abs(cents) <= centsTolerance) {
          const label = isKids
            ? `${getNoteColorInfo(target.midi).solfege} (${target.noteName})!`
            : `${target.noteName} In Tune!`;
          recordJudgment(target, 'perfect', 0, label);
          const nextIdx = stepIndexRef.current + 1;
          stepIndexRef.current = nextIdx;
          setStepCursorIndex(nextIdx);
          setActiveNoteIndex(nextIdx);
          if (nextIdx >= cuesRef.current.length) {
            void finishRun();
          }
        }
        return;
      }

      // Tempo Play-Along Pitch Mode
      const nowBeat = currentBeatRef.current;
      const msPerBeat = 1000 / beatsPerSecond;
      for (const cue of cuesRef.current) {
        if (cue.status !== 'pending') continue;
        const inWindow =
          nowBeat >= cue.beatStart - (isKids ? 0.45 : 0.35) &&
          nowBeat <= cue.beatStart + Math.max(0.65, cue.durationBeats);
        if (!inWindow) continue;
        const pitchMatches =
          source === 'piano' ? midi === cue.midi : midi % 12 === cue.midi % 12;
        if (pitchMatches && Math.abs(cents) <= centsTolerance) {
          const offsetMs = (nowBeat - cue.beatStart) * msPerBeat;
          const grade = Math.abs(cents) <= (isKids ? 28 : 20) ? 'perfect' : 'good';
          const pitchText = isKids
            ? `${getNoteColorInfo(cue.midi).solfege}!`
            : `${cue.noteName} (${cents >= 0 ? '+' : ''}${cents}¢)`;
          recordJudgment(cue, grade, offsetMs, pitchText);
          break;
        }
      }
    },
    [activity, beatsPerSecond, finishRun, guidedStepPitch, isKids, recordJudgment]
  );

  const toggleMic = async () => {
    setMicError(null);
    if (micEnabled) {
      audioEngine.stopMicrophone();
      setMicEnabled(false);
      setPitchReading(null);
      setLiveRms(0);
      return;
    }

    try {
      await audioEngine.startMicrophone({
        tapThreshold,
        onTransient: (rms, ts) => {
          setLastMicKnockAt(Date.now());
          trainerTransientHandlerRef.current?.(rms, ts);
          if (!isRunningRef.current) return;
          if (activity === 'rhythm' || activity === 'performance') {
            handleRhythmStrike('any', false);
          } else if (activity === 'coordination') {
            handleRhythmStrike('left', false);
          }
        },
        onPitch: (reading, rawRms) => {
          setLiveRms(rawRms);
          setPitchReading(reading);
          if (reading && isRunningRef.current) {
            if (activity === 'pitch' || activity === 'performance') {
              handlePitchInput(reading.midi, reading.cents, 'mic');
            } else if (activity === 'coordination') {
              // Playing a pitch on an instrument counts as right-hand melody coordination hit!
              handleRhythmStrike('right', false);
            }
          }
        },
      });
      setMicEnabled(true);
    } catch {
      setMicError(
        'Microphone access was blocked or unavailable. You can still practice using Keyboard & On-Screen Pads.'
      );
    }
  };

  const connectPracticeMidi = async () => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<{
        inputs: Map<
          string,
          { name?: string; onmidimessage: ((evt: { data: Uint8Array }) => void) | null }
        >;
      }>;
    };
    if (!nav.requestMIDIAccess) {
      setMicError('Web MIDI requires Chrome or Edge desktop browser.');
      return;
    }
    try {
      const access = await nav.requestMIDIAccess();
      let firstName: string | null = null;
      access.inputs.forEach((input) => {
        if (!firstName && input.name) firstName = input.name;
        input.onmidimessage = (evt) => {
          if (!evt.data || evt.data.length < 3) return;
          const status = evt.data[0];
          const note = evt.data[1];
          const vel = evt.data[2];
          if ((status & 0xf0) === 0x90 && vel > 0) {
            void audioEngine.ensureToneReady().then(() => {
              audioEngine.playNote(midiToFreq(note), 0.35, 0.8);
            });
            if (activity === 'rhythm') {
              handleRhythmStrike('any', false);
            } else if (activity === 'coordination') {
              handleRhythmStrike(note < 60 ? 'left' : 'right', false);
            } else {
              handlePitchInput(note, 0, 'piano');
            }
          }
        };
      });
      setMidiDeviceName(firstName || 'MIDI Keyboard');
    } catch {
      setMicError('Could not connect Web MIDI keyboard.');
    }
  };

  const startRun = async () => {
    await audioEngine.ensureToneReady();
    resetSession();

    if (activity === 'performance' && micEnabled) {
      try {
        setRecordedAudioUrl(null);
        setRecordedDataUrl('');
        setShareUrl(null);
        await audioEngine.startRecording();
        setIsRecording(true);
      } catch {
        setIsRecording(false);
      }
    }

    currentBeatRef.current = countInOn && !guidedStepPitch ? -4 : 0;
    lastMetronomeBeatRef.current = -99;
    lastFrameTimeRef.current = performance.now();
    sessionStartMsRef.current = performance.now();
    timerLastTickRef.current = performance.now();
    isRunningRef.current = true;
    setIsRunning(true);
  };

  // Stopwatch & Countdown 100ms precision tracker
  useEffect(() => {
    if (!isRunning) return;
    timerLastTickRef.current = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.max(0, now - timerLastTickRef.current);
      timerLastTickRef.current = now;
      elapsedMsRef.current += delta;
      setElapsedMs(elapsedMsRef.current);

      if (
        timerMode === 'countdown' &&
        elapsedMsRef.current >= countdownTargetSec * 1000
      ) {
        setTimerExpired(true);
        audioEngine.playFeedbackChime('perfect');
        void finishRun();
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, [isRunning, timerMode, countdownTargetSec, finishRun]);

  const stopRun = async () => {
    isRunningRef.current = false;
    setIsRunning(false);
    setCountInBeat(null);
    setExerciseBeatIndex(-1);
    if (isRecording) {
      try {
        const res = await audioEngine.stopRecording();
        setRecordedAudioUrl(URL.createObjectURL(res.blob));
        setRecordedDataUrl(res.dataUrl);
        setRecordedDurationSec(res.durationSec);
      } catch {
        // Ignore
      }
      setIsRecording(false);
    }
  };

  // Keyboard shortcuts for snappy tactile play (Space = Tap, F = Left Hand, J = Right Hand, Piano keys Z..M)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (stageTab === 'rhythm_trainer') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (activity === 'rhythm' || activity === 'performance') {
          handleRhythmStrike('any', true);
        }
      } else if (e.key.toLowerCase() === 'f' && activity === 'coordination') {
        e.preventDefault();
        handleRhythmStrike('left', true);
      } else if (e.key.toLowerCase() === 'j' && activity === 'coordination') {
        e.preventDefault();
        handleRhythmStrike('right', true);
      } else if (activity === 'pitch' || activity === 'performance') {
        const keyMatch = PIANO_KEYS.find(
          (k) => k.keyHint.toLowerCase() === e.key.toLowerCase()
        );
        if (keyMatch) {
          void audioEngine.ensureToneReady().then(() => {
            audioEngine.playNote(midiToFreq(keyMatch.midi), 0.35);
          });
          handlePitchInput(keyMatch.midi, 0, 'piano');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activity, stageTab, handlePitchInput, handleRhythmStrike]);

  // 60fps Game Loop + Canvas Renderer
  useEffect(() => {
    let rafId = 0;

    const drawCanvas = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(drawCanvas);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      ctx.save();
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = rect.height;

      // Advance musical transport clock if running and not waiting in Guided Step mode
      if (isRunningRef.current) {
        const dtSec = Math.min(0.08, (now - lastFrameTimeRef.current) / 1000);
        lastFrameTimeRef.current = now;

        if (!(activity === 'pitch' && guidedStepPitch)) {
          currentBeatRef.current += dtSec * beatsPerSecond;
          const beatNow = currentBeatRef.current;

          // Count-in indicator
          if (beatNow < 0) {
            const cBeat = Math.ceil(4 + beatNow);
            setCountInBeat(Math.max(1, Math.min(4, cBeat)));
          } else {
            setCountInBeat(null);
          }

          // Metronome click on integer beat crossings
          const wholeBeat = Math.floor(beatNow);
          if (wholeBeat > lastMetronomeBeatRef.current) {
            lastMetronomeBeatRef.current = wholeBeat;
            const tsNum = parseBeatsPerBar(practiceTimeSignature);
            const beatInBar = ((wholeBeat % tsNum) + tsNum) % tsNum;
            setExerciseBeatIndex(beatInBar);
            if (metronomeOn || beatNow < 0) {
              const isDownbeat = beatInBar === 0;
              audioEngine.playMetronomeClick(isDownbeat);
            }
          }

          // Backing synth guide notes + active sheet music cursor
          let latestNoteIdx = -1;
          for (let i = 0; i < cuesRef.current.length; i++) {
            const cue = cuesRef.current[i];
            if (beatNow >= cue.beatStart - 0.04) {
              latestNoteIdx = i;
            }
            if (
              guideAudioOn &&
              beatNow >= cue.beatStart &&
              beatNow < cue.beatStart + 0.2 &&
              !playedGuideIdsRef.current.has(cue.id)
            ) {
              playedGuideIdsRef.current.add(cue.id);
              const vol = activity === 'pitch' ? 0.35 : 0.6;
              const dur = Math.max(0.18, cue.durationBeats / beatsPerSecond);
              if (cue.chordMidis && cue.chordMidis.length > 1) {
                const eachVol = Math.max(0.16, vol / cue.chordMidis.length);
                for (const m of cue.chordMidis) {
                  audioEngine.playNote(midiToFreq(m), dur, eachVol);
                }
              } else {
                audioEngine.playNote(cue.freq, dur, vol);
              }
            }
            // Mark missed cues past tolerance
            if (
              cue.status === 'pending' &&
              beatNow > cue.beatStart + (0.21 * beatsPerSecond)
            ) {
              recordJudgment(cue, 'missed', 0);
            }
          }

          // Background left-hand accompaniment chord playback when active
          if (guideAudioOn && accompanimentCuesRef.current.length > 0) {
            for (const accomp of accompanimentCuesRef.current) {
              if (
                beatNow >= accomp.beatStart &&
                beatNow < accomp.beatStart + 0.25 &&
                !playedAccompIdsRef.current.has(accomp.id)
              ) {
                playedAccompIdsRef.current.add(accomp.id);
                const dur = Math.max(0.25, accomp.durationBeats / beatsPerSecond);
                const chordNotes =
                  accomp.chordMidis && accomp.chordMidis.length > 0 ? accomp.chordMidis : [accomp.midi];
                const perVoiceVol = Math.max(0.12, 0.32 / chordNotes.length);
                for (const m of chordNotes) {
                  audioEngine.playNote(midiToFreq(m), dur, perVoiceVol);
                }
              }
            }
          }
          setActiveNoteIndex(latestNoteIdx);

          if (beatNow >= totalSongBeats) {
            void finishRun();
          }
        }
      }

      // Clear & Paint Stage Background (Deep Cobalt Night Sky in Kids Mode, Studio Slate in Studio Mode)
      ctx.fillStyle = isKids ? '#182468' : '#0f172a';
      ctx.fillRect(0, 0, width, height);

      if (isKids) {
        // Subtle colorful starlight sparkles on canvas
        ctx.fillStyle = 'rgba(255, 208, 0, 0.25)';
        for (let sx = 120; sx < width; sx += 140) {
          ctx.beginPath();
          ctx.arc(sx, 26, 2.2, 0, Math.PI * 2);
          ctx.arc(sx + 65, height - 24, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const hitX = 154;
      const pxPerBeat = 105;
      const beatNow =
        activity === 'pitch' && guidedStepPitch
          ? cuesRef.current[stepIndexRef.current]?.beatStart ?? 0
          : currentBeatRef.current;

      // Measure grid lines
      const startBeat = Math.floor(beatNow - 1);
      const endBeat = Math.ceil(beatNow + (width - hitX) / pxPerBeat + 1);
      const tsNum = parseBeatsPerBar(practiceTimeSignature);

      for (let b = startBeat; b <= endBeat; b++) {
        if (b < 0) continue;
        const x = hitX + (b - beatNow) * pxPerBeat;
        const isMeasure = b % tsNum === 0;
        ctx.strokeStyle = isMeasure ? 'rgba(255, 208, 0, 0.36)' : 'rgba(148, 163, 184, 0.14)';
        ctx.lineWidth = isMeasure ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 18);
        ctx.lineTo(x, height - 18);
        ctx.stroke();

        if (isMeasure) {
          ctx.fillStyle = 'rgba(255, 208, 0, 0.72)';
          ctx.font = '600 11px "IBM Plex Mono", monospace';
          ctx.fillText(`M.${Math.floor(b / tsNum) + 1}`, x + 5, 28);
        }
      }

      // Lane guide tracks
      if (activity === 'coordination') {
        const yRight = height * 0.34;
        const yLeft = height * 0.7;
        ctx.strokeStyle = 'rgba(56, 152, 236, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, yRight);
        ctx.lineTo(width, yRight);
        ctx.moveTo(0, yLeft);
        ctx.lineTo(width, yLeft);
        ctx.stroke();

        ctx.fillStyle = '#FFD000';
        ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('RIGHT HAND (J / Instrument)', 92, yRight - 22);
        ctx.fillStyle = '#f9a8d4';
        ctx.fillText('LEFT HAND (F / Desk Knock)', 92, yLeft - 22);
      } else {
        const centerY = height * 0.52;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(86, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
      }

      // Bouncing Musical Companion Mascot ("Beat Buddy" Explorer) on the left
      mascotBounceRef.current = Math.max(0, mascotBounceRef.current - 0.06);
      const beatBob = isRunningRef.current
        ? Math.abs(Math.sin(Math.max(0, beatNow) * Math.PI)) * 7
        : Math.sin(now / 450) * 3;
      const buddyX = 48;
      const buddyY = height * 0.54 - beatBob - mascotBounceRef.current * 12;

      // Golden orbit swirl in Kids Explorer mode
      if (isKids) {
        ctx.strokeStyle = 'rgba(255, 208, 0, 0.55)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(buddyX, buddyY + 18, 30, 8, -0.15, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Shadow
      ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
      ctx.beginPath();
      ctx.ellipse(buddyX, height * 0.54 + 28, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Curly hair puffs for Kids Explorer look
      if (isKids) {
        ctx.fillStyle = '#3b2314';
        const puffOffsets = [
          [-16, -15],
          [-6, -22],
          [7, -22],
          [17, -14],
          [-20, -4],
          [20, -4],
        ];
        for (const [ox, oy] of puffOffsets) {
          ctx.beginPath();
          ctx.arc(buddyX + ox, buddyY + oy, 9.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Buddy round head/face
      ctx.fillStyle = comboRef.current >= 10 ? '#FFD000' : isKids ? '#fde6d2' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(buddyX, buddyY, 21, 0, Math.PI * 2);
      ctx.fill();

      // Music note antenna
      ctx.strokeStyle = '#FFD000';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(buddyX, buddyY - 24);
      ctx.lineTo(buddyX + 3, buddyY - 36);
      ctx.lineTo(buddyX + 10, buddyY - 33);
      ctx.stroke();

      // Eyes + Signature Round Explorer Glasses
      ctx.fillStyle = '#080808';
      ctx.beginPath();
      ctx.arc(buddyX - 7, buddyY - 2, 2.8, 0, Math.PI * 2);
      ctx.arc(buddyX + 7, buddyY - 2, 2.8, 0, Math.PI * 2);
      ctx.fill();

      if (isKids) {
        ctx.strokeStyle = comboRef.current >= 10 ? '#EC4899' : '#e11d48';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(buddyX - 7, buddyY - 2, 7.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(buddyX + 7, buddyY - 2, 7.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(buddyX - 0.5, buddyY - 2);
        ctx.lineTo(buddyX + 0.5, buddyY - 2);
        ctx.stroke();
      } else if (comboRef.current >= 10) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(buddyX - 13, buddyY - 6, 11, 6);
        ctx.fillRect(buddyX + 2, buddyY - 6, 11, 6);
      }

      // Smile
      ctx.strokeStyle = '#080808';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(buddyX, buddyY + 4, 6.5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      // Strike / Playhead Line
      ctx.strokeStyle = '#FFD000';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(hitX, 14);
      ctx.lineTo(hitX, height - 14);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 208, 0, 0.2)';
      ctx.beginPath();
      ctx.arc(hitX, height * 0.52, 20, 0, Math.PI * 2);
      ctx.fill();

      // Draw Note Cues (Rainbow Solfege Colors in Kids Explorer Mode!)
      for (const cue of cuesRef.current) {
        const x = hitX + (cue.beatStart - beatNow) * pxPerBeat;
        const w = Math.max(32, cue.durationBeats * pxPerBeat - 6);
        if (x + w < 64 || x > width + 40) continue;

        let y = height * 0.52;
        if (activity === 'coordination') {
          y = cue.lane === 'right' ? height * 0.34 : height * 0.7;
        } else if (activity === 'pitch' || activity === 'performance') {
          const norm = Math.max(0, Math.min(1, (cue.midi - 52) / 28));
          y = height - 38 - norm * (height - 76);
        }

        const chroma = getNoteColorInfo(cue.midi);
        let fill = isKids ? chroma.hex : '#3b82f6';
        if (cue.lane === 'left' && activity === 'coordination') fill = '#10b981';
        if (cue.status === 'perfect') fill = '#059669';
        else if (cue.status === 'good') fill = '#2563eb';
        else if (cue.status === 'missed') fill = isKids ? '#64748b' : '#dc2626';

        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(x, y - 15, w, 30, 9);
        ctx.fill();

        ctx.fillStyle = fill === '#ca8a04' ? '#0f172a' : '#ffffff';
        ctx.font = '600 12px "IBM Plex Mono", monospace';
        const cueLabel =
          activity === 'rhythm'
            ? isKids
              ? 'CLAP'
              : 'TAP'
            : isKids
            ? `${chroma.solfege} (${chroma.letter})`
            : cue.noteName;
        ctx.fillText(cueLabel, x + 8, y + 4);
      }

      // Animate Hit Celebration Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.08;
        pt.life -= 0.032;
        if (pt.life <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = pt.life;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Live Pitch Cursor Marker in Pitch/Performance Modes
      if ((activity === 'pitch' || activity === 'performance') && pitchReading) {
        const norm = Math.max(0, Math.min(1, (pitchReading.midi - 52) / 28));
        const py = height - 38 - norm * (height - 76);
        ctx.fillStyle = Math.abs(pitchReading.cents) <= 24 ? '#10b981' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(hitX, py, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Judgment Flash Callout
      if (flashRef.current && now - flashRef.current.createdAt < 900) {
        const alpha = Math.max(0, 1 - (now - flashRef.current.createdAt) / 900);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = flashRef.current.color;
        ctx.font = '700 19px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(flashRef.current.text, hitX + 26, 40);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '500 12px "IBM Plex Mono", monospace';
        ctx.fillText(flashRef.current.subtext, hitX + 26, 58);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
      rafId = requestAnimationFrame(drawCanvas);
    };

    rafId = requestAnimationFrame(drawCanvas);
    return () => cancelAnimationFrame(rafId);
  }, [
    activity,
    beatsPerSecond,
    practiceTimeSignature,
    finishRun,
    guideAudioOn,
    guidedStepPitch,
    isKids,
    metronomeOn,
    pitchReading,
    recordJudgment,
    totalSongBeats,
  ]);

  const handlePublishPerformance = async () => {
    if (!sessionSummary && !recordedDataUrl) return;
    setIsSharing(true);
    try {
      const id = await onSharePerformance({
        exercise,
        activityType: activity,
        instrument: instrumentLabel || 'Voice / Instrument',
        score: sessionSummary?.score ?? score,
        accuracy: sessionSummary?.accuracy ?? (totalEvaluated ? Math.round((hitsCount / totalEvaluated) * 100) : 100),
        stars: sessionSummary?.stars ?? 3,
        durationSec: recordedDurationSec || sessionSummary?.durationSec || 15,
        audioDataUrl: recordedDataUrl,
      });
      if (id) {
        const url = `${window.location.origin}?share=${id}`;
        setShareUrl(url);
        void import('canvas-confetti').then((mod) =>
          mod.default({ particleCount: 70, spread: 70, origin: { y: 0.6 } })
        );
      }
    } finally {
      setIsSharing(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const currentAccuracy =
    totalEvaluated > 0 ? Math.round((hitsCount / totalEvaluated) * 100) : 100;
  const targetStepNote = cuesRef.current[stepCursorIndex];

  const formatDuration = (totalSeconds: number): string => {
    const clamped = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(clamped / 60);
    const secs = clamped % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const elapsedSec = Math.floor(elapsedMs / 1000);
  const remainingSec = Math.max(0, countdownTargetSec - elapsedSec);
  const displayedTimerText =
    timerMode === 'countdown'
      ? formatDuration(remainingSec)
      : formatDuration(elapsedSec);

  return (
    <section className="mx-auto max-w-[1360px] px-6 py-6 space-y-6">
      {/* Breadcrumb & Exercise Title Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-[#080808] bg-[#FFD000] p-5 shadow-[4px_4px_0_#080808]">
        <div>
          <button
            type="button"
            onClick={onBackToLibrary}
            className="mb-1 text-xs font-bold text-[#080808] underline decoration-2 hover:text-[#2D40EA] cursor-pointer"
          >
            Back to Song &amp; Exercise Library
          </button>
          <h1 className="font-display text-2xl font-bold text-[#080808]">
            {exercise.title}
          </h1>
          <p className="text-xs font-semibold text-[#080808]/80">
            {exercise.composer} · {exercise.difficulty} · {exercise.timeSignature} · Key of {exercise.keySignature}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void connectPracticeMidi()}
            className={`min-h-[42px] flex items-center gap-1.5 rounded-xl border-2 border-[#080808] px-3.5 py-2 text-xs font-bold cursor-pointer shadow-[2px_2px_0_#080808] ${
              midiDeviceName ? 'bg-emerald-500 text-white' : 'bg-white text-[#080808] hover:bg-[#FFFDF4]'
            }`}
          >
            <Usb className="h-4 w-4" />
            {midiDeviceName ? `MIDI: ${midiDeviceName}` : 'USB / LED MIDI'}
          </button>

          <button
            type="button"
            onClick={toggleMic}
            className={`min-h-[42px] flex items-center gap-2 rounded-xl border-2 border-[#080808] px-4 py-2 text-xs font-bold cursor-pointer transition-colors shadow-[2px_2px_0_#080808] ${
              micEnabled
                ? 'bg-[#3898EC] text-white'
                : 'bg-white text-[#080808] hover:bg-[#FFFDF4]'
            }`}
          >
            {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            {micEnabled ? 'Microphone Listening' : 'Enable Mic (Tap & Pitch)'}
          </button>

          {onOpenCalibration && (
            <button
              type="button"
              onClick={onOpenCalibration}
              className="min-h-[42px] flex items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-3.5 py-2 text-xs font-bold text-[#080808] cursor-pointer shadow-[2px_2px_0_#080808] hover:bg-[#FFF9D6]"
            >
              <Sliders className="h-4 w-4 text-[#EC4899]" />
              Calibrate Mic
            </button>
          )}

          {stageTab !== 'rhythm_trainer' &&
            (!isRunning ? (
              <button
                type="button"
                onClick={startRun}
                className="min-h-[42px] flex items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#EC4899] px-5 py-2 text-xs font-bold text-white cursor-pointer transition-transform hover:-translate-y-0.5 shadow-[2px_2px_0_#080808]"
              >
                <Play className="h-4 w-4" />
                {activity === 'performance' && micEnabled
                  ? 'Record Performance'
                  : 'Start Exercise'}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRun}
                className="min-h-[42px] flex items-center gap-2 rounded-xl border-2 border-[#080808] bg-[#FF6565] px-5 py-2 text-xs font-bold text-white cursor-pointer shadow-[2px_2px_0_#080808]"
              >
                <Pause className="h-4 w-4" />
                Stop
              </button>
            ))}
        </div>
      </div>

      {micError && (
        <div className="rounded-xl border-2 border-[#080808] bg-[#FFF9D6] px-4 py-3 text-xs font-semibold text-[#080808]">
          {micError}
        </div>
      )}

      {pomodoro.expiredNotice && (
        <PomodoroNoticeBanner
          notice={pomodoro.expiredNotice}
          breakDurationMin={pomodoro.breakDurationMin}
          focusDurationMin={pomodoro.focusDurationMin}
          onStartBreak={() => pomodoro.selectPhase('break', true)}
          onStartFocus={() => pomodoro.selectPhase('focus', true)}
          onDismiss={pomodoro.dismissNotice}
        />
      )}

      {/* Segmented Activity Switcher (4 Song Activities + Dedicated Rhythm Trainer) */}
      <div className="grid grid-cols-1 gap-2 rounded-2xl border-2 border-[#080808] bg-white p-2 shadow-[3px_3px_0_#080808] sm:grid-cols-2 lg:grid-cols-5">
        {ACTIVITY_TABS.map((tab) => {
          const active = stageTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                void stopRun();
                setStageTab(tab.id);
              }}
              className={`min-h-[46px] rounded-xl px-3.5 py-2 text-left cursor-pointer transition-colors ${
                active
                  ? 'border-2 border-[#080808] bg-[#FFD000] text-[#080808]'
                  : 'border-2 border-transparent text-slate-700 hover:bg-[#FFF9D6]'
              }`}
            >
              <div className="text-xs font-bold whitespace-nowrap truncate">{tab.label}</div>
              <div className="text-[11px] font-medium text-[#080808]/75 whitespace-nowrap truncate">
                {tab.subtitle}
              </div>
            </button>
          );
        })}
      </div>

      {/* Two-Zone Sandbox Layout: Left/Top Interactive Stage + Right Control Deck */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Interactive Stage (8 cols) */}
        <div className="space-y-4 lg:col-span-8">
          {stageTab === 'rhythm_trainer' ? (
            <Suspense
              fallback={
                <div className="rounded-2xl border-2 border-[#080808] bg-white p-8 text-center text-sm font-bold text-[#080808]">
                  Loading Rhythm Trainer...
                </div>
              }
            >
              <RhythmTrainerModule
                bpm={effectiveBpm}
                timeSignature={practiceTimeSignature}
                metronomeClickOn={metronomeOn}
                micEnabled={micEnabled}
                liveRms={liveRms}
                tapThreshold={tapThreshold}
                onToggleMic={toggleMic}
                onChangeTapThreshold={setTapThreshold}
                registerTransientHandler={(fn) => {
                  trainerTransientHandlerRef.current = fn;
                }}
                onCompleteDrillAttempt={onCompleteAttempt}
              />
            </Suspense>
          ) : (
            <>
              <Suspense
                fallback={
                  <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs font-semibold text-slate-600">
                    Rendering sheet notation...
                  </div>
                }
              >
                <SheetMusicViewer
                  exercise={exercise}
                  activeNoteIndex={activeNoteIndex}
                  interactive
                  compactFocus={activity === 'pitch' || activity === 'performance'}
                />
              </Suspense>

          {/* Live 60fps Highway Canvas */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
            <canvas ref={canvasRef} className="block h-[210px] w-full" />

            {countInBeat !== null && isRunning && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45">
                <div className="text-center">
                  <div className="font-mono text-5xl font-bold text-white tabular-nums">
                    {countInBeat}
                  </div>
                  <div className="mt-1 text-xs font-medium text-blue-200">Count-In</div>
                </div>
              </div>
            )}

            {isRecording && (
              <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md bg-red-600/95 px-2.5 py-1 text-[11px] font-semibold text-white">
                <Radio className="h-3.5 w-3.5 animate-pulse" />
                Recording Audio
              </div>
            )}
          </div>

          {/* Live Mic Telemetry & Chromatic Tuner Strip */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  Mic Input & Knock Level
                </span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {Date.now() - lastMicKnockAt < 450
                    ? 'Tap Detected'
                    : micEnabled
                    ? `RMS ${(liveRms * 100).toFixed(1)}`
                    : 'Mic Off'}
                </span>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all duration-75 ${
                    liveRms > tapThreshold ? 'bg-emerald-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.min(100, liveRms * 360)}%` }}
                />
                <div
                  className="absolute inset-y-0 w-0.5 bg-slate-900"
                  style={{ left: `${Math.min(98, tapThreshold * 360)}%` }}
                  title="Tap sensitivity threshold"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  Real-Time Pitch Tuner (Pitchy)
                </span>
                <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                  {pitchReading
                    ? `${pitchReading.noteName} · ${pitchReading.freq.toFixed(1)} Hz (${
                        pitchReading.cents >= 0 ? '+' : ''
                      }${pitchReading.cents}¢)`
                    : guidedStepPitch && targetStepNote
                    ? `Target: ${targetStepNote.noteName}`
                    : 'Play or sing a note'}
                </span>
              </div>
              <div className="relative h-3 w-full rounded-full bg-slate-100">
                <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-slate-400" />
                {pitchReading && (
                  <div
                    className={`absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full ${
                      Math.abs(pitchReading.cents) <= 18
                        ? 'bg-emerald-600'
                        : 'bg-amber-500'
                    }`}
                    style={{
                      left: `${Math.max(5, Math.min(95, 50 + pitchReading.cents))}%`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Tactile Interactive Pads / Piano Keyboard per Activity */}
          {activity === 'rhythm' && (
            <button
              type="button"
              onMouseDown={() => handleRhythmStrike('any', true)}
              className={`flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-[#080808] font-bold cursor-pointer transition-transform active:scale-[0.99] shadow-[3px_3px_0_#080808] ${
                isKids
                  ? 'min-h-[96px] bg-[#FFD000] text-base text-[#080808] hover:bg-[#FEC700]'
                  : 'min-h-[78px] bg-white text-sm text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              <Hand className="h-6 w-6 text-[#EC4899]" />
              {isKids
                ? 'Big Clap Pad! Tap Here, Press Spacebar, or Knock on Your Table'
                : 'Tap Here, Press Spacebar, or Knock on Your Desk'}
            </button>
          )}

          {activity === 'coordination' && (
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onMouseDown={() => handleRhythmStrike('left', true)}
                className="flex min-h-[88px] flex-col items-center justify-center rounded-2xl border-2 border-[#080808] bg-[#EC4899] p-3 text-white shadow-[3px_3px_0_#080808] cursor-pointer transition-transform active:scale-[0.98]"
              >
                <span className="text-sm font-bold">Left Hand / Bass Pulse</span>
                <span className="text-xs font-medium text-white/90">Press F key or Desk Knock</span>
              </button>
              <button
                type="button"
                onMouseDown={() => handleRhythmStrike('right', true)}
                className="flex min-h-[88px] flex-col items-center justify-center rounded-2xl border-2 border-[#080808] bg-[#3898EC] p-3 text-white shadow-[3px_3px_0_#080808] cursor-pointer transition-transform active:scale-[0.98]"
              >
                <span className="text-sm font-bold">Right Hand / Melody Cue</span>
                <span className="text-xs font-medium text-white/90">Press J key or Play Instrument</span>
              </button>
            </div>
          )}

          {(activity === 'pitch' || activity === 'performance') && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold text-slate-800">
                  {isKids
                    ? 'Rainbow Xylophone & Piano Keys (Tap a glowing color or sing!)'
                    : 'Interactive Practice Keyboard (or play your acoustic instrument into Mic)'}
                </span>
                <span>Keys Z–M</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PIANO_KEYS.map((k) => {
                  const chroma = getNoteColorInfo(k.midi);
                  const isTarget =
                    (guidedStepPitch && targetStepNote?.midi === k.midi) ||
                    (!guidedStepPitch &&
                      activeNoteIndex >= 0 &&
                      cuesRef.current[activeNoteIndex]?.midi === k.midi);
                  return (
                    <button
                      key={k.midi}
                      type="button"
                      onMouseDown={() => {
                        void audioEngine.ensureToneReady().then(() => {
                          audioEngine.playNote(midiToFreq(k.midi), 0.35);
                        });
                        handlePitchInput(k.midi, 0, 'piano');
                      }}
                      className={`flex min-h-[62px] min-w-[44px] flex-1 flex-col items-center justify-between rounded-lg border px-1.5 py-2 text-xs font-medium cursor-pointer transition-transform active:scale-95 ${
                        isTarget
                          ? 'ring-2 ring-slate-900 ring-offset-1 scale-[1.03] border-blue-600 bg-blue-600 text-white'
                          : isKids && !k.sharp
                          ? chroma.bgClass
                          : k.sharp
                          ? 'border-slate-800 bg-slate-800 text-white hover:bg-slate-700'
                          : 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <span className="font-semibold">
                        {isKids && !k.sharp ? chroma.solfege : k.label}
                      </span>
                      <span className="font-mono text-[10px] opacity-80">
                        {isKids ? k.label : k.keyHint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recorded Performance Playback & Share Card */}
          {(recordedAudioUrl || (activity === 'performance' && sessionSummary)) && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-900">
                    Your Recorded Take
                  </h3>
                  <p className="text-xs text-slate-600">
                    Listen back, download your take, or share a friend link on the Shared Stage.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-700" htmlFor="inst-input">
                    Instrument:
                  </label>
                  <input
                    id="inst-input"
                    type="text"
                    value={instrumentLabel}
                    onChange={(e) => setInstrumentLabel(e.target.value)}
                    maxLength={40}
                    className="w-36 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                  />
                </div>
              </div>

              {recordedAudioUrl && (
                <audio controls src={recordedAudioUrl} className="w-full" />
              )}

              <div className="flex flex-wrap items-center gap-3">
                {recordedAudioUrl && (
                  <a
                    href={recordedAudioUrl}
                    download={`${exercise.title.toLowerCase().replace(/\s+/g, '-')}-take.webm`}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4" />
                    Download Audio
                  </a>
                )}

                <button
                  type="button"
                  disabled={isSharing}
                  onClick={handlePublishPerformance}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white cursor-pointer hover:bg-blue-800 disabled:opacity-50"
                >
                  <Share2 className="h-4 w-4" />
                  {isSharing ? 'Publishing...' : 'Publish & Share with Friends'}
                </button>

                {shareUrl && (
                  <button
                    type="button"
                    onClick={copyShareUrl}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {copiedLink ? 'Link Copied!' : 'Copy Friend Share Link'}
                  </button>
                )}
              </div>
            </div>
          )}
            </>
          )}
        </div>

        {/* Right Control & Concept Deck (4 cols) */}
        <aside className="space-y-4 lg:col-span-4">
          {/* Compact Sidebar Deck Switcher */}
          <div
            role="tablist"
            aria-label="Practice sidebar panels"
            className="grid grid-cols-2 gap-1.5 rounded-xl border-2 border-[#080808] bg-white p-1.5 shadow-[4px_4px_0_#080808]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === 'metrics'}
              onClick={() => setSidebarTab('metrics')}
              className={`min-h-[40px] rounded-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                sidebarTab === 'metrics'
                  ? 'bg-[#080808] text-[#FFE828]'
                  : 'text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              Metrics & Controls
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === 'tools'}
              onClick={() => setSidebarTab('tools')}
              className={`min-h-[40px] rounded-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                sidebarTab === 'tools'
                  ? 'bg-[#080808] text-[#FFE828]'
                  : 'text-[#080808] hover:bg-[#FFF9D6]'
              }`}
            >
              Timer · Metronome · Pitch
            </button>
          </div>

          <div className={sidebarTab === 'tools' ? 'space-y-4' : 'hidden'}>
            {/* Pomodoro Session Practice Timer */}
            <PomodoroPracticeTimerCard timer={pomodoro} />

            {/* Configurable Metronome Widget */}
            <MetronomeWidget
              bpm={practiceBpm}
              songDefaultBpm={exercise.bpm}
              onChangeBpm={setPracticeBpm}
              timeSignature={practiceTimeSignature}
              songDefaultTimeSignature={exercise.timeSignature}
              onChangeTimeSignature={setPracticeTimeSignature}
              clickEnabled={metronomeOn}
              onToggleClick={setMetronomeOn}
              exerciseRunning={isRunning}
              exerciseBeatIndex={exerciseBeatIndex}
            />

            {/* Sustained Pitch-Reference Tone Generator */}
            <PitchReferenceWidget
              songStartMidi={baseCues[0]?.midi ?? 60}
              exerciseRunning={isRunning}
            />
          </div>

          <div className={sidebarTab === 'metrics' ? 'space-y-4' : 'hidden'}>
          {/* Live Scoreboard */}
          <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[4px_4px_0_#080808] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-[#080808]">
                Session Metrics
              </h2>
              <button
                type="button"
                onClick={resetSession}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#080808] hover:text-[#EC4899] cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>

            {/* Stopwatch / Countdown Practice Timer */}
            <div className="rounded-xl border-2 border-[#080808] bg-[#FFF9D6] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <Clock className="h-3.5 w-3.5 text-blue-700" />
                  {timerMode === 'stopwatch' ? 'Practice Stopwatch' : 'Goal Countdown'}
                </span>
                <div className="flex items-center gap-1 rounded-md bg-slate-200/70 p-0.5">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => setTimerMode('stopwatch')}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-colors disabled:opacity-60 ${
                      timerMode === 'stopwatch'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Stopwatch
                  </button>
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => setTimerMode('countdown')}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-colors disabled:opacity-60 ${
                      timerMode === 'countdown'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Countdown
                  </button>
                </div>
              </div>

              <div className="flex items-baseline justify-between">
                <span
                  className={`font-mono text-2xl font-semibold tabular-nums ${
                    timerMode === 'countdown' && remainingSec <= 10 && isRunning
                      ? 'text-amber-700'
                      : 'text-slate-900'
                  }`}
                >
                  {displayedTimerText}
                </span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  Song Total: {formatDuration(totalSongPracticeSec + (isRunning ? elapsedSec : 0))}
                </span>
              </div>

              {timerMode === 'countdown' && (
                <div className="flex items-center justify-between gap-1.5 pt-0.5">
                  <span className="text-[11px] text-slate-500">Goal:</span>
                  <div className="flex items-center gap-1">
                    {[60, 120, 300, 600].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        disabled={isRunning}
                        onClick={() => setCountdownTargetSec(sec)}
                        className={`rounded px-2 py-0.5 font-mono text-[11px] cursor-pointer transition-colors disabled:opacity-60 ${
                          countdownTargetSec === sec
                            ? 'bg-blue-700 text-white'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {sec / 60}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">Score</div>
                <div className="font-mono text-xl font-semibold text-slate-900 tabular-nums">
                  {score}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">Accuracy</div>
                <div className="font-mono text-xl font-semibold text-slate-900 tabular-nums">
                  {currentAccuracy}%
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">Combo / Best</div>
                <div className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {combo} / {maxCombo}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-[11px] text-slate-500">Avg Timing</div>
                <div className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {avgOffsetMs >= 0 ? `+${avgOffsetMs}` : avgOffsetMs} ms
                </div>
              </div>
            </div>

            {sessionSummary && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-950 space-y-1.5">
                <div className="flex items-center justify-between font-semibold">
                  <span>
                    {timerExpired ? 'Goal Timer Complete' : 'Run Complete'} · {sessionSummary.stars}/3 Stars
                  </span>
                  <span className="font-mono">+{sessionSummary.xpEarned} XP</span>
                </div>
                <div className="flex items-center justify-between font-mono text-[11px] text-emerald-900 tabular-nums">
                  <span>Time Spent: {formatDuration(sessionSummary.durationSec)}</span>
                  <span>Song Total: {formatDuration(totalSongPracticeSec)}</span>
                </div>
                <p className="text-emerald-800">
                  Progress saved. Try the next activity tab above to master this piece!
                </p>
              </div>
            )}
          </div>

          {/* Tempo, Metronome & Sensitivity Controls */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Practice Controls
              </h2>
              <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => onChangeLearningMode('kids')}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer ${
                    isKids ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Kids (5–8)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeLearningMode('studio')}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer ${
                    !isKids ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Studio (9+)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="tempo-slider" className="font-medium text-slate-700">
                  Practice Tempo
                </label>
                <span className="font-mono text-slate-900 tabular-nums">
                  {effectiveBpm} BPM ({tempoScale}%)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'Slow 75%', val: 75 },
                  { label: 'Steady 100%', val: 100 },
                  { label: 'Fast 120%', val: 120 },
                ].map((preset) => (
                  <button
                    key={preset.val}
                    type="button"
                    onClick={() =>
                      setPracticeBpm(
                        Math.max(30, Math.min(240, Math.round((exercise.bpm * preset.val) / 100)))
                      )
                    }
                    className={`rounded-md py-1 text-[11px] font-medium cursor-pointer border transition-colors ${
                      Math.abs(tempoScale - preset.val) <= 2
                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <input
                id="tempo-slider"
                type="range"
                min={55}
                max={125}
                step={5}
                value={Math.max(55, Math.min(125, tempoScale))}
                onChange={(e) =>
                  setPracticeBpm(
                    Math.max(30, Math.min(240, Math.round((exercise.bpm * Number(e.target.value)) / 100)))
                  )
                }
                className="w-full accent-blue-700"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <label htmlFor="mic-sens" className="font-medium text-slate-700">
                  Tap / Knock Sensitivity
                </label>
                <span className="font-mono text-slate-900 tabular-nums">
                  {(tapThreshold * 100).toFixed(1)}
                </span>
              </div>
              <input
                id="mic-sens"
                type="range"
                min={0.025}
                max={0.25}
                step={0.005}
                value={tapThreshold}
                onChange={(e) => setTapThreshold(Number(e.target.value))}
                className="w-full accent-blue-700"
              />
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer">
                <span className="flex items-center gap-2 font-medium">
                  <Music className="h-3.5 w-3.5 text-slate-500" />
                  Metronome Click
                </span>
                <input
                  type="checkbox"
                  checked={metronomeOn}
                  onChange={(e) => setMetronomeOn(e.target.checked)}
                  className="h-4 w-4 accent-blue-700"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer">
                <span className="flex items-center gap-2 font-medium">
                  {guideAudioOn ? (
                    <Volume2 className="h-3.5 w-3.5 text-slate-500" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5 text-slate-500" />
                  )}
                  Guide Melody Synth
                </span>
                <input
                  type="checkbox"
                  checked={guideAudioOn}
                  onChange={(e) => setGuideAudioOn(e.target.checked)}
                  className="h-4 w-4 accent-blue-700"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer">
                <span className="flex items-center gap-2 font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-slate-500" />
                  4-Beat Count-In
                </span>
                <input
                  type="checkbox"
                  checked={countInOn}
                  onChange={(e) => setCountInOn(e.target.checked)}
                  className="h-4 w-4 accent-blue-700"
                />
              </label>

              {activity === 'pitch' && (
                <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer">
                  <span className="font-medium">Wait-For-Note Step Mode</span>
                  <input
                    type="checkbox"
                    checked={guidedStepPitch}
                    onChange={(e) => setGuidedStepPitch(e.target.checked)}
                    className="h-4 w-4 accent-blue-700"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Teacher Coaching Tip */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Teacher Coaching Notes
            </h2>
            <p className="text-sm leading-relaxed text-slate-600">
              {exercise.coachingTip}
            </p>
            <p className="pt-1 text-xs text-slate-400">
              Prepared by {exercise.authorName}
            </p>
          </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
