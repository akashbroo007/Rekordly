import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  collapsed: boolean;
  setCollapsed(collapsed: boolean): void;
  toggle(): void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      setCollapsed: (collapsed) => set({ collapsed }),
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
    }),
    { name: 'Rekordly:sidebar' },
  ),
);
