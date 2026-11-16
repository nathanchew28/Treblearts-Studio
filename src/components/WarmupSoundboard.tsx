import { useState } from 'react';
import { Drum, Sparkles, Volume2 } from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';
import { getNoteColorInfo } from '../utils/kidFriendlyTheme';
import { midiToFreq } from '../utils/notationParser';

const XYLOPHONE_BARS = [
  { midi: 60, keyHint: '1' },
  { midi: 62, keyHint: '2' },
  { midi: 64, keyHint: '3' },
  { midi: 65, keyHint: '4' },
  { midi: 67, keyHint: '5' },
  { midi: 69, keyHint: '6' },
  { midi: 71, keyHint: '7' },
  { midi: 72, keyHint: '8' },
];

export function WarmupSoundboard() {
  const [lastHitMidi, setLastHitMidi] = useState<number | null>(null);
  const [drumPulse, setDrumPulse] = useState<'kick' | 'wood' | null>(null);

  const hitBar = async (midi: number) => {
    await audioEngine.ensureToneReady();
    audioEngine.playNote(midiToFreq(midi), 0.45, 0.85);
    setLastHitMidi(midi);
    window.setTimeout(() => {
      setLastHitMidi((prev) => (prev === midi ? null : prev));
    }, 220);
  };

  const hitDrum = async (type: 'kick' | 'wood') => {
    await audioEngine.ensureToneReady();
    audioEngine.playMetronomeClick(type === 'wood');
    setDrumPulse(type);
    window.setTimeout(() => setDrumPulse(null), 160);
  };

  return (
    <div className="rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[4px_4px_0_#080808] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#080808] flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#EC4899]" />
            Rainbow Xylophone &amp; Beat Playground
          </h2>
          <p className="text-xs font-medium text-slate-700">
            Tap any colorful Do–Re–Mi bar or bounce the drum pads to warm up before starting a song!
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2D40EA]">
          <Volume2 className="h-4 w-4" />
          Tap, click, or knock!
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Rainbow Solfege Xylophone Bars */}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:col-span-9">
          {XYLOPHONE_BARS.map((bar, idx) => {
            const info = getNoteColorInfo(bar.midi);
            const active = lastHitMidi === bar.midi;
            return (
              <button
                key={bar.midi}
                type="button"
                onMouseDown={() => void hitBar(bar.midi)}
                className={`flex min-h-[86px] flex-col items-center justify-between rounded-xl border-2 border-[#080808] px-2 py-2.5 text-center cursor-pointer transition-transform duration-100 shadow-[2px_3px_0_#080808] ${
                  info.bgClass
                } ${active ? 'scale-95 brightness-110 translate-y-0.5' : 'hover:-translate-y-1'}`}
              >
                <span className="font-display text-lg font-bold leading-none">
                  {info.solfege}
                </span>
                <span className="text-xs font-bold opacity-95">
                  {info.letter}
                  {idx === 7 ? '5' : '4'}
                </span>
                <span className="font-mono text-[10px] font-semibold opacity-85">
                  Bar {bar.keyHint}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tactile Drum / Clap Pads */}
        <div className="grid grid-cols-2 gap-2.5 lg:col-span-3">
          <button
            type="button"
            onMouseDown={() => void hitDrum('wood')}
            className={`flex min-h-[86px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-[#080808] p-3 text-white cursor-pointer transition-transform duration-100 shadow-[2px_3px_0_#080808] ${
              drumPulse === 'wood'
                ? 'scale-95 bg-[#2D40EA]'
                : 'bg-[#3898EC] hover:-translate-y-0.5'
            }`}
          >
            <Drum className="h-5 w-5 text-[#FFD000]" />
            <span className="text-xs font-bold">High Clap</span>
          </button>

          <button
            type="button"
            onMouseDown={() => void hitDrum('kick')}
            className={`flex min-h-[86px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-[#080808] p-3 text-white cursor-pointer transition-transform duration-100 shadow-[2px_3px_0_#080808] ${
              drumPulse === 'kick'
                ? 'scale-95 bg-[#FF6565]'
                : 'bg-[#EC4899] hover:-translate-y-0.5'
            }`}
          >
            <Drum className="h-5 w-5 text-[#FFD000]" />
            <span className="text-xs font-bold">Low Knock</span>
          </button>
        </div>
      </div>
    </div>
  );
}
