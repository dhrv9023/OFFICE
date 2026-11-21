import type { Tone } from './Badge';
import { cn } from './cn';

const DOT: Record<Tone, string> = {
  neutral: 'bg-subtle',
  accent: 'bg-accent',
  secondary: 'bg-secondary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const PILL: Record<Tone, string> = {
  neutral: 'bg-surface-hover text-muted',
  accent: 'bg-accent-soft text-accent-strong',
  secondary: 'bg-secondary-soft text-secondary',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

interface StatusIndicatorProps {
  tone: Tone;
  label: string;
  /** `pill` gives the status its own tinted chip, for where it is the headline. */
  variant?: 'plain' | 'pill';
  /** Gentle pulse for "live" states. Disabled automatically under reduced motion. */
  pulse?: boolean;
  /** Hide the text visually but keep it for screen readers. */
  hideLabel?: boolean;
  className?: string;
}

/** A coloured dot plus a text label — colour is never the only signal. */
export function StatusIndicator({
  tone,
  label,
  pulse = false,
  hideLabel = false,
  variant = 'plain',
  className,
}: StatusIndicatorProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs whitespace-nowrap',
        variant === 'pill'
          ? cn('h-6 rounded-full pr-2.5 pl-2 font-medium', PILL[tone])
          : 'text-muted',
        className,
      )}
    >
      <span className="relative flex size-2 shrink-0" aria-hidden="true">
        {pulse ? (
          <span
            className={cn(
              'absolute inline-flex size-full animate-ping rounded-full opacity-60',
              DOT[tone],
            )}
          />
        ) : null}
        <span className={cn('relative inline-flex size-2 rounded-full', DOT[tone])} />
      </span>
      <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
    </span>
  );
}
