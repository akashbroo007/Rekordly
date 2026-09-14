import { create } from 'zustand';

/**
 * Cross-page drill-down: analytics sets a date window, then navigates to the
 * library, which consumes it once (ISO date strings, inclusive range).
 */
interface DrilldownState {
  dateFrom?: string;
  dateTo?: string;
  setRange(range: { dateFrom?: string; dateTo?: string }): void;
  clear(): void;
}

export const useDrilldownStore = create<DrilldownState>()((set) => ({
  setRange: (range) => set({ dateFrom: range.dateFrom, dateTo: range.dateTo }),
  clear: () => set({ dateFrom: undefined, dateTo: undefined }),
}));
