/**
 * PluginsToolbar — the page toolbar:
 *   search · segmented filter (All/Enabled/Disabled/Needs setup/Updates,
 *   with counts) · sort (Name/Status/Most used/Last checked) and, on the
 *   right, the list⇄card view toggle plus the "Show developer plugins"
 *   switch. Mirrors the Recordings/Creators toolbar so the pages match.
 */
import { useState, useEffect } from 'react';
import { LayoutGrid, List, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input, Switch } from '@rekordly/ui';

export type PluginsFilterTab = 'all' | 'enabled' | 'disabled' | 'needs-setup' | 'updates' | 'errors';
export type PluginsSort = 'name' | 'status' | 'most-used' | 'last-checked';
export type PluginsView = 'list' | 'grid';

export interface PluginsToolbarState {
  search: string;
  tab: PluginsFilterTab;
  sort: PluginsSort;
  view: PluginsView;
  showDeveloper: boolean;
}

export interface PluginsToolbarProps {
  state: PluginsToolbarState;
  onChange: (patch: Partial<PluginsToolbarState>) => void;
  onReset: () => void;
  /** Per-tab counts over the non-developer plugin pool. */
  counts: Record<PluginsFilterTab, number>;
  visibleCount: number;
  poolCount: number;
  /** Epoch ms of the last page-level update check (null = never). */
  lastCheckedAt: number | null;
  /** Header "Check for updates" pending → the toolbar shows it live. */
  checking: boolean;
}

const TAB_LABELS: Record<PluginsFilterTab, string> = {
  all: 'All',
  enabled: 'Enabled',
  disabled: 'Disabled',
  'needs-setup': 'Needs setup',
  updates: 'Updates',
  errors: 'Errors',
};

/** ponytail: the toolbar shows the five chips the brief specifies; the
 *  "Errors" filter is reachable via the summary strip's errors chip. */
const TOOLBAR_TABS: readonly PluginsFilterTab[] = ['all', 'enabled', 'disabled', 'needs-setup', 'updates'];

export function PluginsToolbar({
  state,
  onChange,
  onReset,
  counts,
  visibleCount,
  poolCount,
  lastCheckedAt,
  checking,
}: PluginsToolbarProps) {
  const filtersActive = state.search.trim() !== '' || state.tab !== 'all';
  return (
    <div className="-mx-6 px-6 pb-2.5 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search (reuses the old haystack: name/id/author/description/capabilities) */}
        <div className="relative w-56 shrink">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted"
          />
          <Input
            id="plugins-search-input"
            placeholder="Search plugins…"
            value={state.search}
            onChange={(event) => onChange({ search: event.target.value })}
            className="pl-8"
          />
        </div>

        {/* Segmented filter chips with counts */}
        <div
          role="tablist"
          aria-label="Filter plugins"
          className="flex shrink-0 rounded-md border border-border bg-surface p-0.5"
        >
          {(TOOLBAR_TABS as PluginsFilterTab[]).map((tab) => {
            const selected = state.tab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChange({ tab })}
                className={`cursor-pointer rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  selected ? 'bg-primary text-white' : 'text-foreground-secondary hover:bg-hover hover:text-foreground'
                }`}
              >
                {TAB_LABELS[tab]}
                <span className={`ml-1.5 tabular-nums ${selected ? 'text-white/70' : 'text-foreground-muted'}`}>
                  {counts[tab] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <select
          value={state.sort}
          onChange={(event) => onChange({ sort: event.target.value as PluginsSort })}
          aria-label="Sort plugins"
          className="h-9 shrink-0 cursor-pointer rounded-sm border border-border bg-elevated px-2.5 text-sm text-foreground transition-colors duration-150 focus:border-primary focus:outline-none"
        >
          <option value="status">Status</option>
          <option value="name">Name</option>
          <option value="most-used">Most used</option>
          <option value="last-checked">Last checked</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          {/* View toggle: compact rows (default) ⇄ card grid */}
          <div
            role="group"
            aria-label="Layout"
            className="flex shrink-0 rounded-md border border-border bg-surface p-0.5"
          >
            <IconToggle
              pressed={state.view === 'list'}
              label="Compact list"
              onClick={() => onChange({ view: 'list' })}
            >
              <List size={14} />
            </IconToggle>
            <IconToggle
              pressed={state.view === 'grid'}
              label="Card grid"
              onClick={() => onChange({ view: 'grid' })}
            >
              <LayoutGrid size={14} />
            </IconToggle>
          </div>

          {/* Developer/example plugins hidden by default */}
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-foreground-secondary">
            <Switch
              checked={state.showDeveloper}
              onCheckedChange={(checked) => onChange({ showDeveloper: checked })}
              aria-label="Show developer plugins"
            />
            Show developer plugins
          </label>
        </div>
      </div>

      {/* Chip row: search chip, clear-all, result count, last-checked stamp */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {state.search.trim() !== '' && (
          <FilterChip label={`"${state.search.trim()}"`} onRemove={() => onChange({ search: '' })} />
        )}
        {state.tab !== 'all' && (
          <FilterChip label={TAB_LABELS[state.tab]} onRemove={() => onChange({ tab: 'all' })} />
        )}
        {filtersActive && (
          <button
            type="button"
            onClick={onReset}
            className="flex cursor-pointer items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-xs text-foreground-muted transition-colors hover:bg-hover hover:text-error"
          >
            <X size={11} /> Clear all
          </button>
        )}
        {(filtersActive || visibleCount !== poolCount) && (
          <span className="ml-1 text-xs text-foreground-muted">
            <span className="font-semibold tabular-nums text-foreground">{visibleCount}</span>
            {visibleCount !== poolCount ? <span> of {poolCount}</span> : null} plugin{visibleCount === 1 ? '' : 's'}
          </span>
        )}

        {/* Last-checked stamp lives next to the header button it belongs to */}
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-foreground-muted">
          {checking && <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" />}
          {lastCheckedAt !== null && (
            <UpdatedAgo lastCheckedAt={lastCheckedAt} prefix="Updates last checked" />
          )}
        </span>
      </div>
    </div>
  );
}

function IconToggle({
  pressed,
  label,
  onClick,
  children,
}: {
  pressed: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="button"
      aria-pressed={pressed}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
        pressed ? 'bg-primary text-white' : 'text-foreground-secondary hover:bg-hover hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-primary/30 bg-primary/10 py-0.5 pl-1.5 pr-1 text-xs font-medium text-foreground">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="cursor-pointer rounded-sm p-0.5 transition-colors hover:bg-primary/20"
      >
        <X size={10} />
      </button>
    </span>
  );
}

/** Keeps "…2m ago" fresh without re-rendering the whole toolbar. */
function UpdatedAgo({ lastCheckedAt, prefix }: { lastCheckedAt: number; prefix: string }) {
  const AGO_START = 60_000;
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), AGO_START);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((Date.now() - lastCheckedAt) / 1000));
  const text =
    seconds < 45
      ? 'just now'
      : seconds < 3600
        ? `${Math.max(1, Math.floor(seconds / 60))}m ago`
        : seconds < 86_400
          ? `${Math.floor(seconds / 3600)}h ago`
          : `${Math.floor(seconds / 86_400)}d ago`;
  return (
    <span title={`Update check ran at ${new Date(lastCheckedAt).toLocaleTimeString()}`}>
      {prefix} {text}
    </span>
  );
}
