/**
 * UploadsToolbar — toolbar mirroring the recordings page's toolbar
 * (same segmented-with-counts pattern, quiet search, sort select and filter
 * chips) with upload-specific bits: segmented All / Uploading / Completed /
 * Failed, search across file name · creator · share link, a provider filter
 * with brand dots and a Newest / Oldest / Largest sort. The primary
 * "Upload File" action lives in the section header; this toolbar carries
 * the "Clear history…" kebab and select-all. Scrolls away with the page —
 * nothing stays pinned while scrolling (recordings behavior).
 */
import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Input, MultiSelect, type MultiSelectOption } from '@rekordly/ui';
import { KebabMenu, type KebabItem } from '../../components/kebab-menu';

export type UploadFilterTab = 'all' | 'uploading' | 'completed' | 'failed';
export type UploadSort = 'newest' | 'oldest' | 'largest';

export interface UploadsFilterState {
  tab: UploadFilterTab;
  search: string;
  providers: string[];
  sort: UploadSort;
}

export interface UploadsToolbarProps {
  filters: UploadsFilterState;
  onChange: (patch: Partial<UploadsFilterState>) => void;
  onReset: () => void;
  activeFilterCount: number;
  resultCount: number;
  totalCount: number;
  counts: Record<UploadFilterTab, number>;
  providerOptions: MultiSelectOption[];
  /** Select-all checkbox (only rendered when rows exist). */
  selectAll?: {
    checked: boolean;
    indeterminate?: boolean;
    onChange: (checked: boolean) => void;
    label: string;
  };
  /** "Clear history…" menu items (Clear completed… / Clear failed…). */
  pageMenuItems?: KebabItem[];
  children?: ReactNode;
}

const TAB_LABELS: Record<UploadFilterTab, string> = {
  all: 'All',
  uploading: 'Uploading',
  completed: 'Completed',
  failed: 'Failed',
};

export function UploadsToolbar({
  filters,
  onChange,
  onReset,
  activeFilterCount,
  resultCount,
  totalCount,
  counts,
  providerOptions,
  selectAll,
  pageMenuItems,
  children,
}: UploadsToolbarProps) {
  return (
    <div className="-mx-6 px-6 pb-2.5 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        {/* Segmented status filter (with counts) */}
        <div
          role="tablist"
          aria-label="Filter uploads by status"
          className="flex shrink-0 rounded-md border border-border bg-surface p-0.5"
        >
          {(Object.keys(TAB_LABELS) as UploadFilterTab[]).map((tab) => {
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

        {/* Search: file name · creator · share link */}
        <div className="relative w-52 shrink">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <Input
            id="uploads-search-input"
            placeholder="Search uploads…"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className="pl-8"
          />
        </div>

        {/* Provider filter */}
        <MultiSelect
          className="w-44 shrink-0"
          placeholder="All providers"
          options={providerOptions}
          value={filters.providers}
          onChange={(providers) => onChange({ providers })}
        />

        {/* Sort */}
        <select
          value={filters.sort}
          onChange={(e) => onChange({ sort: e.target.value as UploadSort })}
          aria-label="Sort uploads"
          className="h-9 shrink-0 cursor-pointer rounded-sm border border-border bg-elevated px-2.5 text-sm text-foreground transition-colors duration-150 focus:border-primary focus:outline-none"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="largest">Largest</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
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

          {pageMenuItems !== undefined && pageMenuItems.length > 0 && (
            <KebabMenu items={pageMenuItems} label="Clear history" />
          )}
        </div>
      </div>

      {/* Active filter chips row (matches the other pages' toolbars) */}
      {(activeFilterCount > 0 || children !== undefined) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {filters.search.trim() !== '' && (
            <FilterChip label={`"${filters.search.trim()}"`} onRemove={() => onChange({ search: '' })} />
          )}
          {filters.providers.map((providerId) => {
            const option = providerOptions.find((o) => o.value === providerId);
            return (
              <FilterChip
                key={providerId}
                label={option?.label ?? providerId}
                dot={option?.dot}
                onRemove={() => onChange({ providers: filters.providers.filter((p) => p !== providerId) })}
              />
            );
          })}
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
            {resultCount !== totalCount && <span> of {totalCount}</span>} upload{resultCount === 1 ? '' : 's'}
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
