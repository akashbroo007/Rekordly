/**
 * DownloadsToolbar — the page's sticky toolbar: quiet search (title · site),
 * a source filter with brand dots, Newest/Oldest/Largest/Progress sort,
 * Privacy mode and select-all on the right, plus the active-filter chips
 * row with a running count. Unlike the other pages there is NO second
 * segmented status row here — the summary strip above IS the status filter
 * (kept in one place on purpose; nothing stays floating on scroll except
 * this toolbar, so filtering survives long day-grouped histories).
 */
import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Input, MultiSelect, type MultiSelectOption } from '@rekordly/ui';
import { PrivacyModeButton } from '../../components/privacy-mode';

export type DownloadFilterTab =
  | 'all'
  | 'downloading'
  | 'queued'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type DownloadSort = 'newest' | 'oldest' | 'largest' | 'progress';

export interface DownloadsFilterState {
  tab: DownloadFilterTab;
  search: string;
  /** site ids (second-level hosts / pluginIds). */
  sites: string[];
  sort: DownloadSort;
}

export interface DownloadsToolbarProps {
  filters: DownloadsFilterState;
  onChange: (patch: Partial<DownloadsFilterState>) => void;
  onReset: () => void;
  activeFilterCount: number;
  resultCount: number;
  totalCount: number;
  siteOptions: MultiSelectOption[];
  selectAll?: {
    checked: boolean;
    indeterminate?: boolean;
    onChange: (checked: boolean) => void;
    label: string;
  };
  privacy: {
    on: boolean;
    onToggle: () => void;
  };
  children?: ReactNode;
}

export function DownloadsToolbar({
  filters,
  onChange,
  onReset,
  activeFilterCount,
  resultCount,
  totalCount,
  siteOptions,
  selectAll,
  privacy,
  children,
}: DownloadsToolbarProps) {
  return (
    <div className="sticky top-0 z-30 -mx-6 bg-canvas/95 px-6 py-2.5 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search: title · site */}
        <div className="relative w-52 shrink">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <Input
            id="downloads-search-input"
            placeholder="Search title or site…"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className="pl-8"
          />
        </div>

        {/* Source filter */}
        <MultiSelect
          className="w-44 shrink-0"
          placeholder="All sites"
          options={siteOptions}
          value={filters.sites}
          onChange={(sites) => onChange({ sites })}
        />

        {/* Sort */}
        <select
          value={filters.sort}
          onChange={(e) => onChange({ sort: e.target.value as DownloadSort })}
          aria-label="Sort downloads"
          className="h-9 shrink-0 cursor-pointer rounded-sm border border-border bg-elevated px-2.5 text-sm text-foreground transition-colors duration-150 focus:border-primary focus:outline-none"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="largest">Largest</option>
          <option value="progress">Progress</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          {/* Privacy mode — blur thumbnails + titles for screen sharing */}
          <PrivacyModeButton on={privacy.on} onToggle={privacy.onToggle} />

          {selectAll !== undefined && (
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-foreground-secondary">
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
        </div>
      </div>

      {/* Active filter chips row */}
      {(activeFilterCount > 0 || children !== undefined) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {filters.search.trim() !== '' && (
            <FilterChip label={`"${filters.search.trim()}"`} onRemove={() => onChange({ search: '' })} />
          )}
          {filters.sites.map((siteId) => {
            const option = siteOptions.find((o) => o.value === siteId);
            return (
              <FilterChip
                key={siteId}
                label={option?.label ?? siteId}
                dot={option?.dot}
                onRemove={() => onChange({ sites: filters.sites.filter((s) => s !== siteId) })}
              />
            );
          })}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="flex cursor-pointer items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-sm text-foreground-muted transition-colors hover:bg-hover hover:text-error"
            >
              <X size={11} /> Clear all
            </button>
          )}
          <span className="ml-1 text-sm text-foreground-muted">
            <span className="font-semibold tabular-nums text-foreground">{resultCount}</span>
            {resultCount !== totalCount && <span> of {totalCount}</span>} download{resultCount === 1 ? '' : 's'}
          </span>
          {children}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove, dot }: { label: string; onRemove: () => void; dot?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-primary/30 bg-primary/10 py-0.5 pl-1.5 pr-1 text-sm font-medium text-foreground">
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
