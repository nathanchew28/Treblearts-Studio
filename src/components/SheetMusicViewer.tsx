import { useEffect, useRef, useState } from 'react';
import ABCJS from 'abcjs';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow';
import type { MusicExercise, SongNote } from '../types/music';
import { audioEngine } from '../utils/audioEngine';

interface SheetMusicViewerProps {
  exercise: MusicExercise;
  activeNoteIndex: number;
  interactive?: boolean;
  compactFocus?: boolean;
}

function toVexKey(noteName: string): { key: string; accidental?: string } {
  const match = noteName.match(/^([A-G])(#|b)?(\d)$/);
  if (!match) return { key: 'c/4' };
  const [, letter, acc, octave] = match;
  return {
    key: `${letter.toLowerCase()}${acc || ''}/${octave}`,
    accidental: acc,
  };
}

function toVexDuration(beats: number): string {
  if (beats >= 3.5) return 'w';
  if (beats >= 1.75) return 'h';
  if (beats >= 0.85) return 'q';
  if (beats >= 0.4) return '8';
  return '16';
}

export function SheetMusicViewer({
  exercise,
  activeNoteIndex,
  interactive = true,
  compactFocus = false,
}: SheetMusicViewerProps) {
  const notationRef = useRef<HTMLDivElement | null>(null);
  const vexFocusRef = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const container = notationRef.current;
    if (!container) return;
    setRenderError(null);
    container.innerHTML = '';

    let cancelled = false;

    if (exercise.sourceFormat === 'musicxml' && exercise.notationText.includes('<score-partwise')) {
      const osmd = new OpenSheetMusicDisplay(container, {
        autoResize: true,
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawPartNames: false,
      });
      osmd
        .load(exercise.notationText)
        .then(() => {
          if (!cancelled) {
            osmd.render();
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRenderError('Rendered simplified notation fallback.');
            ABCJS.renderAbc(container, exercise.notationText, {
              responsive: 'resize',
              add_classes: true,
            });
          }
        });
    } else {
      try {
        ABCJS.renderAbc(container, exercise.notationText, {
          responsive: 'resize',
          add_classes: true,
          staffwidth: 720,
          paddingtop: 6,
          paddingbottom: 6,
          clickListener: interactive
            ? (abcelem) => {
                if (abcelem?.pitches?.length) {
                  const firstPitch = abcelem.pitches[0].pitch;
                  const scale = [0, 2, 4, 5, 7, 9, 11];
                  const oct = Math.floor(firstPitch / 7);
                  const step = ((firstPitch % 7) + 7) % 7;
                  const midi = 60 + oct * 12 + scale[step];
                  const freq = 440 * Math.pow(2, (midi - 69) / 12);
                  audioEngine.playNote(freq, 0.35);
                }
              }
            : undefined,
        });
      } catch {
        setRenderError('Unable to engrave ABC notation.');
      }
    }

    return () => {
      cancelled = true;
    };
  }, [exercise.id, exercise.notationText, exercise.sourceFormat, interactive]);

  // Highlight active note in ABCJS SVG
  useEffect(() => {
    const container = notationRef.current;
    if (!container) return;
    const noteElements = container.querySelectorAll('.abcjs-note');
    noteElements.forEach((el, idx) => {
      if (idx === activeNoteIndex) {
        el.classList.add('abcjs-note-active');
      } else {
        el.classList.remove('abcjs-note-active');
      }
    });
  }, [activeNoteIndex]);

  // VexFlow live 4-note focus window so students always see an enlarged readable target bar
  useEffect(() => {
    const vexEl = vexFocusRef.current;
    if (!vexEl || !compactFocus) return;
    vexEl.innerHTML = '';

    const windowStart = Math.max(0, activeNoteIndex);
    const slice: SongNote[] = exercise.notes.slice(windowStart, windowStart + 4);
    if (slice.length === 0) return;

    try {
      const renderer = new Renderer(vexEl, Renderer.Backends.SVG);
      renderer.resize(340, 118);
      const context = renderer.getContext();
      const stave = new Stave(10, 8, 320);
      stave.addClef('treble').setContext(context).draw();

      const staveNotes = slice.map((note, idx) => {
        const { key, accidental } = toVexKey(note.noteName);
        const sn = new StaveNote({
          keys: [key],
          duration: toVexDuration(note.durationBeats),
        });
        if (accidental) {
          sn.addModifier(new Accidental(accidental));
        }
        if (idx === 0 && activeNoteIndex >= 0) {
          sn.setStyle({ fillStyle: '#1d4ed8', strokeStyle: '#1d4ed8' });
        }
        return sn;
      });

      const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT);
      voice.addTickables(staveNotes);
      new Formatter().joinVoices([voice]).format([voice], 235);
      voice.draw(context, stave);
    } catch {
      // Non-fatal VexFlow fallback
    }
  }, [exercise.notes, activeNoteIndex, compactFocus]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            {exercise.title} · {exercise.timeSignature} · Key of {exercise.keySignature}
          </span>
          <span className="font-mono tabular-nums">{exercise.bpm} BPM</span>
        </div>
        {renderError && <p className="mb-2 text-xs text-amber-700">{renderError}</p>}
        <div
          ref={notationRef}
          className="abcjs-container osmd-container max-h-[240px] overflow-y-auto overflow-x-auto rounded-lg bg-slate-50/40 px-2 py-1"
        />
      </div>

      {compactFocus && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2">
          <div>
            <p className="text-xs font-semibold text-slate-900">Next Notes Sight-Reading Window</p>
            <p className="text-xs text-slate-500">
              Target note highlighted in blue on the VexFlow focus staff
            </p>
          </div>
          <div ref={vexFocusRef} className="shrink-0 overflow-hidden" />
        </div>
      )}
    </div>
  );
}
