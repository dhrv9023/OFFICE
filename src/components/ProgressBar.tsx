import { cn } from './cn';

interface ProgressBarProps {
  /** 0–100. */
  value: number;
  /** Accessible name, e.g. "Website relaunch progress". */
  label: string;
  /** Optional human text, e.g. "3 of 8 tasks done". */
  valueText?: string;
  className?: string;
}

export function ProgressBar({ value, label, valueText, className }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText ? `${percent}%, ${valueText}` : `${percent}%`}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-hover', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          percent === 100 ? 'bg-success' : 'bg-accent',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
