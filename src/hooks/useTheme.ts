import { useEffect, useSyncExternalStore } from 'react';
import { resolveTheme, systemPrefersLight, type ResolvedTheme } from '@/services/preferences';
import { usePreferences } from '@/stores/preferencesStore';

const QUERY = '(prefers-color-scheme: light)';

function subscribeToSystemTheme(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const media = matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => {
    media.removeEventListener('change', onChange);
  };
}

/** The theme actually in effect, following the OS when the preference is "system". */
export function useResolvedTheme(): ResolvedTheme {
  const preference = usePreferences((state) => state.theme);
  const prefersLight = useSyncExternalStore(
    subscribeToSystemTheme,
    systemPrefersLight,
    () => false,
  );
  return resolveTheme(preference, prefersLight);
}

/** Keeps `<html data-theme>` in step with the preference. Mount once, at the root. */
export function useApplyTheme(): void {
  const theme = useResolvedTheme();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
