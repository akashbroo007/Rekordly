/**
 * Command palette — centered "Search or jump to..." surface (max 560px).
 *
 * Opens from the top-bar SearchTrigger or Ctrl+K. Suggestions come purely
 * from data the app already exposes: every page (Pages), the four quick
 * actions (Actions), creators by name/username (creators.list) and library
 * items by title (the existing library.search — recordings have no search
 * API of their own, so that source is left out entirely; nothing new was
 * indexed or added server-side).
 *
 * Interaction: arrow keys + Enter to run, Home/End, Esc to close, grouped
 * sentence-case sections, "No results" empty state. ONE-SHOT 150ms
 * dialog fade — no looping animation.
 */
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CloudUpload,
  Download,
  Download as DownloadIcon,
  Film,
  FolderInput,
  LayoutDashboard,
  Library,
  Puzzle,
  ScrollText,
  Search,
  Settings,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@rekordly/ui';
import { AddCreatorDialog } from '../pages/creators/dialogs';
import { AddDownloadDialog } from '../pages/downloads/add-download-dialog';
import { usePluginInstallAction } from './top-bar/quick-actions';

const PALETTE_EVENT = 'rekordly:command-palette';

/** Bridges non-keyboard triggers (the top-bar SearchTrigger) to the palette. */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

interface PaletteItem {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void;
}

interface PaletteSection {
  id: string;
  label: string;
  items: PaletteItem[];
}

const PAGES: { id: string; label: string; path: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { id: 'creators', label: 'Creators', path: '/creators', icon: Users },
  { id: 'recordings', label: 'Recordings', path: '/recordings', icon: Video },
  { id: 'library', label: 'Library', path: '/library', icon: Library },
  { id: 'downloads', label: 'Downloads', path: '/downloads', icon: Download },
  { id: 'uploads', label: 'Uploads', path: '/uploads', icon: CloudUpload },
  { id: 'plugins', label: 'Plugins', path: '/plugins', icon: Puzzle },
  { id: 'analytics', label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { id: 'logs', label: 'Logs', path: '/logs', icon: ScrollText },
  { id: 'settings', label: 'Settings', path: '/settings', icon: Settings },
];

export function CommandPalette() {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);

  // --- Quick action dialogs (same shared dialogs the "+ New" menu mounts) ---
  const [addCreatorOpen, setAddCreatorOpen] = useState(false);
  const [addDownloadOpen, setAddDownloadOpen] = useState(false);

  const installPlugin = usePluginInstallAction();

  // Ctrl+K toggles the palette (kept from the previous palette); a click on
  // the top-bar search trigger arrives as a window event.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const openIt = (): void => setOpen(true);
    window.addEventListener(PALETTE_EVENT, openIt);
    return () => window.removeEventListener(PALETTE_EVENT, openIt);
  }, []);

  // Reset the query each time the palette opens and focus the input.
  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Ponytail-style debounce so library.search runs on settled input only.
  const [bounced, setBounced] = useState('');
  useEffect(() => {
    if (!open) {
      setBounced('');
      return undefined;
    }
    const id = window.setTimeout(() => setBounced(query.trim()), 150);
    return () => window.clearTimeout(id);
  }, [query, open]);

  // --- Data (all existing sources) ------------------------------------------
  const { data: creators } = useQuery({
    queryKey: ['creators'],
    queryFn: () => window.desktop.creators.list(),
    enabled: open,
  });

  const { data: libraryResults } = useQuery({
    queryKey: ['command-palette-library', bounced],
    queryFn: () =>
      window.desktop.library.search(
        { search: bounced },
        { field: 'title', direction: 'asc' },
        0,
        8,
      ),
    enabled: open && bounced.length > 0,
  });

  // --- Sections --------------------------------------------------------------
  const sections: PaletteSection[] = useMemo(() => {
    const q = bounced.toLowerCase();

    const run = (path: string): void => {
      setOpen(false);
      navigate(path);
    };

    const pages = PAGES.filter((page) => q === '' || page.label.toLowerCase().includes(q)).map((page) => ({
      id: `page-${page.id}`,
      label: page.label,
      icon: page.icon,
      run: () => run(page.path),
    }));

    const actions: PaletteItem[] = [
      { id: 'action-add-creator', label: 'Add Creator', icon: Users, run: () => { setOpen(false); setAddCreatorOpen(true); } },
      { id: 'action-add-download', label: 'Add Download', icon: DownloadIcon, run: () => { setOpen(false); setAddDownloadOpen(true); } },
      { id: 'action-upload-file', label: 'Upload file', icon: CloudUpload, run: () => run('/uploads') },
      { id: 'action-install-plugin', label: 'Install plugin', icon: FolderInput, run: () => { setOpen(false); installPlugin(); } },
    ].filter((action) => q === '' || action.label.toLowerCase().includes(q));

    const creatorItems: PaletteItem[] =
      q === ''
        ? []
        : (creators ?? [])
            .filter(
              (c) =>
                c.displayName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q),
            )
            .slice(0, 8)
            .map((c) => ({
              id: `creator-${c.id}`,
              label: c.displayName,
              icon: Users,
              run: () => run('/creators'),
            }));

    const libraryItems: PaletteItem[] =
      q === ''
        ? []
        : (libraryResults?.recordings ?? []).slice(0, 8).map((recording) => ({
            id: `library-${recording.id}`,
            label: recording.title,
            icon: Film,
            run: () => run('/library'),
          }));

    const built: PaletteSection[] = [];
    if (q === '' || pages.length > 0) {
      built.push({ id: 'pages', label: 'Pages', items: pages });
    }
    if (q === '' || actions.length > 0) {
      built.push({ id: 'actions', label: 'Actions', items: actions });
    }
    if (creatorItems.length > 0) {
      built.push({ id: 'creators', label: 'Creators', items: creatorItems });
    }
    if (libraryItems.length > 0) {
      built.push({ id: 'library', label: 'Library', items: libraryItems });
    }
    return built;
  }, [bounced, creators, libraryResults, navigate, installPlugin]);

  const flatItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  // Keep the active row in range and visible as results change.
  useEffect(() => {
    setActiveIndex((current) => (flatItems.length === 0 ? 0 : Math.min(current, flatItems.length - 1)));
  }, [flatItems.length]);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const runItem = useCallback(
    (item: PaletteItem | undefined): void => {
      if (item === undefined) return;
      item.run();
    },
    [],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((current) => (flatItems.length === 0 ? 0 : (current + 1) % flatItems.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(
          (current) => (flatItems.length === 0 ? 0 : (current - 1 + flatItems.length) % flatItems.length),
        );
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setActiveIndex(Math.max(0, flatItems.length - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        runItem(flatItems[activeIndex]);
      }
    },
    [activeIndex, flatItems, runItem],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="" className="max-w-[560px]! p-0">
          <div className="flex items-center gap-3 border-b border-border py-3 pl-4 pr-11">
            <Search size={16} className="shrink-0 text-foreground-muted" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search or jump to..."
              aria-label="Search or jump to..."
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-disabled"
            />
            <kbd
              aria-hidden="true"
              className="shrink-0 rounded-sm border border-border bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-foreground-muted"
            >
              ESC
            </kbd>
          </div>
          <div className="max-h-[400px] overflow-y-auto p-1">
            {flatItems.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-foreground-muted">No results</p>
            ) : (
              <div role="listbox" aria-label="Search results">
                {sections.map((section) => (
                  <div key={section.id}>
                    <p className="px-2.5 pb-1 pt-2 text-xs font-medium text-foreground-muted">
                      {section.label}
                    </p>
                    {section.items.map((item) => {
                      const flatIndex = flatItems.indexOf(item);
                      const active = flatIndex === activeIndex;
                      return (
                        <button
                          key={item.id}
                          ref={active ? activeRowRef : undefined}
                          type="button"
                          role="option"
                          aria-selected={active}
                          tabIndex={-1}
                          onClick={() => item.run()}
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          className={`flex h-9 w-full select-none items-center gap-2.5 rounded-[6px] px-2.5 text-left text-sm ${
                            active ? 'bg-white/[0.06] text-foreground' : 'text-foreground-secondary'
                          } transition-colors duration-100`}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                            <item.icon size={14} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddCreatorDialog open={addCreatorOpen} onOpenChange={setAddCreatorOpen} />
      <AddDownloadDialog open={addDownloadOpen} onOpenChange={setAddDownloadOpen} />
    </>
  );
}
