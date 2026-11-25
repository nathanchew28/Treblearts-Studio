import { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-3 py-2 text-xs font-bold text-[#080808] whitespace-nowrap shrink-0 cursor-pointer shadow-[2px_2px_0_#080808] transition-colors duration-150 hover:bg-[#2D40EA] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#080808]"
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-[#080808] bg-white px-3 py-2 text-xs font-bold text-[#080808] whitespace-nowrap shrink-0 cursor-pointer shadow-[2px_2px_0_#080808] transition-colors duration-150 hover:bg-[#FFF9D6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#080808]"
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          Install App
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-2xl border-2 border-[#080808] bg-[#FFFDF4] p-6 shadow-[6px_6px_0_#080808]">
              <div className="flex items-start justify-between gap-3">
                <h2
                  id="ios-install-title"
                  className="font-display text-lg font-bold text-[#080808]"
                >
                  Install Treblearts Studio
                </h2>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="rounded-lg border-2 border-[#080808] bg-white p-1.5 text-[#080808] cursor-pointer hover:bg-[#FFD000]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm font-medium text-slate-800">
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#080808] bg-[#FFD000] text-xs font-bold">
                    1
                  </span>
                  <span>
                    Tap the{' '}
                    <span className="inline-flex items-center gap-1 font-bold text-[#080808]">
                      <Share className="h-3.5 w-3.5" /> Share
                    </span>{' '}
                    button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#080808] bg-[#FFD000] text-xs font-bold">
                    2
                  </span>
                  <span>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 min-h-[40px] w-full rounded-xl border-2 border-[#080808] bg-[#080808] py-2 text-xs font-bold text-[#FFD000] cursor-pointer hover:bg-[#2D40EA] hover:text-white"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
