import type { DepartmentId, EmployeeId, ProjectId, TaskId } from '../ids';
import type { Priority } from './priority';

export const TASK_STATUSES = [
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

export interface Task {
  readonly id: TaskId;
  readonly projectId: ProjectId;
  /** The discipline that owns the work. */
  readonly departmentId: DepartmentId;
  readonly assigneeId: EmployeeId | null;
  readonly title: string;
  readonly description: string;
  readonly priority: Priority;
  readonly status: TaskStatus;
  /** Tasks in the same project that must be done before this one can start. */
  readonly dependencies: readonly TaskId[];
  /** Optional due date, a calendar day written `YYYY-MM-DD` (same rule as project deadlines). */
  readonly deadline: string | null;
  /**
   * Why the task is blocked, as given when it was moved to "Blocked" (null when
   * no reason was given, and whenever the task is not blocked).
   */
  readonly blockedReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The free-text / scalar part of a task editable through `updateTask`. */
export type TaskFields = Pick<Task, 'title' | 'description' | 'priority' | 'deadline'>;

/** Active = someone is occupied by it right now. An employee has at most one. */
export function isActiveStatus(status: TaskStatus): boolean {
  return status === 'in_progress' || status === 'in_review';
}

/** Terminal = finished for good; cannot be edited, reassigned or reopened. */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'done' || status === 'cancelled';
}
