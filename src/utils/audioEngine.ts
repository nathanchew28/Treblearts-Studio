import * as Tone from 'tone';
import { PitchDetector } from 'pitchy';
import type { PitchReading } from '../types/music';
import { freqToMidiAndCents } from './notationParser';

class StudioAudioEngine {
  private synth: Tone.PolySynth | null = null;
  private clickHigh: Tone.MembraneSynth | null = null;
  private clickLow: Tone.MembraneSynth | null = null;

  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private pitchDetector: PitchDetector<Float32Array> | null = null;
  private timeDomainBuffer: Float32Array<ArrayBuffer> | null = null;
  private rafId: number | null = null;

  private movingAvgRms = 0.01;
  private lastTransientTime = 0;

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime = 0;

  async ensureToneReady(): Promise<void> {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
    if (!this.synth) {
      this.synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle8' },
        envelope: { attack: 0.012, decay: 0.25, sustain: 0.28, release: 0.65 },
        volume: -8,
      }).toDestination();
    }
    if (!this.clickHigh) {
      this.clickHigh = new Tone.MembraneSynth({
        pitchDecay: 0.01,
        octaves: 3,
        envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.03 },
        volume: -6,
      }).toDestination();
    }
    if (!this.clickLow) {
      this.clickLow = new Tone.MembraneSynth({
        pitchDecay: 0.01,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.03 },
        volume: -10,
      }).toDestination();
    }
  }

  playNote(freq: number, durationSec = 0.35, velocity = 0.85): void {
    if (!this.synth) {
      void this.ensureToneReady().then(() => {
        this.synth?.triggerAttackRelease(freq, durationSec, undefined, velocity);
      });
      return;
    }
    this.synth.triggerAttackRelease(freq, durationSec, undefined, velocity);
  }

  playMetronomeClick(accent: boolean): void {
    if (!this.clickHigh || !this.clickLow) return;
    if (accent) {
      this.clickHigh.triggerAttackRelease('C6', '32n');
    } else {
      this.clickLow.triggerAttackRelease('G5', '32n');
    }
  }

  playFeedbackChime(type: 'perfect' | 'good' | 'miss'): void {
    if (!this.synth) return;
    if (type === 'perfect') {
      this.synth.triggerAttackRelease('C6', 0.09, undefined, 0.35);
    } else if (type === 'good') {
      this.synth.triggerAttackRelease('G5', 0.08, undefined, 0.28);
    }
  }

  async startMicrophone(options: {
    tapThreshold: number;
    onPitch?: (reading: PitchReading | null, rawRms: number) => void;
    onTransient?: (rms: number, timestampMs: number) => void;
  }): Promise<void> {
    this.stopMicrophone();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.15;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    this.micStream = stream;
    this.audioCtx = ctx;
    this.analyser = analyser;
    this.micSource = source;
    this.pitchDetector = PitchDetector.forFloat32Array(analyser.fftSize);
    this.timeDomainBuffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    this.movingAvgRms = 0.01;
    this.lastTransientTime = 0;

    let currentThreshold = options.tapThreshold;
    this.currentThresholdGetter = () => currentThreshold;
    this.thresholdSetter = (val: number) => {
      currentThreshold = val;
    };

    const tick = () => {
      if (!this.analyser || !this.timeDomainBuffer || !this.audioCtx || !this.pitchDetector) {
        return;
      }

      this.analyser.getFloatTimeDomainData(this.timeDomainBuffer);

      // Compute instantaneous RMS
      let sumSquares = 0;
      for (let i = 0; i < this.timeDomainBuffer.length; i++) {
        const s = this.timeDomainBuffer[i];
        sumSquares += s * s;
      }
      const rms = Math.sqrt(sumSquares / this.timeDomainBuffer.length);

      // Transient tap/knock/clap detection
      const now = performance.now();
      const threshold = this.currentThresholdGetter ? this.currentThresholdGetter() : 0.08;
      if (
        rms > threshold &&
        rms > this.movingAvgRms * 1.75 &&
        now - this.lastTransientTime > 115
      ) {
        this.lastTransientTime = now;
        options.onTransient?.(rms, now);
      }
      // Exponential moving baseline adapts to room noise
      this.movingAvgRms = this.movingAvgRms * 0.92 + rms * 0.08;

      // Pitch detection via Pitchy (McLeod Pitch Method)
      if (options.onPitch) {
        if (rms > 0.012) {
          const [freq, clarity] = this.pitchDetector.findPitch(
            this.timeDomainBuffer,
            this.audioCtx.sampleRate
          );
          if (clarity >= 0.84 && freq >= 65 && freq <= 1450) {
            const { midi, noteName, cents } = freqToMidiAndCents(freq);
            options.onPitch({ freq, clarity, midi, noteName, cents, rms }, rms);
          } else {
            options.onPitch(null, rms);
          }
        } else {
          options.onPitch(null, rms);
        }
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private currentThresholdGetter: (() => number) | null = null;
  private thresholdSetter: ((val: number) => void) | null = null;

  updateTapThreshold(threshold: number): void {
    this.thresholdSetter?.(threshold);
  }

  stopMicrophone(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    this.analyser = null;
    this.pitchDetector = null;
    this.timeDomainBuffer = null;
  }

  getActiveMicStream(): MediaStream | null {
    return this.micStream;
  }

  async startRecording(): Promise<void> {
    if (!this.micStream) {
      throw new Error('Enable microphone first to record your performance.');
    }
    this.recordedChunks = [];
    const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.micStream, { mimeType, audioBitsPerSecond: 48000 })
      : new MediaRecorder(this.micStream);

    this.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) {
        this.recordedChunks.push(ev.data);
      }
    };
    this.recordingStartTime = performance.now();
    this.mediaRecorder.start(250);
  }

  async stopRecording(): Promise<{ blob: Blob; dataUrl: string; durationSec: number }> {
    const recorder = this.mediaRecorder;
    if (!recorder || recorder.state === 'inactive') {
      throw new Error('No active recording found.');
    }

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        resolve(new Blob(this.recordedChunks, { type: mime }));
      };
      recorder.stop();
    });

    const durationSec = Math.max(1, Math.round((performance.now() - this.recordingStartTime) / 1000));
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to encode audio recording.'));
      reader.readAsDataURL(blob);
    });

    return { blob, dataUrl, durationSec };
  }
}

export const audioEngine = new StudioAudioEngine();
