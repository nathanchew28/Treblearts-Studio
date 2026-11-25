import type { User } from 'firebase/auth';
import { PWAInstallButton } from './PWAInstallButton';

export type NavTab = 'practice' | 'create' | 'game' | 'labs' | 'community';

interface TopBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: User | null;
  onAuthAction: () => void;
  displayName: string;
}

const NAV_ITEMS: { id: NavTab; label: string }[] = [
  { id: 'practice', label: 'Practice' },
  { id: 'create', label: 'Create & Scan' },
  { id: 'game', label: 'Melody Dash' },
  { id: 'labs', label: 'Music Labs' },
  { id: 'community', label: 'Progress & Stage' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  user,
  onAuthAction,
  displayName,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-[#080808] bg-[#FFD000]">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 sm:py-3">
        <button
          type="button"
          onClick={() => onSelectTab('practice')}
          className="font-display text-lg font-bold tracking-tight text-[#080808] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#080808] rounded sm:text-xl"
        >
          Treblearts Studio
        </button>

        <nav
          className="hidden lg:flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1.5"
          aria-label="Primary Navigation"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`min-h-[40px] rounded-xl px-3 py-1.5 text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#080808] ${
                  isActive
                    ? 'border-2 border-[#080808] bg-white text-[#080808] shadow-[2px_2px_0_#080808]'
                    : 'border-2 border-transparent text-[#080808]/85 hover:bg-[#FEC700] hover:text-[#080808]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={onAuthAction}
            className="min-h-[40px] max-w-[190px] truncate rounded-xl border-2 border-[#080808] bg-[#080808] px-3.5 py-2 text-xs font-bold text-[#FFD000] whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 hover:bg-[#2D40EA] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-4"
          >
            {user ? `Sign Out (${displayName.split(' ')[0]})` : 'Sign In with Google'}
          </button>
        </div>
      </div>

      <nav
        className="flex lg:hidden flex-wrap items-center justify-center gap-1.5 border-t-2 border-[#080808] bg-white px-3 py-2 sm:px-6"
        aria-label="Responsive Navigation"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isActive
                  ? 'border-2 border-[#080808] bg-[#FFD000] text-[#080808] shadow-[2px_2px_0_#080808]'
                  : 'border-2 border-transparent text-[#080808]/80 hover:bg-[#FFF9D6] hover:text-[#080808]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
