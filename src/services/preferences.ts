/**
 * Per-browser interface preferences (theme, sidebar). These are not workspace data:
 * they are never exported, imported or reset with the workspace, and losing them is
 * harmless, so plain localStorage is enough. Every access tolerates storage being
 * unavailable (private mode, blocked site data).
 */
export const THEME_PREFERENCES = ['dark', 'light', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'dark' | 'light';

const KEYS = {
  theme: 'project-hq:theme',
  sidebarCollapsed: 'project-hq:sidebar-collapsed',
  officeIntroSeen: 'project-hq:office-intro-seen',
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences are best-effort.
  }
}

export function loadThemePreference(): ThemePreference {
  const stored = read(KEYS.theme);
  return THEME_PREFERENCES.find((theme) => theme === stored) ?? 'dark';
}

export function saveThemePreference(theme: ThemePreference): void {
  write(KEYS.theme, theme);
}

export function loadSidebarCollapsed(): boolean {
  return read(KEYS.sidebarCollapsed) === 'true';
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  write(KEYS.sidebarCollapsed, String(collapsed));
}

export function systemPrefersLight(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
}

export function resolveTheme(preference: ThemePreference, prefersLight: boolean): ResolvedTheme {
  if (preference === 'system') return prefersLight ? 'light' : 'dark';
  return preference;
}

/** Whether the office's first-visit instructions have been dismissed on this device. */
export function loadOfficeIntroSeen(): boolean {
  return read(KEYS.officeIntroSeen) === 'true';
}

export function saveOfficeIntroSeen(): void {
  write(KEYS.officeIntroSeen, 'true');
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
