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
    const { imageBase64, mimeType, instrument } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      instrument?: string;
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

    const instrumentContext = instrument?.trim()
      ? `The student plays: ${instrument.trim()}. Tailor the coaching tip and clef/register accordingly.`
      : 'Detect the likely instrument or general treble/bass staff from the sheet music.';

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `Transcribe the sheet music in this photo into valid ABC notation so a student can immediately play it as an interactive rhythm, pitch, and coordination exercise. ${instrumentContext}
Rules for abcNotation:
- Include X:1, T:<Title>, C:<Composer or Source>, M:<Meter like 4/4 or 3/4>, L:1/8 (or L:1/16), Q:1/4=<BPM>, K:<Key like C, G, F, Am>.
- Read the actual melody notes and rhythmic durations from the staff faithfully across the visible measures.
- If there is a bass/accompaniment staff or chord symbols, you may focus Voice 1 on the main melody or include clean playable notes in standard ABC syntax (avoid unsupported custom macros).
- Keep the ABC notation clean and parseable by abcjs.`,
          },
        ],
      },
      config: {
        systemInstruction:
          'You are an expert Optical Music Recognition (OMR) transcriber and encouraging children/all-ages music teacher. Output only accurate structured JSON.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Song title detected on the sheet' },
            composer: { type: Type.STRING, description: 'Composer, book, or track name' },
            instrument: { type: Type.STRING, description: 'Detected or target instrument' },
            timeSignature: { type: Type.STRING, description: 'Meter such as 4/4, 3/4, 6/8' },
            keySignature: { type: Type.STRING, description: 'Key signature such as C, G, F, Am' },
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
    const parsed = JSON.parse(rawText);
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
