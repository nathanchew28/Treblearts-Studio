import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '14mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

app.post('/api/transcribe-sheet', async (req, res) => {
  try {
    const {
      imageBase64,
      mimeType,
      enhancedImageBase64,
      enhancedMimeType,
      instrument,
      omrHints,
    } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      enhancedImageBase64?: string;
      enhancedMimeType?: string;
      instrument?: string;
      omrHints?: {
        staffCount?: number;
        systemCount?: number;
        estimatedLayout?: string;
        lineSpacingPx?: number;
      };
    };

    if (!imageBase64 || !mimeType) {
      res.status(400).json({ error: 'Missing imageBase64 or mimeType.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      return;
    }

    const cleanBase64 = imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;
    const cleanEnhanced =
      enhancedImageBase64 && enhancedImageBase64.includes(',')
        ? enhancedImageBase64.split(',')[1]
        : enhancedImageBase64;

    const instrumentContext = instrument?.trim()
      ? `The student plays: ${instrument.trim()}. Tailor the coaching tip and clef/register accordingly.`
      : 'Detect the likely instrument or general treble/bass staff from the sheet music.';

    const hintSummary = omrHints?.staffCount
      ? `Client OMR Preprocessor measured ${omrHints.staffCount} five-line staves (${omrHints.systemCount || omrHints.staffCount} systems, layout=${omrHints.estimatedLayout || 'unknown'}, staff line spacing=${omrHints.lineSpacingPx || 0}px).`
      : '';

    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [
      {
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      },
    ];

    if (cleanEnhanced) {
      parts.push({
        inlineData: {
          mimeType: enhancedMimeType || 'image/png',
          data: cleanEnhanced,
        },
      });
    }

    parts.push({
      text: `Perform strict Optical Music Recognition (OMR) on the sheet music photo${
        cleanEnhanced ? ' (second image is the Otsu contrast-normalized OMR staff scan)' : ''
      } and convert it into pitch-accurate ABC notation.
${instrumentContext}
${hintSummary}

MANDATORY OMR ACCURACY PROTOCOL:
1. KEY SIGNATURE & HARMONIC CHECK FIRST:
   - Inspect sharps (#) or flats (b) next to the clef AND check any Roman numerals (I, IV, V7), chord symbols (G, C, D7), or final tonic note!
   - Example: If final tonic chord I spells G–B–D (even if key signature is partially cropped), K MUST be G (one sharp F#), NOT C!
2. CLEF & EXACT STAFF LINE/SPACE READING:
   - Read each notehead's exact vertical slot relative to the 5 horizontal lines!
   - Treble Clef (bottom line -> top line): E4(line1), F4(space1), G4(line2), A4(space2), B4(line3), c5(space3), d5(line4), e5(space4), f5(line5), g5(space above), a5(ledger above), d4(space below), c4(ledger below).
   - Bass Clef (if Grand Staff bottom staff, write V:2 clef=bass using lowercase/commas: G,,=G2 bottom line, B,,=B2 line2, D,=D3 line3, F,=F3 line4, A,=A3 line5, C,=C3 space2, E,=E3 space3). Never write treble notes on a bass staff!
3. RHYTHMIC DURATION CHECK (L:1/8):
   - Empty hollow notehead w/ dot = 6 eighths; empty hollow half note = 4; filled quarter note = 2; eighth note/beamed pair = 1 each; quarter rest = z2.
   - Verify EVERY measure sums strictly to the beats in M:<Meter> (e.g., 6 eighths in 3/4, 8 eighths in 4/4).
4. OUTPUT STRUCTURE:
   - Start with X:1, T:, C:, M:, L:1/8, Q:1/4=<BPM>, K:<Key>.
   - Put melody in V:1 clef=treble (with optional w: lyrics). Put left-hand chords/bass in V:2 clef=bass ONLY if a second bass staff is visibly present.
   - Keep syntax 100% compatible with abcjs.`,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction:
          'You are an expert Optical Music Recognition (OMR) engine and encouraging music conservatory teacher. Read every staff line, clef, key signature, accidental, and note duration with mathematical precision. Output only clean structured JSON.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Song title detected on the sheet' },
            composer: { type: Type.STRING, description: 'Composer, book, or track name' },
            instrument: { type: Type.STRING, description: 'Detected or target instrument' },
            timeSignature: { type: Type.STRING, description: 'Meter such as 4/4, 3/4, 6/8' },
            keySignature: { type: Type.STRING, description: 'Key signature such as C, G, D, F, Bb, Am' },
            bpm: { type: Type.INTEGER, description: 'Recommended practice tempo in BPM (60-160)' },
            difficulty: {
              type: Type.STRING,
              enum: ['Beginner', 'Intermediate', 'Master'],
            },
            focus: {
              type: Type.STRING,
              enum: ['Rhythm', 'Pitch', 'Coordination', 'Complete'],
            },
            coachingTip: {
              type: Type.STRING,
              description: 'Short friendly 1-2 sentence practice tip for kids and students',
            },
            abcNotation: {
              type: Type.STRING,
              description: 'Valid ABC notation string starting with X:1',
            },
          },
          required: [
            'title',
            'composer',
            'instrument',
            'timeSignature',
            'keySignature',
            'bpm',
            'difficulty',
            'focus',
            'coachingTip',
            'abcNotation',
          ],
        },
      },
    });

    const rawText = (response.text ?? '{}').trim();
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    res.json(parsed);
  } catch (error) {
    console.error('Sheet transcription error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to transcribe sheet music image.';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Cadence Studio server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();
