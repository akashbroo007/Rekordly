/**
 * RecordingsToolbar — page toolbar (scrolls with the content):
 * segmented status filter (with counts) · search · creator filter · platform
 * filter · date range · sort, plus (right) select-all, "Retry All Failed"
 * and the page-level " … " menu that holds "Clear All Failed".
 *
 * Mirrors the Creators page FilterBar so both pages feel identical.
 */
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Input, MultiSelect, type MultiSelectOption } from '@rekordly/ui';
import { KebabMenu, type KebabItem } from '../../components/kebab-menu';
import { PrivacyModeButton } from '../../components/privacy-mode';

export type RecordingsFilterTab = 'all' | 'active' | 'completed' | 'failed';
export type RecordingsSort = 'newest' | 'oldest' | 'longest' | 'largest';

export interface RecordingsFilterState {
  tab: RecordingsFilterTab;
  search: string;
  creatorIds: string[];
  platforms: string[];
  /** ISO yyyy-mm-dd (inclusive), '' = unset. */
  from: string;
  to: string;
  sort: RecordingsSort;
}

export interface RecordingsToolbarProps {
  filters: RecordingsFilterState;
  onChange: (patch: Partial<RecordingsFilterState>) => void;
  onReset: () => void;
  activeFilterCount: number;
  resultCount: number;
  counts: Record<RecordingsFilterTab, number>;
  creatorOptions: MultiSelectOption[];
  platformOptions: MultiSelectOption[];
  /** Select-all checkbox (only rendered when rows exist). */
  selectAll?: {
    checked: boolean;
    indeterminate?: boolean;
    onChange: (checked: boolean) => void;
    label: string;
  };
  /** "Retry all failed" — rendered only when failed count > 0. */
  onRetryAllFailed?: () => void;
  retryAllFailedLoading?: boolean;
  /** Extra "…" menu items (holds "Clear All Failed"). */
  pageMenuItems?: KebabItem[];
  /** Privacy mode — the shared global toggle (blur thumbnails + titles). */
  privacy: {
    on: boolean;
    onToggle: () => void;
  };
  children?: ReactNode;
}

const TAB_LABELS: Record<RecordingsFilterTab, string> = {
  all: 'All',
  active: 'Active',
  completed: 'Completed',
  failed: 'Failed',
};

export function RecordingsToolbar({
  filters,
  onChange,
  onReset,
  activeFilterCount,
  resultCount,
  counts,
  creatorOptions,
  platformOptions,
  selectAll,
  onRetryAllFailed,
  retryAllFailedLoading,
  pageMenuItems,
  privacy,
  children,
}: RecordingsToolbarProps) {
  const hasDateRange = filters.from !== '' || filters.to !== '';
  return (
    <div className="-mx-6 px-6 pb-2.5 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        {/* Segmented status filter (with counts) */}
        <div
          role="tablist"
          aria-label="Filter recordings by status"
          className="flex shrink-0 rounded-md border border-border bg-surface p-0.5"
        >
          {(Object.keys(TAB_LABELS) as RecordingsFilterTab[]).map((tab) => {
            const selected = filters.tab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChange({ tab })}
                className={`cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  selected ? 'bg-primary text-white' : 'text-foreground-secondary hover:bg-hover hover:text-foreground'
                }`}
              >
                {TAB_LABELS[tab]}
                <span className={`ml-1.5 tabular-nums ${selected ? 'text-white/70' : 'text-foreground-muted'}`}>
                  {counts[tab]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative w-52 shrink">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <Input
            id="recordings-search-input"
            placeholder="Search recordings…"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className="pl-8"
          />
        </div>

        {/* Creator filter */}
        <MultiSelect
          className="w-44 shrink-0"
          placeholder="All creators"
          options={creatorOptions}
          value={filters.creatorIds}
          onChange={(creatorIds) => onChange({ creatorIds })}
        />

        {/* Platform filter */}
        <MultiSelect
          className="w-40 shrink-0"
          icon={<SlidersHorizontal size={13} className="text-foreground-muted" />}
          placeholder="All platforms"
          options={platformOptions}
          value={filters.platforms}
          onChange={(platforms) => onChange({ platforms })}
        />

        {/* Date range */}
        <div
          className={`flex h-9 shrink-0 items-center gap-1 rounded-sm border px-2 transition-colors ${hasDateRange ? 'border-primary/50' : 'border-border'} bg-elevated`}
        >
          <input
            type="date"
            aria-label="Recorded from"
            value={filters.from}
            onChange={(e) => onChange({ from: e.target.value })}
            className="w-[7rem] bg-transparent text-xs text-foreground [color-scheme:dark] focus:outline-none"
          />
          <span aria-hidden="true" className="text-foreground-disabled">→</span>
          <input
            type="date"
            aria-label="Recorded to"
            value={filters.to}
            onChange={(e) => onChange({ to: e.target.value })}
            className="w-[7rem] bg-transparent text-xs text-foreground [color-scheme:dark] focus:outline-none"
          />
          {hasDateRange && (
            <button
              type="button"
              aria-label="Clear date range"
              title="Clear date range"
              onClick={() => onChange({ from: '', to: '' })}
              className="ml-0.5 rounded-sm p-0.5 text-foreground-muted transition-colors hover:bg-hover hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Sort */}
        <select
          value={filters.sort}
          onChange={(e) => onChange({ sort: e.target.value as RecordingsSort })}
          aria-label="Sort recordings"
          className="h-9 shrink-0 cursor-pointer rounded-sm border border-border bg-elevated px-2.5 text-sm text-foreground transition-colors duration-150 focus:border-primary focus:outline-none"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="longest">Longest</option>
          <option value="largest">Largest</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          {/* Privacy mode — blur thumbnails + titles for screen sharing */}
          <PrivacyModeButton on={privacy.on} onToggle={privacy.onToggle} />

          {selectAll !== undefined && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground-secondary">
              <input
                type="checkbox"
                checked={selectAll.checked}
                ref={(node) => {
                  if (node !== null) node.indeterminate = selectAll.indeterminate === true;
                }}
                onChange={(e) => selectAll.onChange(e.target.checked)}
                className="h-[15px] w-[15px] cursor-pointer accent-[var(--color-primary)]"
                aria-label={selectAll.label}
              />
              Select all
            </label>
          )}

          {onRetryAllFailed !== undefined && (
            <Button variant="secondary" size="sm" loading={retryAllFailedLoading} onClick={onRetryAllFailed}>
              Retry All Failed
            </Button>
          )}

          {pageMenuItems !== undefined && pageMenuItems.length > 0 && <KebabMenu items={pageMenuItems} label="Page actions" />}
        </div>
      </div>

      {/* Active filter chips row (matches the Creators FilterBar behavior) */}
      {(activeFilterCount > 0 || children !== undefined) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {filters.search.trim() !== '' && (
            <FilterChip label={`"${filters.search.trim()}"`} onRemove={() => onChange({ search: '' })} />
          )}
          {filters.creatorIds.map((creatorId) => {
            const option = creatorOptions.find((o) => o.value === creatorId);
            return (
              <FilterChip
                key={creatorId}
                label={option?.label ?? creatorId}
                dot={option?.dot}
                onRemove={() => onChange({ creatorIds: filters.creatorIds.filter((c) => c !== creatorId) })}
              />
            );
          })}
          {filters.platforms.map((pluginId) => {
            const option = platformOptions.find((o) => o.value === pluginId);
            return (
              <FilterChip
                key={pluginId}
                label={option?.label ?? pluginId}
                dot={option?.dot}
                onRemove={() => onChange({ platforms: filters.platforms.filter((p) => p !== pluginId) })}
              />
            );
          })}
          {hasDateRange && <FilterChip label="Date range" onRemove={() => onChange({ from: '', to: '' })} />}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="flex cursor-pointer items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-xs text-foreground-muted transition-colors hover:bg-hover hover:text-error"
            >
              <X size={11} /> Clear all
            </button>
          )}
          <span className="ml-1 text-xs text-foreground-muted">
            <span className="font-semibold tabular-nums text-foreground">{resultCount}</span>
            {resultCount !== counts.all && <span> of {counts.all}</span>} recording{resultCount === 1 ? '' : 's'}
          </span>
          {children}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove, dot }: { label: string; onRemove: () => void; dot?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-primary/30 bg-primary/10 py-0.5 pl-1.5 pr-1 text-xs font-medium text-foreground">
      {dot !== undefined && (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
      )}
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
