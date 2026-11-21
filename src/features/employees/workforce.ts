import type { EmployeeId } from '@/domain/ids';
import type {
  EmployeeWorkStatus,
  Priority,
  Project,
  Task,
  TaskStatus,
  WorkspaceState,
} from '@/domain/types';

/*
 * Read-only views of who is doing what, derived from tasks. Presentation helpers
 * only: no rules live here (status itself comes from the domain).
 */

/** Order of a person's tasks in their workload bar: active work first, finished last. */
const SEGMENT_ORDER: readonly TaskStatus[] = [
  'in_progress',
  'in_review',
  'blocked',
  'todo',
  'done',
];
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export interface Workload {
  /** One entry per assigned task (cancelled excluded), in SEGMENT_ORDER. */
  readonly segments: readonly TaskStatus[];
  readonly open: number;
  readonly done: number;
}

export function workloadOf(tasks: readonly Task[], employeeId: EmployeeId): Workload {
  const mine = tasks.filter(
    (task) => task.assigneeId === employeeId && task.status !== 'cancelled',
  );
  const segments = [...mine]
    .map((task) => task.status)
    .sort((a, b) => SEGMENT_ORDER.indexOf(a) - SEGMENT_ORDER.indexOf(b));
  const done = segments.filter((status) => status === 'done').length;
  return { segments, open: segments.length - done, done };
}

export type FocusKind = 'working' | 'reviewing' | 'blocked' | 'next' | 'none';

export interface Focus {
  readonly kind: FocusKind;
  readonly task: Task | null;
  readonly project: Project | null;
}

const byPriority = (a: Task, b: Task) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt);

/**
 * The one task worth showing for a person: what they are doing, what is stopping
 * them, or what is next in their queue.
 */
export function focusOf(
  state: WorkspaceState,
  employeeId: EmployeeId,
  status: EmployeeWorkStatus,
): Focus {
  const tasks = Object.values(state.tasks).filter((task) => task.assigneeId === employeeId);
  const current = state.employees[employeeId]?.currentTaskId;
  const pick = (kind: FocusKind, task: Task | undefined): Focus =>
    task
      ? { kind, task, project: state.projects[task.projectId] ?? null }
      : { kind: 'none', task: null, project: null };

  if (status === 'working' || status === 'reviewing') {
    const active = current ? state.tasks[current] : undefined;
    return pick(status, active);
  }
  if (status === 'blocked') {
    return pick('blocked', tasks.filter((task) => task.status === 'blocked').sort(byPriority)[0]);
  }
  return pick('next', tasks.filter((task) => task.status === 'todo').sort(byPriority)[0]);
}

export const FOCUS_LABEL: Record<FocusKind, string> = {
  working: 'Working on',
  reviewing: 'Waiting for review',
  blocked: 'Blocked on',
  next: 'Up next',
  none: 'No open work',
};

/** How many people are in each work status, in a fixed display order. */
export function statusBreakdown(
  statuses: readonly EmployeeWorkStatus[],
): { status: EmployeeWorkStatus; count: number }[] {
  const order: EmployeeWorkStatus[] = ['working', 'reviewing', 'blocked', 'idle'];
  return order.map((status) => ({
    status,
    count: statuses.filter((value) => value === status).length,
  }));
}
