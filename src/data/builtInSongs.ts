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
    authorName: 'Treblearts Studio',
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

const COVER_SHERWOOD_1 = '/assets/aistudio/unnamed_4ad19d0e.jpg';
const COVER_SHERWOOD_2 = '/assets/aistudio/unnamed_d4644807.jpg';

export const BUILT_IN_EXERCISES: MusicExercise[] = [
  buildStarterExercise({
    id: 'lesson-sherwood-fayre-1',
    abc: `X:1
T:Sherwood Fayre — Maypole Dance (Lesson 1)
C:Repertoire 3 · Track 19
M:3/4
L:1/8
Q:1/4=104
K:G
V:1 clef=treble
G2 d2 d2 | d2 c B A G | G2 e2 e2 | e6 |
w:Weav-ing the rib-bons to-ge-ther, Dance the may-pole.
G2 d2 d2 | d2 c B A G | d2 A2 A2 | A4 z2 |]
w:Weav-ing the rib-bons to-ge-ther, Red, blue and gold.
V:2 clef=bass
[G,,B,,D,]6 | [G,,B,,D,]6 | [G,,C,E,]6 | [G,,C,E,]6 |
[G,,B,,D,]6 | [G,,B,,D,]6 | [F,,C,D,]6 | [F,,C,D,]4 z2 |]`,
    difficulty: 'Beginner',
    focus: 'Complete',
    coachingTip:
      'Lilting 3/4 Maypole waltz in G Major! Start cleanly on G4 (finger 1), leap to D5, glide smoothly through D–C–B–A–G, and anchor the left-hand I (G)–IV (C)–V7 (D7) bass chords.',
    coverImage: COVER_SHERWOOD_1,
    playsCount: 120,
  }),
  buildStarterExercise({
    id: 'lesson-sherwood-fayre-2',
    abc: `X:2
T:Sherwood Fayre — Times of Old (Lesson 2)
C:Repertoire 3 · Track 19 (Part 2)
M:3/4
L:1/8
Q:1/4=104
K:G
V:1 clef=treble
G2 d2 d2 | d2 c B A G | G2 e2 e2 | e6 |
w:Weav-ing the rib-bons to-ge-ther, Dance the may-pole.
G2 d2 d2 | d2 c B A G | c2 B2 A2 | G6 |]
w:Weav-ing the rib-bons to-ge-ther, Like times of old.
V:2 clef=bass
[G,,B,,D,]6 | [G,,B,,D,]6 | [G,,C,E,]6 | [G,,C,E,]6 |
[G,,B,,D,]6 | [G,,B,,D,]6 | [F,,C,D,]6 | [G,,B,,D,]6 |]`,
    difficulty: 'Beginner',
    focus: 'Coordination',
    coachingTip:
      'Second ending from Sheet Photo 2 in G Major! Step smoothly down C5–B4–A4 ("Like times of old") and resolve warmly onto home G4 with the bass I chord.',
    coverImage: COVER_SHERWOOD_2,
    playsCount: 95,
  }),
  buildStarterExercise({
    id: 'starter-twinkle-star',
    abc: `X:1
T:Twinkle, Twinkle, Little Star
C:Traditional Kids Classic
M:4/4
L:1/8
Q:1/4=88
K:C
C2 C2 G2 G2 | A2 A2 G4 | F2 F2 E2 E2 | D2 D2 C4 |
G2 G2 F2 F2 | E2 E2 D4 | G2 G2 F2 F2 | E2 E2 D4 |
C2 C2 G2 G2 | A2 A2 G4 | F2 F2 E2 E2 | D2 D2 C4 |]`,
    difficulty: 'Beginner',
    focus: 'Complete',
    coachingTip:
      'Great for ages 5 and up! Follow the Red (Do) and Blue (Sol) notes, clap the steady beat, or sing along.',
    coverImage: COVER_PITCH,
    playsCount: 540,
  }),
  buildStarterExercise({
    id: 'starter-mary-lamb',
    abc: `X:2
T:Mary Had a Little Lamb
C:First Notes Melody
M:4/4
L:1/8
Q:1/4=96
K:C
E2 D2 C2 D2 | E2 E2 E4 | D2 D2 D4 | E2 G2 G4 |
E2 D2 C2 D2 | E2 E2 E2 E2 | D2 D2 E2 D2 | C8 |]`,
    difficulty: 'Beginner',
    focus: 'Pitch',
    coachingTip:
      'Uses only 4 friendly notes (Do, Re, Mi, Sol). Try tapping the colorful xylophone keys or singing each note!',
    coverImage: COVER_PITCH,
    playsCount: 468,
  }),
  buildStarterExercise({
    id: 'starter-happy-birthday-rhythm',
    abc: `X:3
T:Happy Birthday Clap & Play
C:Celebration Groove
M:3/4
L:1/8
Q:1/4=92
K:C
G G A2 G2 | c2 B4 | G G A2 G2 | d2 c4 |
G G g2 e2 | c2 B2 A2 | f f e2 c2 | d2 c4 |]`,
    difficulty: 'Beginner',
    focus: 'Rhythm',
    coachingTip:
      'Feel the joyful 1-2-3 party waltz! Clap your hands or knock lightly on your desk to keep the beat.',
    coverImage: COVER_RHYTHM,
    playsCount: 392,
  }),
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
