import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  setMode(mode: ThemeMode): void;
  toggle(): void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // Dark first (DESIGN.md); light arrives later. Tokens stay dark until then.
      mode: 'dark',
      setMode: (mode) => {
        document.documentElement.dataset.theme = mode;
        set({ mode });
      },
      toggle: () =>
        set((state) => {
          const mode: ThemeMode = state.mode === 'dark' ? 'light' : 'dark';
          document.documentElement.dataset.theme = mode;
          return { mode };
        }),
    }),
    { name: 'Rekordly:theme' },
  ),
);
