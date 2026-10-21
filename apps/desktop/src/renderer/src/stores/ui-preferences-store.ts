/**
 * UI preference store — cross-page presentation preferences.
 *
 * Currently holds the plugins page's "Show developer plugins" toggle so the
 * Add Creator plugin picker (and any other picker listing plugins) can hide
 * developer/example platforms ("Mock Platform") behind the same switch, per
 * the shared picker spec. Purely presentational — no data or behavior under
 * it changes.
 */
import { create } from 'zustand';

interface UiPreferencesState {
  /** Mirrors the Plugins toolbar switch (default OFF, not persisted). */
  showDeveloperPlugins: boolean;
  setShowDeveloperPlugins: (value: boolean) => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>()((set) => ({
  showDeveloperPlugins: false,
  setShowDeveloperPlugins: (value) => set({ showDeveloperPlugins: value }),
}));
