import type { Priority } from '@/domain/types';
import { cn } from './cn';

/**
 * A department's mark: a small rounded square in its colour. Squares are for
 * departments, circles are for status — so the two never read alike.
 */
export function DepartmentMark({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2.5 shrink-0 rounded-[3px]', className)}
      style={{ backgroundColor: color }}
    />
  );
}

const BARS: Record<Priority, number> = { low: 1, medium: 2, high: 3, critical: 3 };

/** Signal bars for priority: quieter than a badge, readable at a glance. Pair with text. */
export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const filled = BARS[priority];
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={cn(
        'size-3.5 shrink-0',
        priority === 'critical'
          ? 'text-danger'
          : priority === 'high'
            ? 'text-warning'
            : 'text-muted',
        className,
      )}
    >
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={1 + bar * 4}
          y={8 - bar * 3}
          width="2.5"
          height={3 + bar * 3}
          rx="0.75"
          fill="currentColor"
          opacity={bar < filled ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}
