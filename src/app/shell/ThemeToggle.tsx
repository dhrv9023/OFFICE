import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/Button';
import { useResolvedTheme } from '@/hooks/useTheme';
import { usePreferences } from '@/stores/preferencesStore';

/** Flips between dark and light. "Follow system" is available in Settings. */
export function ThemeToggle() {
  const theme = useResolvedTheme();
  const setTheme = usePreferences((state) => state.setTheme);
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <IconButton
      icon={theme === 'dark' ? Sun : Moon}
      label={`Switch to ${next} theme`}
      onClick={() => {
        setTheme(next);
      }}
    />
  );
}
