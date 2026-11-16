export type LearningExperienceMode = 'kids' | 'studio';

export interface NoteColorInfo {
  hex: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  solfege: string;
  letter: string;
}

const CHROMA_PALETTE: Record<number, NoteColorInfo> = {
  0: {
    hex: '#dc2626',
    bgClass: 'bg-red-600 text-white border-red-700',
    borderClass: 'border-red-500',
    textClass: 'text-red-700',
    solfege: 'Do',
    letter: 'C',
  },
  1: {
    hex: '#b91c1c',
    bgClass: 'bg-red-800 text-white border-red-900',
    borderClass: 'border-red-700',
    textClass: 'text-red-800',
    solfege: 'Di',
    letter: 'C#',
  },
  2: {
    hex: '#ea580c',
    bgClass: 'bg-orange-600 text-white border-orange-700',
    borderClass: 'border-orange-500',
    textClass: 'text-orange-700',
    solfege: 'Re',
    letter: 'D',
  },
  3: {
    hex: '#c2410c',
    bgClass: 'bg-orange-800 text-white border-orange-900',
    borderClass: 'border-orange-700',
    textClass: 'text-orange-800',
    solfege: 'Ri',
    letter: 'D#',
  },
  4: {
    hex: '#ca8a04',
    bgClass: 'bg-amber-500 text-slate-950 border-amber-600',
    borderClass: 'border-amber-500',
    textClass: 'text-amber-700',
    solfege: 'Mi',
    letter: 'E',
  },
  5: {
    hex: '#059669',
    bgClass: 'bg-emerald-600 text-white border-emerald-700',
    borderClass: 'border-emerald-500',
    textClass: 'text-emerald-700',
    solfege: 'Fa',
    letter: 'F',
  },
  6: {
    hex: '#047857',
    bgClass: 'bg-emerald-800 text-white border-emerald-900',
    borderClass: 'border-emerald-700',
    textClass: 'text-emerald-800',
    solfege: 'Fi',
    letter: 'F#',
  },
  7: {
    hex: '#0284c7',
    bgClass: 'bg-sky-600 text-white border-sky-700',
    borderClass: 'border-sky-500',
    textClass: 'text-sky-700',
    solfege: 'Sol',
    letter: 'G',
  },
  8: {
    hex: '#0369a1',
    bgClass: 'bg-sky-800 text-white border-sky-900',
    borderClass: 'border-sky-700',
    textClass: 'text-sky-800',
    solfege: 'Si',
    letter: 'G#',
  },
  9: {
    hex: '#4f46e5',
    bgClass: 'bg-indigo-600 text-white border-indigo-700',
    borderClass: 'border-indigo-500',
    textClass: 'text-indigo-700',
    solfege: 'La',
    letter: 'A',
  },
  10: {
    hex: '#4338ca',
    bgClass: 'bg-indigo-800 text-white border-indigo-900',
    borderClass: 'border-indigo-700',
    textClass: 'text-indigo-800',
    solfege: 'Li',
    letter: 'A#',
  },
  11: {
    hex: '#9333ea',
    bgClass: 'bg-purple-600 text-white border-purple-700',
    borderClass: 'border-purple-500',
    textClass: 'text-purple-700',
    solfege: 'Ti',
    letter: 'B',
  },
};

export function getNoteColorInfo(midi: number): NoteColorInfo {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  return CHROMA_PALETTE[pc] || CHROMA_PALETTE[0];
}
