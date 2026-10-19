import { create } from 'zustand';
import type { DownloadQueueItemDto } from '@rekordly/shared/contracts';

/**
 * Cross-page drill-down: analytics sets a date window, then navigates to the
 * library, which consumes it once (ISO date strings, inclusive range).
 * The Recordings page uses the same push pattern with a librarySearch term
 * for its "Open in library" row action, and the Downloads page pushes a
 * playDownload item so the Library lands on its Downloads tab and starts
 * playing the handed-over file in the built-in player.
 */
interface DrilldownState {
  dateFrom?: string;
  dateTo?: string;
  /** One-shot search term the Library should pre-fill, then consume. */
  librarySearch?: string;
  /** One-shot push from the Downloads page "Open in library" row action. */
  playDownload?: DownloadQueueItemDto;
  setRange(range: { dateFrom?: string; dateTo?: string }): void;
  setLibrarySearch(search: string | undefined): void;
  setPlayDownload(item: DownloadQueueItemDto | undefined): void;
  clear(): void;
}

export const useDrilldownStore = create<DrilldownState>()((set) => ({
  setRange: (range) => set({ dateFrom: range.dateFrom, dateTo: range.dateTo }),
  setLibrarySearch: (librarySearch) => set({ librarySearch }),
  setPlayDownload: (playDownload) => set({ playDownload }),
  clear: () => set({ dateFrom: undefined, dateTo: undefined, librarySearch: undefined, playDownload: undefined }),
}));
