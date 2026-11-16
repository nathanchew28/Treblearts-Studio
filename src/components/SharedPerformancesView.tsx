import { useState } from 'react';
import { Check, Heart, Link2, Music2 } from 'lucide-react';
import type { RecordedPerformance } from '../types/music';

interface SharedPerformancesViewProps {
  performances: RecordedPerformance[];
  spotlightPerformance: RecordedPerformance | null;
  onApplaud: (performanceId: string) => Promise<void>;
  onClearSpotlight: () => void;
}

export function SharedPerformancesView({
  performances,
  spotlightPerformance,
  onApplaud,
  onClearSpotlight,
}: SharedPerformancesViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [applaudedIds, setApplaudedIds] = useState<Set<string>>(new Set());

  const copyLink = async (id: string) => {
    const url = `${window.location.origin}?share=${id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCheer = async (id: string) => {
    setApplaudedIds((prev) => new Set(prev).add(id));
    await onApplaud(id);
  };

  const renderCard = (perf: RecordedPerformance, featured = false) => {
    const hasCheered = applaudedIds.has(perf.id);
    return (
      <article
        key={perf.id}
        className={`rounded-xl border bg-white p-5 space-y-4 ${
          featured ? 'border-blue-300' : 'border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500">
              {perf.authorName} · {perf.instrument} · {perf.activityType}
            </div>
            <h3 className="mt-0.5 font-display text-lg font-semibold text-slate-900">
              {perf.exerciseTitle}
            </h3>
          </div>
          <div className="text-right font-mono text-xs text-slate-700 tabular-nums">
            <div className="font-semibold text-slate-900">{perf.accuracy}% Accuracy</div>
            <div>
              {perf.stars}/3 Stars · {perf.score} pts
            </div>
          </div>
        </div>

        {perf.audioDataUrl ? (
          <audio controls src={perf.audioDataUrl} className="w-full" />
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
            <Music2 className="h-4 w-4 text-slate-400" />
            Scorecard highlight ({perf.durationSec}s session recorded without mic audio)
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => handleCheer(perf.id)}
            disabled={hasCheered}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
              hasCheered
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:text-rose-700'
            }`}
          >
            <Heart className="h-3.5 w-3.5" />
            Applaud ({perf.applauseCount})
          </button>

          <button
            type="button"
            onClick={() => copyLink(perf.id)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50"
          >
            {copiedId === perf.id ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                Copied Link
              </>
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5" />
                Share Link
              </>
            )}
          </button>
        </div>
      </article>
    );
  };

  return (
    <section className="mx-auto max-w-[1360px] px-6 py-8 space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="font-display text-3xl font-semibold text-slate-900">
          Shared Performances Stage
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Listen to student and friend recordings, applaud great takes, and copy shareable performance links.
        </p>
      </div>

      {spotlightPerformance && (
        <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-800">
              Shared Friend Performance
            </span>
            <button
              type="button"
              onClick={onClearSpotlight}
              className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
            >
              View All Performances
            </button>
          </div>
          {renderCard(spotlightPerformance, true)}
        </div>
      )}

      {performances.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No shared recordings yet. Open any song, choose &ldquo;4. Record &amp; Share Stage&rdquo;,
          enable your microphone, and publish your first performance!
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {performances.map((perf) => renderCard(perf))}
        </div>
      )}
    </section>
  );
}
