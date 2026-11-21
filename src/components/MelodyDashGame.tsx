import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Heart,
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { MusicExercise, PitchCalibrationSettings, PitchReading, SongNote } from '../types/music';
import { audioEngine } from '../utils/audioEngine';
import { getNoteColorInfo } from '../utils/kidFriendlyTheme';
import { midiToFreq, midiToNoteName } from '../utils/notationParser';

type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'ROUND_SUMMARY' | 'GAME_OVER';

interface MelodyDashGameProps {
  exercises: MusicExercise[];
  calibration: PitchCalibrationSettings;
  onOpenCalibration: () => void;
  onExitToStudio: () => void;
  onAwardXp: (xp: number) => void;
}

interface GateEntity {
  id: number;
  kind: 'note' | 'hurdle';
  x: number;
  width: number;
  midi: number;
  noteName: string;
  solfege: string;
  color: string;
  status: 'active' | 'cleared' | 'missed';
  telegraphPulse: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
}

const KEYBOARD_NOTE_PADS: { midi: number; label: string; solfege: string; keyHint: string }[] = [
  { midi: 60, label: 'C4', solfege: 'Do', keyHint: 'Z' },
  { midi: 62, label: 'D4', solfege: 'Re', keyHint: 'X' },
  { midi: 64, label: 'E4', solfege: 'Mi', keyHint: 'C' },
  { midi: 65, label: 'F4', solfege: 'Fa', keyHint: 'V' },
  { midi: 67, label: 'G4', solfege: 'Sol', keyHint: 'B' },
  { midi: 69, label: 'A4', solfege: 'La', keyHint: 'N' },
  { midi: 71, label: 'B4', solfege: 'Ti', keyHint: 'M' },
  { midi: 72, label: 'C5', solfege: 'Do+', keyHint: ',' },
];

const KEY_TO_MIDI: Record<string, number> = {
  z: 60,
  '1': 60,
  x: 62,
  '2': 62,
  c: 64,
  '3': 64,
  v: 65,
  '4': 65,
  b: 67,
  '5': 67,
  n: 69,
  '6': 69,
  m: 71,
  '7': 71,
  ',': 72,
  '8': 72,
};

const MAX_PARTICLES = 120;
const HITSTOP_DURATION_SEC = 0.045;
const COYOTE_TIME_SEC = 0.095;
const JUMP_BUFFER_SEC = 0.125;

export function MelodyDashGame({
  exercises,
  calibration,
  onOpenCalibration,
  onExitToStudio,
  onAwardXp,
}: MelodyDashGameProps) {
  // Prefer user's uploaded/scanned exercise first, otherwise first built-in song
  const defaultSongId = useMemo(() => {
    const uploaded = exercises.find((e) => !e.isBuiltIn);
    return uploaded ? uploaded.id : exercises[0]?.id || 'endless';
  }, [exercises]);

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [selectedSongId, setSelectedSongId] = useState<string>(defaultSongId);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [backdropFailed, setBackdropFailed] = useState<boolean>(false);

  const [muted, setMuted] = useState<boolean>(false);
  const [micEnabled, setMicEnabled] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [livePitch, setLivePitch] = useState<PitchReading | null>(null);

  // HUD snapshot state (only synced when discrete integer stats change)
  const [hud, setHud] = useState({
    score: 0,
    streak: 0,
    maxStreak: 0,
    lives: 5,
    cleared: 0,
    total: 0,
    fever: false,
    xpAwarded: 0,
  });

  const selectedExercise = useMemo(() => {
    if (selectedSongId === 'endless') return null;
    return exercises.find((e) => e.id === selectedSongId) || exercises[0] || null;
  }, [exercises, selectedSongId]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameStateRef = useRef<GameState>('TITLE_MENU');
  const mutedRef = useRef<boolean>(false);
  const livePitchRef = useRef<PitchReading | null>(null);
  const calibrationRef = useRef<PitchCalibrationSettings>(calibration);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);

  // Mutable 60fps simulation state (no React state churn per frame)
  const simRef = useRef({
    width: 1120,
    height: 520,
    groundY: 410,
    playerX: 190,
    playerY: 410,
    playerVy: 0,
    scaleX: 1,
    scaleY: 1,
    grounded: true,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    hitstopTimer: 0,
    shakeTimer: 0,
    shakeMagnitude: 0,
    invulnTimer: 0,
    scrollOffset: 0,
    scrollSpeed: 295,
    score: 0,
    streak: 0,
    maxStreak: 0,
    lives: 5,
    clearedCount: 0,
    totalScheduled: 0,
    endlessMode: false,
    spawnCursor: 0,
    songQueue: [] as { kind: 'note' | 'hurdle'; midi: number; gapPx: number }[],
    nextSpawnX: 760,
    nextId: 1,
    gates: [] as GateEntity[],
    floatingTexts: [] as FloatingText[],
    particles: Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      radius: 4,
      color: '#FFD000',
    })) as Particle[],
    activePianoFlashMidi: null as number | null,
    activePianoFlashUntil: 0,
    xpAwardedForRun: false,
  });

  // Procedural Web Audio SFX helper (100% free & zero paid API calls)
  const playGameSfx = useCallback(
    (type: 'jump' | 'clear' | 'hurdle' | 'hurt' | 'win', midi?: number) => {
      if (mutedRef.current) return;
      void audioEngine.ensureToneReady().then(() => {
        if (type === 'clear' && typeof midi === 'number') {
          audioEngine.playNote(midiToFreq(midi), 0.24, 0.72);
        } else if (type === 'jump') {
          audioEngine.playNote(523.25, 0.08, 0.32);
        } else if (type === 'hurdle') {
          audioEngine.playFeedbackChime('perfect');
        } else if (type === 'hurt') {
          audioEngine.playNote(146.83, 0.22, 0.45);
        } else if (type === 'win') {
          audioEngine.playNote(523.25, 0.16, 0.6);
          setTimeout(() => audioEngine.playNote(659.25, 0.16, 0.6), 110);
          setTimeout(() => audioEngine.playNote(783.99, 0.3, 0.75), 220);
        }
      });
    },
    []
  );

  const spawnBurst = useCallback((x: number, y: number, color: string, count = 16) => {
    const pool = simRef.current.particles;
    let spawned = 0;
    for (let i = 0; i < pool.length && spawned < count; i++) {
      const p = pool[i];
      if (!p.active) {
        const angle = (Math.PI * 2 * spawned) / count + (Math.random() - 0.5) * 0.4;
        const speed = 110 + Math.random() * 220;
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - 90;
        p.life = 0.55 + Math.random() * 0.25;
        p.maxLife = p.life;
        p.radius = 4 + Math.random() * 4;
        p.color = color;
        spawned++;
      }
    }
  }, []);

  const pushFloatText = useCallback((x: number, y: number, text: string, color: string) => {
    simRef.current.floatingTexts.push({
      x,
      y,
      vy: -72,
      text,
      color,
      life: 0.85,
    });
  }, []);

  const syncHudSnapshot = useCallback(() => {
    const s = simRef.current;
    setHud({
      score: s.score,
      streak: s.streak,
      maxStreak: s.maxStreak,
      lives: s.lives,
      cleared: s.clearedCount,
      total: s.endlessMode ? 0 : s.totalScheduled,
      fever: s.streak >= 8,
      xpAwarded: Math.max(25, Math.round(s.score / 18)),
    });
  }, []);

  const buildQueueFromExercise = useCallback(
    (ex: MusicExercise | null): { kind: 'note' | 'hurdle'; midi: number; gapPx: number }[] => {
      if (!ex || ex.notes.length === 0) {
        const scale = [60, 62, 64, 65, 67, 69, 71, 72];
        const items: { kind: 'note' | 'hurdle'; midi: number; gapPx: number }[] = [];
        for (let i = 0; i < 40; i++) {
          if (i % 5 === 3) {
            items.push({ kind: 'hurdle', midi: 60, gapPx: 320 });
          } else {
            items.push({ kind: 'note', midi: scale[(i * 3) % scale.length], gapPx: 290 });
          }
        }
        return items;
      }

      const melodyNotes: SongNote[] = ex.notes.filter((n) => n.hand !== 'left');
      const source = melodyNotes.length > 0 ? melodyNotes : ex.notes;
      const items: { kind: 'note' | 'hurdle'; midi: number; gapPx: number }[] = [];
      source.forEach((n, idx) => {
        const normalizedMidi =
          n.midi < 55 ? n.midi + 12 : n.midi > 81 ? n.midi - 12 : n.midi;
        const gap = Math.max(245, Math.min(440, Math.round((n.durationBeats || 1) * 265)));
        items.push({ kind: 'note', midi: normalizedMidi, gapPx: gap });
        if (idx > 0 && idx % 4 === 3) {
          items.push({ kind: 'hurdle', midi: normalizedMidi, gapPx: 280 });
        }
      });
      return items;
    },
    []
  );

  const triggerJump = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    simRef.current.jumpBufferTimer = JUMP_BUFFER_SEC;
  }, []);

  const matchPitchAttempt = useCallback(
    (playedMidi: number, cents = 0, fromMic = false) => {
      if (gameStateRef.current !== 'PLAYING') return;
      const s = simRef.current;
      s.activePianoFlashMidi = playedMidi;
      s.activePianoFlashUntil = performance.now() + 220;

      const tolerance = Math.max(25, calibrationRef.current.centsTolerance);
      if (fromMic && Math.abs(cents) > tolerance) return;

      // Find nearest active note gate ahead of or overlapping Beat Bot
      let targetGate: GateEntity | null = null;
      let bestDist = Infinity;
      for (const gate of s.gates) {
        if (gate.kind !== 'note' || gate.status !== 'active') continue;
        const center = gate.x + gate.width / 2;
        const dist = center - s.playerX;
        if (dist > -70 && dist < 390 && Math.abs(dist) < bestDist) {
          bestDist = Math.abs(dist);
          targetGate = gate;
        }
      }

      if (!targetGate) {
        if (!fromMic) playGameSfx('clear', playedMidi);
        return;
      }

      // Match pitch class so voices/octaves and any instrument range feel responsive
      const samePitchClass =
        ((playedMidi % 12) + 12) % 12 === ((targetGate.midi % 12) + 12) % 12;

      if (samePitchClass) {
        targetGate.status = 'cleared';
        s.streak += 1;
        s.maxStreak = Math.max(s.maxStreak, s.streak);
        s.clearedCount += 1;
        const mult = s.streak >= 8 ? 2 : 1;
        const pts = (100 + Math.min(s.streak, 12) * 15) * mult;
        s.score += pts;
        s.scaleX = 1.24;
        s.scaleY = 0.8;
        s.hitstopTimer = HITSTOP_DURATION_SEC;
        s.shakeTimer = 0.14;
        s.shakeMagnitude = s.streak >= 8 ? 7 : 4;
        spawnBurst(targetGate.x + targetGate.width / 2, s.groundY - 95, targetGate.color, 18);
        pushFloatText(
          targetGate.x,
          s.groundY - 160,
          `${targetGate.solfege}! +${pts}`,
          s.streak >= 8 ? '#FFD000' : '#FFFFFF'
        );
        playGameSfx('clear', targetGate.midi);
        syncHudSnapshot();
      } else if (!fromMic) {
        // Audition tapped note gently without harsh punishment
        playGameSfx('clear', playedMidi);
      }
    },
    [playGameSfx, pushFloatText, spawnBurst, syncHudSnapshot]
  );

  const startNewRun = useCallback(() => {
    const s = simRef.current;
    const isEndless = selectedSongId === 'endless';
    const queue = buildQueueFromExercise(isEndless ? null : selectedExercise);

    s.endlessMode = isEndless;
    s.songQueue = queue;
    s.spawnCursor = 0;
    s.totalScheduled = queue.length;
    s.gates = [];
    s.floatingTexts = [];
    for (const p of s.particles) p.active = false;

    s.playerY = s.groundY;
    s.playerVy = 0;
    s.scaleX = 1;
    s.scaleY = 1;
    s.grounded = true;
    s.coyoteTimer = 0;
    s.jumpBufferTimer = 0;
    s.hitstopTimer = 0;
    s.shakeTimer = 0;
    s.invulnTimer = 0;
    s.scrollOffset = 0;
    s.scrollSpeed = 285 * speedMultiplier;
    s.score = 0;
    s.streak = 0;
    s.maxStreak = 0;
    s.lives = 5;
    s.clearedCount = 0;
    s.nextSpawnX = s.width + 80;
    s.xpAwardedForRun = false;

    // Pre-populate first 2 gates visibly approaching
    for (let i = 0; i < 3 && i < queue.length; i++) {
      const item = queue[s.spawnCursor++];
      const info = getNoteColorInfo(item.midi);
      const x = Math.max(s.playerX + 420, s.nextSpawnX);
      s.gates.push({
        id: s.nextId++,
        kind: item.kind,
        x,
        width: item.kind === 'hurdle' ? 44 : 68,
        midi: item.midi,
        noteName: midiToNoteName(item.midi),
        solfege: info.solfege,
        color: item.kind === 'hurdle' ? '#FF6565' : info.hex,
        status: 'active',
        telegraphPulse: 0,
      });
      s.nextSpawnX = x + item.gapPx;
    }

    syncHudSnapshot();
    void audioEngine.ensureToneReady();
    setGameState('PLAYING');
  }, [buildQueueFromExercise, selectedExercise, selectedSongId, speedMultiplier, syncHudSnapshot]);

  const toggleMicrophone = useCallback(async () => {
    setMicError(null);
    if (micEnabled) {
      audioEngine.stopMicrophone();
      setMicEnabled(false);
      setLivePitch(null);
      livePitchRef.current = null;
      return;
    }

    try {
      await audioEngine.startMicrophone({
        tapThreshold: 0.09,
        onTransient: () => {
          triggerJump();
        },
        onPitch: (reading) => {
          livePitchRef.current = reading;
          setLivePitch(reading);
          if (reading && gameStateRef.current === 'PLAYING') {
            matchPitchAttempt(reading.midi, reading.cents, true);
          }
        },
      });
      setMicEnabled(true);
    } catch {
      setMicError('Microphone blocked or unavailable. Use Keyboard (Z–M / Space) or bottom Note Pads!');
    }
  }, [matchPitchAttempt, micEnabled, triggerJump]);

  // Clean up mic on unmount
  useEffect(() => {
    return () => {
      audioEngine.stopMicrophone();
    };
  }, []);

  // Keyboard & Blur Listeners
  useEffect(() => {
    const heldKeys = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();

      if (key === 'escape' || key === 'p') {
        if (gameStateRef.current === 'PLAYING') {
          setGameState('PAUSED');
        } else if (gameStateRef.current === 'PAUSED') {
          setGameState('PLAYING');
        }
        return;
      }

      if (gameStateRef.current === 'TITLE_MENU' && (key === 'enter' || key === ' ')) {
        e.preventDefault();
        startNewRun();
        return;
      }

      if (gameStateRef.current !== 'PLAYING') return;

      if (key === ' ' || e.key === 'ArrowUp' || key === 'w') {
        e.preventDefault();
        if (!heldKeys.has(key)) {
          heldKeys.add(key);
          triggerJump();
        }
        return;
      }

      if (key in KEY_TO_MIDI && !heldKeys.has(key)) {
        heldKeys.add(key);
        matchPitchAttempt(KEY_TO_MIDI[key], 0, false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.key.toLowerCase());
    };

    const onBlur = () => {
      heldKeys.clear();
      simRef.current.jumpBufferTimer = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [matchPitchAttempt, startNewRun, triggerJump]);

  // Main 60fps Isolated Canvas Simulation & Renderer
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const rect = container.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(320, Math.floor(rect.width));
        const h = Math.max(280, Math.floor(rect.height));

        if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
          canvas.width = Math.floor(w * dpr);
          canvas.height = Math.floor(h * dpr);
        }

        const s = simRef.current;
        s.width = w;
        s.height = h;
        s.groundY = Math.round(h * 0.78);
        s.playerX = Math.round(Math.min(220, w * 0.22));
        if (s.grounded && s.playerY > s.groundY) {
          s.playerY = s.groundY;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          // --- UPDATE SIMULATION WHEN PLAYING ---
          if (gameStateRef.current === 'PLAYING') {
            if (s.hitstopTimer > 0) {
              s.hitstopTimer = Math.max(0, s.hitstopTimer - dt);
            } else {
              // Gentle speed ramp on endless or high streak
              const targetSpeed =
                (285 + Math.min(s.streak, 15) * 6) * speedMultiplier;
              s.scrollSpeed += (targetSpeed - s.scrollSpeed) * Math.min(1, dt * 4);
              s.scrollOffset += s.scrollSpeed * dt;

              // Timers
              if (s.shakeTimer > 0) s.shakeTimer = Math.max(0, s.shakeTimer - dt);
              if (s.invulnTimer > 0) s.invulnTimer = Math.max(0, s.invulnTimer - dt);
              if (s.jumpBufferTimer > 0) s.jumpBufferTimer = Math.max(0, s.jumpBufferTimer - dt);

              if (s.grounded) {
                s.coyoteTimer = COYOTE_TIME_SEC;
              } else {
                s.coyoteTimer = Math.max(0, s.coyoteTimer - dt);
              }

              // Execute buffered jump if grounded or within coyote window
              if (s.jumpBufferTimer > 0 && s.coyoteTimer > 0) {
                s.playerVy = -680;
                s.grounded = false;
                s.coyoteTimer = 0;
                s.jumpBufferTimer = 0;
                s.scaleX = 0.78;
                s.scaleY = 1.26;
                spawnBurst(s.playerX, s.groundY, '#3898EC', 8);
                playGameSfx('jump');
              }

              // Gravity & Landing
              s.playerVy += 1880 * dt;
              s.playerY += s.playerVy * dt;
              if (s.playerY >= s.groundY) {
                if (!s.grounded) {
                  s.scaleX = 1.22;
                  s.scaleY = 0.8;
                }
                s.playerY = s.groundY;
                s.playerVy = 0;
                s.grounded = true;
              } else {
                s.grounded = false;
              }

              // Recover squash/stretch toward 1.0
              s.scaleX += (1 - s.scaleX) * Math.min(1, dt * 14);
              s.scaleY += (1 - s.scaleY) * Math.min(1, dt * 14);

              // Spawn upcoming gates/hurdles
              let lastGateX = s.gates.length
                ? Math.max(...s.gates.map((g) => g.x))
                : s.playerX + 360;
              while (
                (s.endlessMode || s.spawnCursor < s.songQueue.length) &&
                lastGateX < w + 320
              ) {
                const idx = s.spawnCursor % s.songQueue.length;
                const nextItem = s.songQueue[idx];
                s.spawnCursor += 1;
                const spawnX = Math.max(w + 80, lastGateX + nextItem.gapPx);
                const info = getNoteColorInfo(nextItem.midi);
                s.gates.push({
                  id: s.nextId++,
                  kind: nextItem.kind,
                  x: spawnX,
                  width: nextItem.kind === 'hurdle' ? 46 : 68,
                  midi: nextItem.midi,
                  noteName: midiToNoteName(nextItem.midi),
                  solfege: info.solfege,
                  color: nextItem.kind === 'hurdle' ? '#FF6565' : info.hex,
                  status: 'active',
                  telegraphPulse: 0,
                });
                lastGateX = spawnX;
              }

              // Move & evaluate gates
              let hudDirty = false;
              for (const gate of s.gates) {
                gate.x -= s.scrollSpeed * dt;
                gate.telegraphPulse += dt * 7;

                if (gate.status !== 'active') continue;

                if (gate.kind === 'hurdle') {
                  const playerFeetY = s.playerY;
                  const hurdleTopY = s.groundY - 56;
                  const overlapsX =
                    gate.x < s.playerX + 20 && gate.x + gate.width > s.playerX - 20;

                  if (overlapsX && playerFeetY > hurdleTopY + 8 && s.invulnTimer <= 0) {
                    gate.status = 'missed';
                    s.lives -= 1;
                    s.streak = 0;
                    s.invulnTimer = 0.85;
                    s.hitstopTimer = HITSTOP_DURATION_SEC;
                    s.shakeTimer = 0.25;
                    s.shakeMagnitude = 9;
                    spawnBurst(s.playerX, s.playerY - 24, '#FF6565', 20);
                    pushFloatText(s.playerX, s.playerY - 88, 'OOPS!', '#FF6565');
                    playGameSfx('hurt');
                    hudDirty = true;
                  } else if (gate.x + gate.width < s.playerX - 28) {
                    gate.status = 'cleared';
                    s.clearedCount += 1;
                    s.streak += 1;
                    s.maxStreak = Math.max(s.maxStreak, s.streak);
                    const pts = 75 * (s.streak >= 8 ? 2 : 1);
                    s.score += pts;
                    pushFloatText(s.playerX, s.playerY - 84, `LEAP! +${pts}`, '#10B981');
                    playGameSfx('hurdle');
                    hudDirty = true;
                  }
                } else {
                  // Note gate missed if passed behind Beat Bot
                  if (gate.x + gate.width < s.playerX - 36) {
                    gate.status = 'missed';
                    s.lives -= 1;
                    s.streak = 0;
                    s.shakeTimer = 0.16;
                    s.shakeMagnitude = 6;
                    pushFloatText(gate.x + 20, s.groundY - 120, `MISSED ${gate.noteName}`, '#FCA5A5');
                    playGameSfx('hurt');
                    hudDirty = true;
                  }
                }
              }

              s.gates = s.gates.filter((g) => g.x + g.width > -120);

              // Update particles & floating texts
              for (const p of s.particles) {
                if (!p.active) continue;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vy += 640 * dt;
                p.life -= dt;
                if (p.life <= 0) p.active = false;
              }
              for (let i = s.floatingTexts.length - 1; i >= 0; i--) {
                const ft = s.floatingTexts[i];
                ft.y += ft.vy * dt;
                ft.life -= dt;
                if (ft.life <= 0) s.floatingTexts.splice(i, 1);
              }

              // Check Game Over or Song Victory
              if (s.lives <= 0) {
                s.lives = 0;
                hudDirty = true;
                if (!s.xpAwardedForRun) {
                  s.xpAwardedForRun = true;
                  onAwardXp(Math.max(25, Math.round(s.score / 20)));
                }
                setGameState('GAME_OVER');
              } else if (
                !s.endlessMode &&
                s.spawnCursor >= s.songQueue.length &&
                s.gates.every((g) => g.status !== 'active')
              ) {
                hudDirty = true;
                if (!s.xpAwardedForRun) {
                  s.xpAwardedForRun = true;
                  onAwardXp(Math.max(60, Math.round(s.score / 15)));
                }
                playGameSfx('win');
                setGameState('ROUND_SUMMARY');
              }

              if (hudDirty) syncHudSnapshot();
            }
          }

          // --- RENDER CANVAS FRAME ---
          ctx.save();
          ctx.scale(dpr, dpr);

          // Camera shake offset
          let shakeX = 0;
          let shakeY = 0;
          if (s.shakeTimer > 0) {
            const decay = s.shakeTimer / 0.25;
            shakeX = (Math.random() - 0.5) * 2 * s.shakeMagnitude * decay;
            shakeY = (Math.random() - 0.5) * 2 * s.shakeMagnitude * decay;
          }
          ctx.translate(shakeX, shakeY);

          // 60% Dominant Cobalt / Midnight Stage Arena Surface
          const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
          skyGrad.addColorStop(0, '#0B132B');
          skyGrad.addColorStop(0.65, '#1C2541');
          skyGrad.addColorStop(1, '#111827');
          ctx.fillStyle = skyGrad;
          ctx.fillRect(-20, -20, w + 40, h + 40);

          // Encore Fever ambient rim glow
          if (s.streak >= 8) {
            const feverGrad = ctx.createLinearGradient(0, 0, w, 0);
            feverGrad.addColorStop(0, 'rgba(255, 208, 0, 0.14)');
            feverGrad.addColorStop(0.5, 'rgba(236, 72, 153, 0.12)');
            feverGrad.addColorStop(1, 'rgba(56, 152, 236, 0.14)');
            ctx.fillStyle = feverGrad;
            ctx.fillRect(0, 0, w, s.groundY);
          }

          // Parallax Background Staff Lines & Musical Notes
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1.5;
          const staffTop = Math.round(h * 0.22);
          for (let line = 0; line < 5; line++) {
            const ly = staffTop + line * 22;
            ctx.beginPath();
            ctx.moveTo(0, ly);
            ctx.lineTo(w, ly);
            ctx.stroke();
          }

          // Scrolling Measure Barlines
          const barSpacing = 220;
          const barShift = s.scrollOffset % barSpacing;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
          ctx.lineWidth = 2;
          for (let bx = barSpacing - barShift; bx < w; bx += barSpacing) {
            ctx.beginPath();
            ctx.moveTo(bx, staffTop);
            ctx.lineTo(bx, staffTop + 88);
            ctx.stroke();
          }

          // Piano-Key Highway Ground
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(0, s.groundY, w, h - s.groundY + 20);

          const tileW = 64;
          const tileShift = s.scrollOffset % tileW;
          const tilePalette = ['#FFD000', '#3898EC', '#EC4899', '#10B981', '#F97316', '#8B5CF6'];
          for (let tx = -tileW; tx < w + tileW; tx += tileW) {
            const idx = Math.abs(Math.floor((tx + s.scrollOffset) / tileW)) % tilePalette.length;
            ctx.fillStyle = tilePalette[idx];
            ctx.fillRect(tx - tileShift, s.groundY, tileW - 4, 12);
          }

          // Clean white strike-zone line under Beat Bot
          ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
          ctx.fillRect(s.playerX - 2, s.groundY - 210, 4, 210);

          // Draw Gates & Hurdles
          for (const gate of s.gates) {
            if (gate.status === 'cleared') continue;
            const alpha = gate.status === 'missed' ? 0.32 : 1;
            ctx.save();
            ctx.globalAlpha = alpha;

            if (gate.kind === 'hurdle') {
              const hurdleH = 56;
              const hurdleY = s.groundY - hurdleH;

              // Windup telegraph floor marker ahead of hurdle
              if (gate.status === 'active' && gate.x > s.playerX && gate.x - s.playerX < 360) {
                const pulse = 0.55 + Math.sin(gate.telegraphPulse) * 0.35;
                ctx.fillStyle = `rgba(255, 101, 101, ${pulse})`;
                ctx.fillRect(gate.x - 42, s.groundY - 6, 42, 6);
                ctx.fillStyle = '#FF6565';
                ctx.font = '800 13px "Plus Jakarta Sans", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('! CLAP / JUMP', gate.x + gate.width / 2, hurdleY - 14);
              }

              // Hurdle hazard block
              ctx.fillStyle = '#FF6565';
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.roundRect(gate.x, hurdleY, gate.width, hurdleH, 10);
              ctx.fill();
              ctx.stroke();

              // Crisp diagonal caution stripes
              ctx.fillStyle = '#080808';
              ctx.fillRect(gate.x + 8, hurdleY + 12, gate.width - 16, 8);
              ctx.fillRect(gate.x + 8, hurdleY + 30, gate.width - 16, 8);
            } else {
              // Harmonic Note Gate pillar
              const gateTop = s.groundY - 190;
              const gateH = 190;

              ctx.fillStyle = gate.color;
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.roundRect(gate.x, gateTop, gate.width, gateH, 16);
              ctx.fill();
              ctx.stroke();

              // Solfege & Note Name Sign
              ctx.fillStyle = '#080808';
              ctx.beginPath();
              ctx.roundRect(gate.x + 7, gateTop + 12, gate.width - 14, 54, 10);
              ctx.fill();

              ctx.fillStyle = '#FFFFFF';
              ctx.textAlign = 'center';
              ctx.font = '800 16px "Plus Jakarta Sans", sans-serif';
              ctx.fillText(gate.solfege, gate.x + gate.width / 2, gateTop + 34);
              ctx.fillStyle = '#FFD000';
              ctx.font = '700 14px "IBM Plex Mono", monospace';
              ctx.fillText(gate.noteName, gate.x + gate.width / 2, gateTop + 55);

              // Treble Note icon badge on gate body
              ctx.fillStyle = 'rgba(255,255,255,0.92)';
              ctx.beginPath();
              ctx.ellipse(gate.x + gate.width / 2 - 4, gateTop + 124, 13, 10, -0.35, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillRect(gate.x + gate.width / 2 + 5, gateTop + 86, 4, 38);
            }
            ctx.restore();
          }

          // Beat Bot Shadow (scales smoothly with jump altitude)
          const altitude = Math.max(0, s.groundY - s.playerY);
          const shadowScale = Math.max(0.42, 1 - altitude / 240);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.beginPath();
          ctx.ellipse(s.playerX, s.groundY + 4, 28 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
          ctx.fill();

          // Beat Bot Avatar (Squash & Stretch + Fever Aura)
          const invulnBlink = s.invulnTimer > 0 && Math.floor(now / 70) % 2 === 0;
          if (!invulnBlink) {
            ctx.save();
            ctx.translate(s.playerX, s.playerY);
            ctx.scale(s.scaleX, s.scaleY);

            // Encore gold halo when streak >= 8
            if (s.streak >= 8) {
              ctx.strokeStyle = '#FFD000';
              ctx.lineWidth = 4;
              ctx.beginPath();
              ctx.roundRect(-31, -68, 62, 64, 18);
              ctx.stroke();
            }

            // Body
            ctx.fillStyle = s.streak >= 8 ? '#FFD000' : '#3898EC';
            ctx.strokeStyle = '#080808';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.roundRect(-25, -60, 50, 52, 14);
            ctx.fill();
            ctx.stroke();

            // Antenna
            ctx.beginPath();
            ctx.moveTo(0, -60);
            ctx.lineTo(0, -76);
            ctx.stroke();
            ctx.fillStyle = '#EC4899';
            ctx.beginPath();
            ctx.arc(0, -80, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Visor & Eyes
            ctx.fillStyle = '#0B132B';
            ctx.beginPath();
            ctx.roundRect(-18, -48, 36, 22, 8);
            ctx.fill();
            ctx.fillStyle = '#10B981';
            ctx.beginPath();
            ctx.arc(-8, -37, 4, 0, Math.PI * 2);
            ctx.arc(8, -37, 4, 0, Math.PI * 2);
            ctx.fill();

            // Feet
            const stride = s.grounded ? Math.sin(s.scrollOffset * 0.08) * 6 : -4;
            ctx.fillStyle = '#080808';
            ctx.beginPath();
            ctx.roundRect(-18 + stride, -9, 14, 9, 4);
            ctx.roundRect(4 - stride, -9, 14, 9, 4);
            ctx.fill();

            ctx.restore();
          }

          // Live Pitch Bubble above Beat Bot
          const activePitch = livePitchRef.current;
          const flashActive =
            s.activePianoFlashMidi !== null && now < s.activePianoFlashUntil;
          const shownMidi = flashActive
            ? s.activePianoFlashMidi
            : activePitch
            ? activePitch.midi
            : null;
          if (shownMidi !== null) {
            const pInfo = getNoteColorInfo(shownMidi);
            ctx.fillStyle = pInfo.hex;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(s.playerX - 34, s.playerY - 118, 68, 28, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.font = '700 13px "IBM Plex Mono", monospace';
            ctx.fillText(midiToNoteName(shownMidi), s.playerX, s.playerY - 99);
          }

          // Pooled Particles
          for (const p of s.particles) {
            if (!p.active) continue;
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;

          // Floating Combat/Score Popups
          for (const ft of s.floatingTexts) {
            ctx.globalAlpha = Math.max(0, Math.min(1, ft.life * 1.4));
            ctx.fillStyle = ft.color;
            ctx.textAlign = 'center';
            ctx.font = '800 16px "Plus Jakarta Sans", sans-serif';
            ctx.fillText(ft.text, ft.x, ft.y);
          }
          ctx.globalAlpha = 1;

          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [onAwardXp, playGameSfx, pushFloatText, spawnBurst, speedMultiplier, syncHudSnapshot]);

  const progressPct =
    hud.total > 0 ? Math.min(100, Math.round((hud.cleared / hud.total) * 100)) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#0B132B] text-white select-none"
      role="application"
      aria-label="Melody Dash Interactive Studio Game"
    >
      {/* TITLE SCREEN OVERLAY */}
      {gameState === 'TITLE_MENU' && (
        <div className="relative flex h-full w-full items-center overflow-y-auto p-6 sm:p-10">
          {/* Full-bleed key art backdrop with safe fallback */}
          {!backdropFailed ? (
            <img
              src="/src/assets/images/game_melody_dash_backdrop_1795171844563.jpg"
              alt="Melody Dash illuminated rainbow piano highway"
              referrerPolicy="no-referrer"
              onError={() => setBackdropFailed(true)}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0B132B] via-[#1C2541] to-[#2D40EA]" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B132B]/92 via-[#0B132B]/72 to-[#0B132B]/35" />

          <div className="relative z-10 mx-auto flex w-full max-w-[1160px] flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            {/* Left Side: Custom SVG Title Lockup + Song & Calibration Deck */}
            <div className="max-w-xl space-y-5">
              <button
                type="button"
                onClick={onExitToStudio}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-white/80 bg-[#0B132B] px-4 py-2 text-xs font-bold text-white cursor-pointer hover:bg-[#1C2541]"
              >
                <ArrowLeft className="h-4 w-4" />
                Exit to Treblearts Studio
              </button>

              {/* Bespoke Inline SVG Title Lockup */}
              <div className="space-y-2">
                <svg
                  viewBox="0 0 540 112"
                  className="w-full max-w-[480px] drop-shadow-[0_6px_0_#080808]"
                  aria-label="Melody Dash"
                >
                  <defs>
                    <linearGradient id="dashTitleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#FFD000" />
                      <stop offset="50%" stopColor="#EC4899" />
                      <stop offset="100%" stopColor="#3898EC" />
                    </linearGradient>
                  </defs>
                  <rect x="6" y="14" width="76" height="76" rx="18" fill="#FFD000" stroke="#080808" strokeWidth="5" />
                  <circle cx="38" cy="60" r="11" fill="#080808" />
                  <rect x="46" y="28" width="7" height="33" rx="3" fill="#080808" />
                  <path d="M53 28 L68 35 L68 44 L53 38 Z" fill="#EC4899" />
                  <text
                    x="98"
                    y="66"
                    fill="url(#dashTitleGrad)"
                    stroke="#080808"
                    strokeWidth="6"
                    paintOrder="stroke"
                    fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
                    fontSize="52"
                    fontWeight="900"
                    letterSpacing="-1"
                  >
                    MELODY DASH
                  </text>
                  <text
                    x="100"
                    y="94"
                    fill="#F8FAFC"
                    fontFamily="'IBM Plex Mono', monospace"
                    fontSize="14"
                    fontWeight="700"
                    letterSpacing="2"
                  >
                    CALIBRATED STUDIO RUNNER
                  </text>
                </svg>

                <p className="text-sm font-medium leading-relaxed text-slate-200">
                  Sing or play the matching musical note on your calibrated instrument to shatter Harmonic Note Gates, and clap or jump over Syncopation Hurdles.
                </p>
              </div>

              {/* Song Selector + Tempo + Global Mic Calibration Card */}
              <div className="space-y-4 rounded-2xl border-2 border-[#080808] bg-[#111827] p-5 shadow-[6px_6px_0_#080808]">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="game-song-select"
                      className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#FFD000]"
                    >
                      Studio Song Level
                    </label>
                    <select
                      id="game-song-select"
                      value={selectedSongId}
                      onChange={(e) => setSelectedSongId(e.target.value)}
                      className="min-h-[44px] w-full rounded-xl border-2 border-slate-600 bg-[#0B132B] px-3 text-sm font-bold text-white focus:border-[#FFD000] focus:outline-none"
                    >
                      {exercises.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {!ex.isBuiltIn ? '★ ' : ''}
                          {ex.title} ({ex.notes.length} notes)
                        </option>
                      ))}
                      <option value="endless">Endless Arcade Medley</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="game-speed-select"
                      className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#3898EC]"
                    >
                      Pace / Difficulty
                    </label>
                    <select
                      id="game-speed-select"
                      value={String(speedMultiplier)}
                      onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
                      className="min-h-[44px] w-full rounded-xl border-2 border-slate-600 bg-[#0B132B] px-3 text-sm font-bold text-white focus:border-[#3898EC] focus:outline-none"
                    >
                      <option value="0.8">80% · Explorer Pace</option>
                      <option value="1">100% · Standard Stage</option>
                      <option value="1.2">120% · Encore Allegro</option>
                    </select>
                  </div>
                </div>

                {/* Global Calibration Status Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-[#0B132B] px-3.5 py-2.5">
                  <div className="text-xs font-semibold text-slate-200 tabular-nums">
                    <span className="font-bold text-[#FFD000]">Active Mic Profile:</span>{' '}
                    {calibration.instrumentLabel} · A4 = {calibration.referenceA4Hz.toFixed(1)} Hz
                    {calibration.semitoneTranspose !== 0
                      ? ` · ${calibration.semitoneTranspose > 0 ? '+' : ''}${calibration.semitoneTranspose} st`
                      : ''}
                  </div>
                  <button
                    type="button"
                    onClick={onOpenCalibration}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border-2 border-[#FFD000] bg-[#1C2541] px-3 py-1 text-xs font-bold text-[#FFD000] cursor-pointer hover:bg-[#FFD000] hover:text-[#080808]"
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    Calibrate Mic
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={startNewRun}
                    className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-6 py-3 text-base font-extrabold text-[#080808] shadow-[4px_4px_0_#080808] cursor-pointer transition-transform hover:-translate-y-0.5"
                  >
                    <Play className="h-5 w-5" />
                    Start Game
                  </button>

                  <button
                    type="button"
                    onClick={() => void toggleMicrophone()}
                    className={`inline-flex min-h-[52px] items-center gap-2 rounded-xl border-2 border-[#080808] px-4 py-3 text-xs font-bold shadow-[4px_4px_0_#080808] cursor-pointer ${
                      micEnabled ? 'bg-[#10B981] text-[#080808]' : 'bg-[#3898EC] text-white'
                    }`}
                  >
                    {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                    {micEnabled ? 'Mic Armed' : 'Arm Microphone'}
                  </button>
                </div>

                {micError && (
                  <p className="text-xs font-semibold text-[#FCA5A5]">{micError}</p>
                )}
              </div>

              {/* Single Flat Control-Hint Line */}
              <p className="font-mono text-xs font-semibold text-slate-300">
                Sing/Play Note or Z–M Keys Clear Note Gates · Clap or Space Jump Hurdles · Esc Pause
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE GAME VIEWPORT (TITLE NOT ACTIVE) */}
      {gameState !== 'TITLE_MENU' && (
        <>
          {/* Compact Top Solid HUD Bar (No backdrop-filter, >=85% canvas unobstructed) */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#080808] bg-[#111827] px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onExitToStudio}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-600 bg-[#1F2937] px-3 py-1.5 text-xs font-bold text-white cursor-pointer hover:bg-slate-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Studio
              </button>

              <div className="flex items-center gap-3 font-mono text-sm font-bold tabular-nums">
                <span className="text-[#FFD000]">SCORE: {hud.score}</span>
                <span className={hud.fever ? 'text-[#EC4899]' : 'text-[#3898EC]'}>
                  STREAK: {hud.streak}x {hud.fever ? 'FEVER' : ''}
                </span>
                {hud.total > 0 && (
                  <span className="text-slate-300">
                    PROGRESS: {progressPct}%
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Hearts with numeric label (non-hue-only affordance) */}
              <div
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B132B] px-3 py-1 text-xs font-bold tabular-nums"
                aria-label={`Lives remaining: ${hud.lives} out of 5`}
              >
                <Heart className="h-4 w-4 text-[#FF6565] fill-[#FF6565]" />
                <span>HP: {hud.lives}/5</span>
              </div>

              {livePitch && (
                <div className="hidden sm:inline-flex min-h-[40px] items-center rounded-lg border border-slate-700 bg-[#0B132B] px-3 py-1 font-mono text-xs font-bold text-[#10B981] tabular-nums">
                  MIC: {livePitch.noteName} ({livePitch.cents >= 0 ? '+' : ''}
                  {livePitch.cents}¢)
                </div>
              )}

              <button
                type="button"
                onClick={() => void toggleMicrophone()}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold cursor-pointer ${
                  micEnabled ? 'bg-[#10B981] text-[#080808]' : 'bg-[#1F2937] text-white'
                }`}
              >
                {micEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                {micEnabled ? 'Mic On' : 'Mic Off'}
              </button>

              <button
                type="button"
                onClick={onOpenCalibration}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-600 bg-[#1F2937] px-3 py-1.5 text-xs font-bold text-[#FFD000] cursor-pointer hover:bg-slate-700"
              >
                <Sliders className="h-3.5 w-3.5" />
                Tune
              </button>

              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute game audio' : 'Mute game audio'}
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-600 bg-[#1F2937] px-2.5 text-white cursor-pointer hover:bg-slate-700"
              >
                {muted ? <VolumeX className="h-4 w-4 text-[#FF6565]" /> : <Volume2 className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() =>
                  setGameState((prev) => (prev === 'PLAYING' ? 'PAUSED' : 'PLAYING'))
                }
                aria-label="Pause Game"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-600 bg-[#FFD000] px-3 py-1.5 text-xs font-extrabold text-[#080808] cursor-pointer"
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </button>
            </div>
          </div>

          {/* Isolated 60fps Canvas Container */}
          <div ref={containerRef} className="relative flex-1 w-full overflow-hidden">
            <canvas ref={canvasRef} className="block h-full w-full" />

            {/* PAUSE MODAL */}
            {gameState === 'PAUSED' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#080808]/80 p-6">
                <div className="w-full max-w-md space-y-5 rounded-2xl border-2 border-[#FFD000] bg-[#111827] p-6 text-center shadow-[6px_6px_0_#080808]">
                  <h2 className="font-display text-2xl font-bold text-[#FFD000]">
                    Stage Paused
                  </h2>
                  <p className="text-xs font-medium text-slate-300">
                    Active Mic Profile: {calibration.instrumentLabel} (A4 = {calibration.referenceA4Hz.toFixed(1)} Hz)
                  </p>
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => setGameState('PLAYING')}
                      className="min-h-[48px] w-full rounded-xl border-2 border-[#080808] bg-[#FFD000] px-5 py-2.5 text-sm font-extrabold text-[#080808] cursor-pointer"
                    >
                      Resume Run
                    </button>
                    <button
                      type="button"
                      onClick={onOpenCalibration}
                      className="min-h-[44px] w-full rounded-xl border-2 border-slate-600 bg-[#1F2937] px-5 py-2 text-xs font-bold text-white cursor-pointer"
                    >
                      Recalibrate Microphone &amp; Instrument
                    </button>
                    <button
                      type="button"
                      onClick={startNewRun}
                      className="min-h-[44px] w-full rounded-xl border-2 border-slate-600 bg-[#1F2937] px-5 py-2 text-xs font-bold text-white cursor-pointer"
                    >
                      Restart Run
                    </button>
                    <button
                      type="button"
                      onClick={() => setGameState('TITLE_MENU')}
                      className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-transparent px-5 py-2 text-xs font-bold text-slate-300 cursor-pointer hover:text-white"
                    >
                      Back to Song Select
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* VICTORY / GAME OVER MODAL */}
            {(gameState === 'ROUND_SUMMARY' || gameState === 'GAME_OVER') && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#080808]/85 p-6">
                <div className="w-full max-w-md space-y-5 rounded-2xl border-2 border-[#FFD000] bg-[#111827] p-6 text-center shadow-[6px_6px_0_#080808]">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#080808] bg-[#FFD000] text-[#080808]">
                    {gameState === 'ROUND_SUMMARY' ? (
                      <Trophy className="h-7 w-7" />
                    ) : (
                      <Sparkles className="h-7 w-7" />
                    )}
                  </div>
                  <div>
                    <h2 className="font-display text-2xl font-bold text-white">
                      {gameState === 'ROUND_SUMMARY' ? 'Encore Cleared!' : 'Set Complete!'}
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-slate-300">
                      {selectedExercise && selectedSongId !== 'endless'
                        ? selectedExercise.title
                        : 'Endless Arcade Medley'}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-700 bg-[#0B132B] p-3 font-mono tabular-nums">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400">SCORE</div>
                      <div className="text-lg font-extrabold text-[#FFD000]">{hud.score}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400">BEST STREAK</div>
                      <div className="text-lg font-extrabold text-[#3898EC]">{hud.maxStreak}x</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400">STUDIO XP</div>
                      <div className="text-lg font-extrabold text-[#10B981]">+{hud.xpAwarded}</div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <button
                      type="button"
                      onClick={startNewRun}
                      className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-5 py-2.5 text-sm font-extrabold text-[#080808] cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Play Again
                    </button>
                    <button
                      type="button"
                      onClick={() => setGameState('TITLE_MENU')}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-600 bg-[#1F2937] px-5 py-2 text-xs font-bold text-white cursor-pointer"
                    >
                      <Music className="h-4 w-4" />
                      Choose Another Song
                    </button>
                    <button
                      type="button"
                      onClick={onExitToStudio}
                      className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-transparent px-5 py-2 text-xs font-bold text-slate-300 cursor-pointer hover:text-white"
                    >
                      Exit to Treblearts Studio
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Tactile Note & Jump Deck (>=44px accessible touch targets) */}
          <div className="border-t-2 border-[#080808] bg-[#111827] px-4 py-2.5">
            <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-2">
              <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
                {KEYBOARD_NOTE_PADS.map((pad) => {
                  const color = getNoteColorInfo(pad.midi);
                  return (
                    <button
                      key={pad.midi}
                      type="button"
                      onPointerDown={() => matchPitchAttempt(pad.midi, 0, false)}
                      style={{ backgroundColor: color.hex }}
                      className="flex min-h-[48px] min-w-[54px] flex-1 flex-col items-center justify-center rounded-xl border-2 border-[#080808] px-2 py-1 text-white shadow-[2px_2px_0_#080808] cursor-pointer active:translate-y-0.5"
                    >
                      <span className="text-xs font-extrabold leading-tight">{pad.solfege}</span>
                      <span className="font-mono text-[10px] font-bold opacity-90">
                        {pad.label} · {pad.keyHint}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onPointerDown={triggerJump}
                className="min-h-[48px] min-w-[120px] rounded-xl border-2 border-[#080808] bg-[#FF6565] px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white shadow-[2px_2px_0_#080808] cursor-pointer active:translate-y-0.5"
              >
                Jump / Clap (Space)
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
