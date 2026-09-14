import { LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react';
import type { CreatorTagDto } from '@rekordly/shared';
import { Button, Input, MultiSelect, type MultiSelectOption } from '@rekordly/ui';
import type {
  CreatorsFilterState,
  CreatorSortDir,
  CreatorSortField,
  CreatorStatusFilter,
} from './filter-model';

export interface PlatformFilterInfo {
  pluginId: string;
  name: string;
  count: number;
  liveCount: number;
}

export interface TagFilterInfo extends CreatorTagDto {
  count: number;
}

export interface StatusChipInfo {
  key: CreatorStatusFilter;
  label: string;
  count?: number;
}

export interface FilterBarProps {
  filters: CreatorsFilterState;
  onChange: (patch: Partial<CreatorsFilterState>) => void;
  onReset: () => void;
  activeCount: number;
  resultCount: number;
  totalCount: number;
  platforms: PlatformFilterInfo[];
  tags: TagFilterInfo[];
  statusChips: StatusChipInfo[];
}

const STATUS_CHIP_BASE =
  'rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors duration-150';

export function FilterBar({
  filters,
  onChange,
  onReset,
  activeCount,
  resultCount,
  totalCount,
  platforms,
  tags,
  statusChips,
}: FilterBarProps) {
  const platformOptions: MultiSelectOption[] = platforms.map((p) => ({
    value: p.pluginId,
    label: p.name,
    count: p.count,
    live: p.liveCount > 0,
  }));

  const tagOptions: MultiSelectOption[] = tags.map((t) => ({
    value: t.id,
    label: t.name,
    count: t.count,
    dot: t.color ?? undefined,
  }));

  const hasPlatformFilters = filters.platforms.length > 0;
  const hasTagFilters = filters.tagIds.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative w-full max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
          <Input
            id="creators-search-input"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search creators...  ( / )"
            className="pl-8"
          />
        </div>

        {/* Site / platform dynamic filter */}
        <MultiSelect
          className="w-40"
          icon={<SlidersHorizontal size={13} className="text-foreground-muted" />}
          placeholder="All sites"
          options={platformOptions}
          value={filters.platforms}
          onChange={(platforms) => onChange({ platforms })}
        />

        {/* Tags filter */}
        <MultiSelect
          className="w-36"
          placeholder="All tags"
          options={tagOptions}
          value={filters.tagIds}
          onChange={(tagIds) => onChange({ tagIds })}
        />

        {/* Status chips */}
        <div className="flex items-center gap-1">
          {statusChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange({ status: chip.key })}
              className={`${STATUS_CHIP_BASE} ${
                filters.status === chip.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-elevated text-foreground-secondary hover:bg-hover hover:text-foreground'
              }`}
            >
              {chip.label}
              {chip.count !== undefined && (
                <span className="ml-1 tabular-nums opacity-70">{chip.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Sort */}
          <select
            value={filters.sortField}
            onChange={(e) => onChange({ sortField: e.target.value as CreatorSortField })}
            aria-label="Sort creators by"
            className="h-9 rounded-sm border border-border bg-elevated px-2.5 text-sm text-foreground transition-colors duration-150 focus:border-primary focus:outline-none"
          >
            <option value="displayName">Name</option>
            <option value="username">Username</option>
            <option value="createdAt">Date Added</option>
            <option value="updatedAt">Last Updated</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ sortDir: (filters.sortDir === 'asc' ? 'desc' : 'asc') as CreatorSortDir })}
            title="Toggle sort direction"
          >
            {filters.sortDir === 'asc' ? 'A-Z' : 'Z-A'}
          </Button>

          {/* Grid/list view toggle */}
          <div className="flex items-center overflow-hidden rounded-sm border border-border">
            <button
              type="button"
              onClick={() => onChange({ view: 'grid' })}
              aria-label="Grid view"
              aria-pressed={filters.view === 'grid'}
              className={`flex h-9 w-8 items-center justify-center transition-colors ${
                filters.view === 'grid' ? 'bg-primary/15 text-primary' : 'text-foreground-muted hover:bg-hover'
              }`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => onChange({ view: 'list' })}
              aria-label="List view"
              aria-pressed={filters.view === 'list'}
              className={`flex h-9 w-8 items-center justify-center transition-colors ${
                filters.view === 'list' ? 'bg-primary/15 text-primary' : 'text-foreground-muted hover:bg-hover'
              }`}
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Active filter chips row */}
      {(activeCount > 0 || filters.sortDir !== 'asc') && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.search.trim() && (
            <FilterChip label={`"${filters.search.trim()}"`} onRemove={() => onChange({ search: '' })} />
          )}
          {hasPlatformFilters &&
            filters.platforms.map((pluginId) => {
              const platform = platforms.find((p) => p.pluginId === pluginId);
              return (
                <FilterChip
                  key={pluginId}
                  label={platform?.name ?? pluginId}
                  dot="bg-info"
                  onRemove={() =>
                    onChange({ platforms: filters.platforms.filter((p) => p !== pluginId) })
                  }
                />
              );
            })}
          {hasTagFilters &&
            filters.tagIds.map((tagId) => {
              const tag = tags.find((t) => t.id === tagId);
              return (
                <FilterChip
                  key={tagId}
                  label={tag?.name ?? 'Tag'}
                  dot="bg-primary"
                  onRemove={() => onChange({ tagIds: filters.tagIds.filter((t) => t !== tagId) })}
                />
              );
            })}
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[11px] text-foreground-muted transition-colors hover:bg-hover hover:text-error"
          >
            <X size={10} /> Clear all
          </button>
          <span className="ml-1 text-xs text-foreground-muted">
            <span className="font-semibold tabular-nums text-foreground">{resultCount}</span>
            {resultCount !== totalCount && <span> of {totalCount}</span>} creators
          </span>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
  dot,
}: {
  label: string;
  onRemove: () => void;
  dot?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-primary/30 bg-primary/10 py-0.5 pl-1.5 pr-1 text-[11px] font-medium text-primary">
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="rounded-sm p-0.5 transition-colors hover:bg-primary/20"
      >
        <X size={9} />
      </button>
    </span>
  );
}
