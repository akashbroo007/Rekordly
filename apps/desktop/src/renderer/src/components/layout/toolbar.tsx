import { Moon, Plus, Puzzle, Search, Settings, Sun } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '@rekordly/ui';
import { useUiStore } from '../../stores/ui-store';
import { useThemeStore } from '../../stores/theme-store';
import { NotificationCenter } from '../notification-center';

export function Toolbar() {
  const navigate = useNavigate();
  const searchQuery = useUiStore((state) => state.searchQuery);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);

  // ponytail: classy one-click theme switch — sun/moon crossfade + spin.
  const themeMode = useThemeStore((state) => state.mode);
  const setThemeMode = useThemeStore((state) => state.setMode);
  const isDark = themeMode !== 'light';

  // ponytail: toggling here must also persist to app settings so the
  // Appearance page (and next launch) reflect the same choice.
  const toggleTheme = (): void => {
    const next = isDark ? 'light' : 'dark';
    setThemeMode(next);
    void (async () => {
      try {
        const all = await window.desktop.settings.getAll();
        await window.desktop.settings.set({ ...all, theme: next });
      } catch {
        /* visual theme already applied — persistence is best-effort */
      }
    })();
  };

  const { data: jobs } = useQuery({
    queryKey: ['recording-jobs'],
    queryFn: () => window.desktop.recording.getJobs(),
    refetchInterval: 3000,
  });

  const activeCount = (jobs ?? []).filter((j) => ['recording', 'queued', 'preparing'].includes(j.status)).length;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
      {/* ponytail: search collapses away on narrow windows to keep the
          action icons reachable at any size. */}
      <div className="relative hidden w-full max-w-md md:block">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
        />
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search..."
          aria-label="Search"
          className="w-full pl-8"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-xs text-foreground-muted lg:flex">
          {activeCount > 0 ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-error animate-pulse" aria-hidden="true" />
              {activeCount} active recording{activeCount > 1 ? 's' : ''}
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-foreground-disabled" aria-hidden="true" />
              No active recording
            </>
          )}
        </span>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/plugins')}
          aria-label="Plugins"
          title="Plugins"
        >
          <Puzzle size={16} />
        </Button>

        <NotificationCenter />

        {/* Theme switch: smooth rotate/scale transition between sun and moon */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-sm text-foreground-secondary transition-colors hover:bg-elevated hover:text-foreground"
        >
          <Sun
            size={16}
            className={`absolute transition-all duration-300 ${
              isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
            }`}
          />
          <Moon
            size={16}
            className={`absolute transition-all duration-300 ${
              isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
            }`}
          />
        </button>

        <Button size="sm" onClick={() => navigate('/creators')} aria-label="Add Creator">
          <Plus size={14} />
          <span className="hidden sm:inline">Add Creator</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={16} />
        </Button>
      </div>
    </header>
  );
}
