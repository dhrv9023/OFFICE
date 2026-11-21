import type { Task } from '../types/task';

export interface ProjectProgress {
  /** Every task in the project, including cancelled ones. */
  readonly total: number;
  readonly done: number;
  readonly cancelled: number;
  /** Tasks that count towards progress: `total − cancelled`. */
  readonly counted: number;
  /** Whole-number percentage, 0–100. */
  readonly percent: number;
}

/**
 * Progress = done ÷ (total − cancelled) × 100, rounded to a whole number.
 *
 * Cancelled tasks are excluded from BOTH sides: work that was called off is neither
 * progress nor outstanding. Counting it as complete would inflate progress; counting
 * it as outstanding would make 100% unreachable.
 *
 * A project with no counted tasks (none at all, or all cancelled) is 0%, not NaN and
 * not 100% — nothing has been delivered.
 *
 * @param tasks the tasks of ONE project
 */
export function calculateProjectProgress(tasks: readonly Task[]): ProjectProgress {
  let done = 0;
  let cancelled = 0;
  for (const task of tasks) {
    if (task.status === 'done') done += 1;
    else if (task.status === 'cancelled') cancelled += 1;
  }

  const total = tasks.length;
  const counted = total - cancelled;
  const percent = counted === 0 ? 0 : Math.round((done / counted) * 100);

  return { total, done, cancelled, counted, percent };
}
