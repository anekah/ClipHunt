import {
  ArrowUpRight,
  FolderKanban,
  Film,
  Home,
  Menu,
  Scissors,
  Settings,
  X,
} from 'lucide-react';
import { NavSection } from '../shared/types';

interface TopBarProps {
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
  mobileOpen: boolean;
  onToggleMobile: () => void;
  onCloseMobile: () => void;
  onNewClip: () => void;
}

const TOP_NAV_ITEMS: Array<{ id: NavSection; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'create', label: 'Create Clips' },
  { id: 'projects', label: 'My Projects' },
  { id: 'library', label: 'Clip Library' },
  { id: 'settings', label: 'Settings' },
];

const MOBILE_BOTTOM_TABS: Array<{
  id: NavSection;
  label: string;
  icon: typeof Home;
}> = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'create', label: 'Studio', icon: Scissors },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'library', label: 'Library', icon: Film },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const ALL_MOBILE_NAV_ITEMS: Array<{ id: NavSection; label: string }> = [
  ...TOP_NAV_ITEMS,
  { id: 'help', label: 'Help & Support' },
];

export function TopBar({
  activeNav,
  onSelectNav,
  mobileOpen,
  onToggleMobile,
  onCloseMobile,
  onNewClip,
}: TopBarProps) {
  return (
    <>
      <header className="md:sticky md:top-0 z-40 bg-black/95 backdrop-blur-sm pt-3 pb-2 md:pt-4 md:pb-3 px-4 sm:px-8">
        <div className="mx-auto max-w-[1200px]">
          <div className="flex h-12 items-center justify-between gap-4 md:gap-8 rounded-md border border-white/25 bg-black px-3.5 sm:px-4">
            {/* Zone 1: Twin-Circle Mark + Single-Line Wordmark */}
            <button
              type="button"
              onClick={() => {
                onSelectNav('dashboard');
                onCloseMobile();
              }}
              className="inline-flex min-h-[44px] items-center gap-2.5 text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-sm"
            >
              <svg
                width="24"
                height="14"
                viewBox="0 0 24 14"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <circle cx="7" cy="7" r="5.5" fill="#FFFFFF" />
                <circle cx="17" cy="7" r="5.5" fill="#FFFFFF" />
              </svg>
              <span className="font-display text-sm font-semibold tracking-tight text-white">
                ClipHunt
              </span>
            </button>

            {/* Zone 2: 5 Single-Line Text Navigation Links (Desktop) */}
            <nav
              aria-label="Main navigation"
              className="hidden md:flex items-center gap-6 lg:gap-8 text-xs font-medium"
            >
              {TOP_NAV_ITEMS.map((item) => {
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onSelectNav(item.id)}
                    className={`whitespace-nowrap shrink-0 transition-colors py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-sm ${
                      active
                        ? 'text-white underline underline-offset-4 decoration-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Zone 3: 1 Primary Action + Mobile Menu Trigger */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onNewClip();
                  onCloseMobile();
                }}
                className="hidden md:inline-flex items-center gap-2 border-l border-white/25 pl-4 text-xs font-medium text-white hover:text-zinc-300 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>New Clip</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onToggleMobile}
                aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileOpen}
                className="flex md:hidden min-h-[44px] min-w-[44px] items-center justify-center rounded text-white hover:bg-white/10 active:bg-white/15 transition-colors touch-manipulation"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Drawer Menu (Secondary actions & Help & Support) */}
          {mobileOpen && (
            <nav
              aria-label="Mobile navigation"
              className="mt-2 rounded-xl border border-white/25 bg-black p-2.5 space-y-1 md:hidden"
            >
              {ALL_MOBILE_NAV_ITEMS.map((item) => {
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      onSelectNav(item.id);
                      onCloseMobile();
                    }}
                    className={`flex w-full min-h-[44px] items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors touch-manipulation ${
                      active
                        ? 'bg-white text-black'
                        : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>{item.label}</span>
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </header>

      {/* Fixed Bottom Tab Bar for Mobile Thumb-Zone Ergonomics (<10% of 844px viewport) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-white/20 bg-black/95 backdrop-blur-md md:hidden pb-[env(safe-area-inset-bottom)]"
      >
        {MOBILE_BOTTOM_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeNav === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                onSelectNav(tab.id);
                onCloseMobile();
              }}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 transition-colors touch-manipulation ${
                active ? 'text-white' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Icon
                className={`h-5 w-5 ${active ? 'text-white' : 'text-zinc-500'}`}
                strokeWidth={active ? 2.2 : 1.75}
                aria-hidden="true"
              />
              <span className="text-[11px] font-medium leading-none tracking-tight whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
