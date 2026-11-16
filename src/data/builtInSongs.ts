import type { MusicExercise } from '../types/music';
import { parseAbcNotation } from '../utils/notationParser';

const COVER_RHYTHM = '/src/assets/images/cover_rhythm_atelier_1794840363449.jpg';
const COVER_PITCH = '/src/assets/images/cover_pitch_conservatory_1794840362925.jpg';
const COVER_COORD = '/src/assets/images/cover_coordination_studio_1794840363772.jpg';

function buildStarterExercise(params: {
  id: string;
  abc: string;
  difficulty: MusicExercise['difficulty'];
  focus: MusicExercise['focus'];
  coachingTip: string;
  coverImage: string;
  playsCount: number;
}): MusicExercise {
  const parsed = parseAbcNotation(params.abc);
  return {
    id: params.id,
    authorId: 'cadence-conservatory',
    authorName: 'Cadence Conservatory',
    title: parsed.title,
    composer: parsed.composer,
    sourceFormat: 'abc',
    notationText: parsed.notationText,
    bpm: parsed.bpm,
    timeSignature: parsed.timeSignature,
    keySignature: parsed.keySignature,
    difficulty: params.difficulty,
    focus: params.focus,
    coachingTip: params.coachingTip,
    notes: parsed.notes,
    isPublic: true,
    playsCount: params.playsCount,
    coverImage: params.coverImage,
    isBuiltIn: true,
  };
}

export const BUILT_IN_EXERCISES: MusicExercise[] = [
  buildStarterExercise({
    id: 'starter-ode-to-joy',
    abc: `X:1
T:Ode to Joy (Theme)
C:Ludwig van Beethoven
M:4/4
L:1/8
Q:1/4=104
K:C
E2 E2 F2 G2 | G2 F2 E2 D2 | C2 C2 D2 E2 | E3 D D4 |
E2 E2 F2 G2 | G2 F2 E2 D2 | C2 C2 D2 E2 | D3 C C4 |]`,
    difficulty: 'Beginner',
    focus: 'Complete',
    coachingTip:
      'Keep your wrist relaxed and breathe into the dotted-quarter syncopation in measures 4 and 8.',
    coverImage: COVER_PITCH,
    playsCount: 412,
  }),
  buildStarterExercise({
    id: 'starter-rhythm-syncopation',
    abc: `X:2
T:Clap & Knock Syncopation Etude
C:Cadence Rhythm Lab
M:4/4
L:1/8
Q:1/4=96
K:C
C2 C C C2 z2 | C C2 C C2 C2 | z2 C C C2 C C | C2 C2 C4 |]`,
    difficulty: 'Beginner',
    focus: 'Rhythm',
    coachingTip:
      'Tap lightly on your desk or clap cleanly. Count "1 - 2 & 3 - 4" aloud through the rests.',
    coverImage: COVER_RHYTHM,
    playsCount: 328,
  }),
  buildStarterExercise({
    id: 'starter-minuet-in-g',
    abc: `X:3
T:Minuet in G (BWV Anh. 114)
C:Christian Petzold
M:3/4
L:1/8
Q:1/4=112
K:G
d2 G A B c | d2 G2 G2 | e2 c d e f | g2 G2 G2 |
c2 d c B A | B2 c B A G | F2 G A B G | A6 |]`,
    difficulty: 'Intermediate',
    focus: 'Coordination',
    coachingTip:
      'Feel the buoyant 3/4 waltz pulse: lean gently on beat 1 while keeping the eighth-note runs even.',
    coverImage: COVER_COORD,
    playsCount: 276,
  }),
  buildStarterExercise({
    id: 'starter-scarborough-fair',
    abc: `X:4
T:Scarborough Fair
C:Traditional Dorian Air
M:3/4
L:1/8
Q:1/4=92
K:Ddor
D4 D2 | A4 A2 | E3 F E2 | D6 |
A4 c2 | d4 c2 | A2 B2 G2 | A6 |]`,
    difficulty: 'Beginner',
    focus: 'Pitch',
    coachingTip:
      'Listen closely to the natural B in measure 7 (Dorian mode). Sustain each long note steadily in the center of the tuner.',
    coverImage: COVER_PITCH,
    playsCount: 245,
  }),
  buildStarterExercise({
    id: 'starter-ragtime-coordination',
    abc: `X:5
T:Syncopated Ragtime Groove
C:Studio Etude No. 5
M:4/4
L:1/8
Q:1/4=108
K:C
C,2 E2 G,2 E2 | C,2 F A G,2 G2 | C,2 E G A,2 F2 | G,2 B, D C4 |]`,
    difficulty: 'Intermediate',
    focus: 'Coordination',
    coachingTip:
      'Anchor your left hand on the low bass pulse while your right hand snaps cleanly onto the upper melody notes.',
    coverImage: COVER_COORD,
    playsCount: 189,
  }),
  buildStarterExercise({
    id: 'starter-fur-elise-motif',
    abc: `X:6
T:Für Elise (Opening Motif)
C:Ludwig van Beethoven
M:3/8
L:1/16
Q:1/8=126
K:Am
e2 ^d2 e2 ^d2 e2 B2 | d2 c2 A4 z2 C E A2 | B4 z2 E ^G B2 | c4 z2 E2 e2 ^d2 |
e2 ^d2 e2 B2 d2 c2 | A4 z2 C E A2 | B4 z2 E c B2 | A4 z4 |]`,
    difficulty: 'Master',
    focus: 'Pitch',
    coachingTip:
      'Watch the half-step chromatic alternation between E5 and D#5, and land squarely on the G#4 leading tone in measure 3.',
    coverImage: COVER_RHYTHM,
    playsCount: 304,
  }),
];
