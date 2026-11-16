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
        className={`rounded-2xl border-2 border-[#080808] bg-white p-5 shadow-[4px_4px_0_#080808] space-y-4 ${
          featured ? 'ring-2 ring-[#EC4899]' : ''
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#2D40EA]">
              {perf.authorName} · {perf.instrument} · {perf.activityType}
            </div>
            <h3 className="mt-0.5 font-display text-lg font-bold text-[#080808]">
              {perf.exerciseTitle}
            </h3>
          </div>
          <div className="text-right font-mono text-xs text-[#080808] tabular-nums">
            <div className="font-bold">{perf.accuracy}% Accuracy</div>
            <div className="text-slate-600">
              {perf.stars}/3 Stars · {perf.score} pts
            </div>
          </div>
        </div>

        {perf.audioDataUrl ? (
          <audio controls src={perf.audioDataUrl} className="w-full" />
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-[#080808] bg-[#FFFDF4] px-3 py-2.5 text-xs font-medium text-slate-700">
            <Music2 className="h-4 w-4 text-[#EC4899]" />
            Scorecard highlight ({perf.durationSec}s session recorded without mic audio)
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => handleCheer(perf.id)}
            disabled={hasCheered}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#080808] px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
              hasCheered
                ? 'bg-[#EC4899] text-white'
                : 'bg-[#FFF0F6] text-[#080808] hover:bg-[#EC4899] hover:text-white'
            }`}
          >
            <Heart className="h-3.5 w-3.5" />
            Applaud ({perf.applauseCount})
          </button>

          <button
            type="button"
            onClick={() => copyLink(perf.id)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-[#FFD000] px-3 py-1.5 text-xs font-bold text-[#080808] cursor-pointer hover:bg-[#3898EC] hover:text-white"
          >
            {copiedId === perf.id ? (
              <>
                <Check className="h-3.5 w-3.5" />
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
      <div className="rounded-3xl border-2 border-[#080808] bg-[#FFD000] p-6 shadow-[4px_4px_0_#080808]">
        <h1 className="font-display text-3xl font-bold text-[#080808]">
          Shared Performances Stage
        </h1>
        <p className="mt-1 text-sm font-medium text-[#080808]/90">
          Listen to student and friend recordings, applaud great takes, and copy shareable performance links.
        </p>
      </div>

      {spotlightPerformance && (
        <div className="space-y-3 rounded-2xl border-2 border-[#080808] bg-[#FFF9D6] p-5 shadow-[4px_4px_0_#080808]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#EC4899]">
              Shared Friend Performance
            </span>
            <button
              type="button"
              onClick={onClearSpotlight}
              className="text-xs font-bold text-[#2D40EA] hover:underline cursor-pointer"
            >
              View All Performances
            </button>
          </div>
          {renderCard(spotlightPerformance, true)}
        </div>
      )}

      {performances.length === 0 ? (
        <div className="rounded-2xl border-2 border-[#080808] bg-white p-8 text-center text-sm font-medium text-slate-700 shadow-[4px_4px_0_#080808]">
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
