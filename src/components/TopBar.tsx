import type { User } from 'firebase/auth';

export type NavTab = 'practice' | 'game' | 'labs' | 'teacher' | 'progress' | 'leaderboard' | 'stage';

interface TopBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: User | null;
  onAuthAction: () => void;
  displayName: string;
}

const NAV_ITEMS: { id: NavTab; label: string }[] = [
  { id: 'practice', label: 'Practice Hub' },
  { id: 'game', label: 'Melody Dash' },
  { id: 'labs', label: 'Music Labs' },
  { id: 'teacher', label: 'Teacher Studio' },
  { id: 'progress', label: 'Progress' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'stage', label: 'Shared Stage' },
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
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-6 px-6 py-3">
        <button
          type="button"
          onClick={() => onSelectTab('practice')}
          className="font-display text-xl font-bold tracking-tight text-[#080808] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#080808] rounded"
        >
          Treblearts Studio
        </button>

        <nav className="hidden md:flex items-center gap-2" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`min-h-[38px] rounded-xl px-3.5 py-1.5 text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#080808] ${
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

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onAuthAction}
            className="min-h-[40px] rounded-xl border-2 border-[#080808] bg-[#080808] px-4 py-2 text-xs font-bold text-[#FFD000] whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 hover:bg-[#2D40EA] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {user ? `Sign Out (${displayName.split(' ')[0]})` : 'Sign In with Google'}
          </button>
        </div>
      </div>

      <nav
        className="flex md:hidden items-center gap-2 overflow-x-auto border-t-2 border-[#080808] bg-white px-4 py-2"
        aria-label="Mobile Navigation"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-bold whitespace-nowrap shrink-0 ${
                isActive
                  ? 'border-2 border-[#080808] bg-[#FFD000] text-[#080808]'
                  : 'text-[#080808]/75'
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
