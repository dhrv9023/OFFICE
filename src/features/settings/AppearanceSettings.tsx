import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { cn } from '@/components/cn';
import { useResolvedTheme } from '@/hooks/useTheme';
import { usePreferences, type ThemePreference } from '@/stores/preferencesStore';

const OPTIONS: readonly {
  value: ThemePreference;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { value: 'dark', label: 'Dark', description: 'Easy on the eyes. The default.', icon: Moon },
  { value: 'light', label: 'Light', description: 'Bright surfaces for daylight.', icon: Sun },
  {
    value: 'system',
    label: 'System',
    description: 'Follow your device setting.',
    icon: Monitor,
  },
];

export function AppearanceSettings() {
  const theme = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  const resolved = useResolvedTheme();

  return (
    <Card aria-labelledby="settings-theme">
      <CardHeader
        id="settings-theme"
        title="Theme"
        description="Applies to the application interface. The office keeps its own colours. Remembered on this device."
      />
      <CardBody>
        <fieldset>
          <legend className="sr-only">Theme</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            {OPTIONS.map(({ value, label, description, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  'relative flex cursor-pointer flex-col overflow-hidden rounded-xl border transition-[border-color,box-shadow] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                  theme === value
                    ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)]'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => {
                    setTheme(value);
                  }}
                  className="sr-only"
                />
                <ThemePreview variant={value === 'system' ? resolved : value} />
                <span className="flex items-start justify-between gap-2 border-t border-line px-3.5 py-3">
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon className="size-4 text-muted" aria-hidden="true" />
                      {label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{description}</span>
                  </span>
                  {theme === value ? (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast">
                      <Check className="size-3" aria-hidden="true" />
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </CardBody>
    </Card>
  );
}

/** A miniature of the shell — frame, inset sheet, cards — in the given theme. Decorative. */
function ThemePreview({ variant }: { variant: 'dark' | 'light' }) {
  const dark = variant === 'dark';
  const c = dark
    ? { frame: '#0c0c0e', sheet: '#141416', card: '#1c1c1f', line: '#2a2a2e', text: '#3a3a40' }
    : { frame: '#f2f2f0', sheet: '#ffffff', card: '#f6f6f4', line: '#e7e7e4', text: '#d9d9d5' };
  return (
    <span aria-hidden="true" className="flex h-24 gap-1.5 p-2" style={{ background: c.frame }}>
      <span className="flex w-1/5 flex-col gap-1.5 pt-1">
        <span className="h-1.5 w-3/4 rounded-full bg-[#f5a524]" />
        <span className="h-1.5 w-full rounded-full" style={{ background: c.text }} />
        <span className="h-1.5 w-2/3 rounded-full" style={{ background: c.text }} />
      </span>
      <span
        className="flex flex-1 flex-col gap-1.5 rounded-md p-2"
        style={{ background: c.sheet, boxShadow: `0 0 0 1px ${c.line}` }}
      >
        <span className="h-2 w-1/3 rounded-full" style={{ background: c.text }} />
        <span className="grid flex-1 grid-cols-3 gap-1.5">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="rounded-sm"
              style={{ background: c.card, boxShadow: `0 0 0 1px ${c.line}` }}
            />
          ))}
        </span>
      </span>
    </span>
  );
}
