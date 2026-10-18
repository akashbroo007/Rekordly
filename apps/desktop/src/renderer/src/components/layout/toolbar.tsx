import { Moon, Plus, Puzzle, Settings, Sun } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@rekordly/ui';
import { RECORDING_ROW_ACTIVE_STATUSES } from '../../pages/recordings/recording-row';
import { useThemeStore } from '../../stores/theme-store';
import { NotificationCenter } from '../notification-center';

export function Toolbar() {
  const navigate = useNavigate();

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

  // ponytail: the top bar count must agree with the Recordings page — share
  // its active-status set instead of a hand-rolled subset.
  const activeCount = (jobs ?? []).filter((j) => RECORDING_ROW_ACTIVE_STATUSES.includes(j.status)).length;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-2 lg:flex">
          {activeCount > 0 ? (
            // ponytail: the pill is the chrome's live heartbeat — prominent
            // border, pulsing dot, and a click lands on the live list. No
            // glow animation: the user explicitly removed those (see
            // index.css) — the 2px border + dot carry the state.
            <button
              type="button"
              onClick={() => navigate('/recordings?filter=active')}
              title={`${activeCount} active recording${activeCount > 1 ? 's' : ''} — watch them live`}
              aria-label={`${activeCount} active recording${activeCount > 1 ? 's' : ''} — open recordings`}
              className="flex transform-gpu cursor-pointer items-center gap-1.5 rounded-md border-2 border-error/60 bg-error/15 px-2.5 py-1 text-xs font-semibold text-error transition-colors duration-150 hover:-translate-y-px hover:bg-error/25"
            >
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-error" />
              </span>
              <span className="tabular-nums">{activeCount}</span>
              active recording{activeCount > 1 ? 's' : ''}
            </button>
          ) : (
            <span
              className="hidden items-center gap-1.5 px-1.5 text-xs text-foreground-disabled"
              title="Nothing is recording right now"
            >
              <span className="h-1.5 w-1.5 rounded-full border border-border bg-transparent" aria-hidden="true" />
              Idle — no active recording
            </span>
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
