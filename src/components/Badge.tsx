import type { ReactNode } from 'react';
import { cn } from './cn';

export type Tone = 'neutral' | 'accent' | 'secondary' | 'info' | 'success' | 'warning' | 'danger';

/** Quiet tinted labels: colour carries meaning, no outline. */
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-hover text-muted',
  accent: 'bg-accent-soft text-accent-strong',
  secondary: 'bg-secondary-soft text-secondary',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs leading-4 font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
