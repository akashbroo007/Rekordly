import { useQuery } from '@tanstack/react-query';
import {
  FolderInput,
  LayoutDashboard,
  Library,
  Logs,
  Puzzle,
  Search,
  Settings,
  Users,
  Video,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@rekordly/ui';

interface SearchResult {
  id: string;
  label: string;
  category: string;
  icon: typeof Users;
  action: () => void;
}

const COMMANDS: { id: string; label: string; icon: typeof Users; action: string }[] = [
  { id: 'add-creator', label: 'Add Creator', icon: Users, action: '/creators' },
  { id: 'install-plugin', label: 'Install Plugin', icon: FolderInput, action: '/plugins' },
  { id: 'open-library', label: 'Open Library', icon: Library, action: '/library' },
  { id: 'plugin-manager', label: 'Plugin Manager', icon: Puzzle, action: '/plugins' },
  { id: 'view-logs', label: 'View Logs', icon: Logs, action: '/logs' },
  { id: 'settings', label: 'Settings', icon: Settings, action: '/settings' },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, action: '/' },
  { id: 'recordings', label: 'Recordings', icon: Video, action: '/recordings' },
  { id: 'creators', label: 'Creators', icon: Users, action: '/creators' },
  { id: 'analytics', label: 'Analytics', icon: LayoutDashboard, action: '/analytics' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const { data: creators } = useQuery({
    queryKey: ['creators'],
    queryFn: () => window.desktop.creators.list(),
    enabled: open,
  });

  const { data: plugins } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => window.desktop.plugins.list(),
    enabled: open,
  });

  const q = query.toLowerCase().trim();

  const results: SearchResult[] = [];

  if (q.length > 0) {
    for (const cmd of COMMANDS) {
      if (cmd.label.toLowerCase().includes(q)) {
        results.push({
          id: `cmd-${cmd.id}`,
          label: cmd.label,
          category: 'Commands',
          icon: cmd.icon,
          action: () => { navigate(cmd.action); setOpen(false); },
        });
      }
    }

    for (const c of (creators ?? []).slice(0, 20)) {
      if (c.displayName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q)) {
        results.push({
          id: `creator-${c.id}`,
          label: c.displayName,
          category: 'Creators',
          icon: Users,
          action: () => { navigate('/creators'); setOpen(false); },
        });
      }
    }

    for (const p of (plugins ?? []).slice(0, 10)) {
      if (p.name.toLowerCase().includes(q)) {
        results.push({
          id: `plugin-${p.id}`,
          label: p.name,
          category: 'Plugins',
          icon: Puzzle,
          action: () => { navigate('/plugins'); setOpen(false); },
        });
      }
    }
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="" className="max-w-lg p-0">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search size={16} className="shrink-0 text-foreground-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search creators, plugins, commands..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-disabled"
          />
          <kbd className="rounded-sm border border-border bg-elevated px-1.5 py-0.5 text-[10px] text-foreground-muted">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {q.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-foreground-muted">
              Type to search creators, plugins, or commands.
            </p>
          ) : results.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-foreground-muted">
              No results found.
            </p>
          ) : (
            <ul>
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={result.action}
                    className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-hover"
                  >
                    <result.icon size={14} className="shrink-0 text-foreground-muted" />
                    <span className="flex-1 text-foreground">{result.label}</span>
                    <span className="text-[10px] text-foreground-muted">{result.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
