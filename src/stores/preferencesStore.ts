import { create } from 'zustand';
import {
  loadSidebarCollapsed,
  loadThemePreference,
  saveSidebarCollapsed,
  saveThemePreference,
  type ThemePreference,
} from '@/services/preferences';

export type { ResolvedTheme, ThemePreference } from '@/services/preferences';

/** Interface preferences. UI may write this store directly; it holds no business data. */
export interface PreferencesState {
  readonly theme: ThemePreference;
  readonly sidebarCollapsed: boolean;
  readonly setTheme: (theme: ThemePreference) => void;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
}

export const usePreferences = create<PreferencesState>()((set) => ({
  theme: loadThemePreference(),
  sidebarCollapsed: loadSidebarCollapsed(),
  setTheme: (theme) => {
    saveThemePreference(theme);
    set({ theme });
  },
  setSidebarCollapsed: (sidebarCollapsed) => {
    saveSidebarCollapsed(sidebarCollapsed);
    set({ sidebarCollapsed });
  },
}));
