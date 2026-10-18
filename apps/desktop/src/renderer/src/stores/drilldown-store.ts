import { create } from 'zustand';

/**
 * Cross-page drill-down: analytics sets a date window, then navigates to the
 * library, which consumes it once (ISO date strings, inclusive range).
 * The Recordings page uses the same push pattern with a librarySearch term
 * for its "Open in library" row action.
 */
interface DrilldownState {
  dateFrom?: string;
  dateTo?: string;
  /** One-shot search term the Library should pre-fill, then consume. */
  librarySearch?: string;
  setRange(range: { dateFrom?: string; dateTo?: string }): void;
  setLibrarySearch(search: string | undefined): void;
  clear(): void;
}

export const useDrilldownStore = create<DrilldownState>()((set) => ({
  setRange: (range) => set({ dateFrom: range.dateFrom, dateTo: range.dateTo }),
  setLibrarySearch: (librarySearch) => set({ librarySearch }),
  clear: () => set({ dateFrom: undefined, dateTo: undefined, librarySearch: undefined }),
}));
