import { cn } from '@/components/cn';
import type { TaskStatus } from '@/domain/types';
import type { Workload } from './workforce';

const SEGMENT: Record<TaskStatus, string> = {
  in_progress: 'bg-accent',
  in_review: 'bg-secondary',
  blocked: 'bg-danger',
  todo: 'bg-subtle/70',
  done: 'bg-success/70',
  cancelled: 'bg-line',
};

/** Workload bars share one scale, so the same number of tasks is the same length everywhere. */
export const MIN_WORKLOAD_SCALE = 6;

function plural(count: number, one: string): string {
  return `${String(count)} ${count === 1 ? one : `${one}s`}`;
}

/**
 * A person's tasks as one segment each (active work first, finished last), with
 * open and done counts. Used on employee cards and in the office profile.
 */
export function WorkloadBar({
  workload,
  scale = MIN_WORKLOAD_SCALE,
  className,
}: {
  workload: Workload;
  /** Number of slots; pass the team's largest workload so bars compare. */
  scale?: number;
  className?: string;
}) {
  const slots = Math.max(scale, workload.segments.length);
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">Workload</span>
        <span className="tabular-nums">
          <span className="font-medium">{workload.open} open</span>
          <span className="text-muted"> · {workload.done} done</span>
        </span>
      </div>
      <div
        role="img"
        aria-label={`${plural(workload.open, 'open task')}, ${String(workload.done)} done`}
        className="mt-2 flex h-1.5 gap-[3px]"
      >
        {Array.from({ length: slots }, (_, index) => {
          const segment = workload.segments[index];
          return (
            <span
              key={index}
              className={cn(
                'h-full flex-1 rounded-full',
                segment ? SEGMENT[segment] : 'bg-surface-hover',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
