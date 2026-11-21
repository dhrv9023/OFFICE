import { isTerminalStatus, type Task } from '../types/task';

/*
 * Deadline rules shared by filters, cards and the dashboard. Deadlines are
 * calendar days (`YYYY-MM-DD`), so "today" is passed in by the caller (the UI
 * knows the user's local day; the domain stays free of the system clock).
 * Finished or cancelled work is never overdue.
 */

/** `day` plus `days` calendar days. */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const next = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

/** The deadline has passed and the work is still open. Due today is not overdue. */
export function isOverdue(task: Pick<Task, 'deadline' | 'status'>, today: string): boolean {
  return task.deadline !== null && !isTerminalStatus(task.status) && task.deadline < today;
}

/** Open work due from today up to and including `days` days ahead. */
export function isDueWithin(
  task: Pick<Task, 'deadline' | 'status'>,
  today: string,
  days: number,
): boolean {
  return (
    task.deadline !== null &&
    !isTerminalStatus(task.status) &&
    task.deadline >= today &&
    task.deadline <= addDays(today, days)
  );
}
