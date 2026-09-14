export type CreatorSortField = 'displayName' | 'username' | 'createdAt' | 'updatedAt';
export type CreatorSortDir = 'asc' | 'desc';

/** ponytail: status chips — 'issues' covers failed/paused/retrying monitoring. */
export type CreatorStatusFilter =
  | 'all'
  | 'live'
  | 'offline'
  | 'autoRecord'
  | 'favorites'
  | 'issues';

export type CreatorView = 'grid' | 'list';

export interface CreatorsFilterState {
  search: string;
  /** pluginIds to include (empty = all sites). */
  platforms: string[];
  status: CreatorStatusFilter;
  /** tag ids to include (empty = all). */
  tagIds: string[];
  sortField: CreatorSortField;
  sortDir: CreatorSortDir;
  view: CreatorView;
}

export const DEFAULT_FILTERS: CreatorsFilterState = {
  search: '',
  platforms: [],
  status: 'all',
  tagIds: [],
  sortField: 'displayName',
  sortDir: 'asc',
  view: 'grid',
};

const STORAGE_KEY = 'rekordly.creators.filters.v1';

export function loadFilters(): CreatorsFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<CreatorsFilterState>;
    return {
      ...DEFAULT_FILTERS,
      ...parsed,
      platforms: Array.isArray(parsed.platforms) ? parsed.platforms : [],
      tagIds: Array.isArray(parsed.tagIds) ? parsed.tagIds : [],
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function saveFilters(state: CreatorsFilterState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — filters simply won't persist */
  }
}

/** Count of active non-default filters, for "Clear all" affordances. */
export function activeFilterCount(state: CreatorsFilterState): number {
  let count = 0;
  if (state.search.trim()) count++;
  if (state.platforms.length > 0) count++;
  if (state.status !== 'all') count++;
  if (state.tagIds.length > 0) count++;
  return count;
}
