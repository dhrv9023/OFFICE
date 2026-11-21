import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadSidebarCollapsed,
  loadThemePreference,
  resolveTheme,
  saveSidebarCollapsed,
  saveThemePreference,
} from './preferences';

function fakeLocalStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preferences', () => {
  it('defaults to the dark theme and an expanded sidebar', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage());
    expect(loadThemePreference()).toBe('dark');
    expect(loadSidebarCollapsed()).toBe(false);
  });

  it('round-trips saved values and ignores unknown ones', () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal('localStorage', storage);
    saveThemePreference('light');
    saveSidebarCollapsed(true);
    expect(loadThemePreference()).toBe('light');
    expect(loadSidebarCollapsed()).toBe(true);

    storage.setItem('project-hq:theme', 'neon');
    expect(loadThemePreference()).toBe('dark');
  });

  it('keeps working when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => {
      saveThemePreference('light');
    }).not.toThrow();
    expect(loadThemePreference()).toBe('dark');
  });

  it('resolves "system" from the device setting', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
  });
});
