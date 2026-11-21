import type { DepartmentId, EmployeeId, ProjectId } from '@/domain/ids';
import { isDueWithin, isOverdue } from '@/domain/rules/deadlines';
import {
  isTerminalStatus,
  PRIORITIES,
  TASK_STATUSES,
  type Priority,
  type Project,
  type Task,
  type TaskStatus,
} from '@/domain/types';

export const DUE_FILTERS = ['overdue', 'week', 'none'] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export interface TaskFilters {
  readonly query: string;
  readonly projectId: ProjectId | 'all';
  readonly departmentId: DepartmentId | 'all';
  /** An employee, `unassigned`, or `all`. */
  readonly assignee: EmployeeId | 'unassigned' | 'all';
  /** One status, `open` (anything not done or cancelled), or `all`. */
  readonly status: TaskStatus | 'open' | 'all';
  readonly priority: Priority | 'all';
  /** Overdue, due within 7 days, or without a deadline. */
  readonly due: DueFilter | 'all';
}

export const NO_TASK_FILTERS: TaskFilters = {
  query: '',
  projectId: 'all',
  departmentId: 'all',
  assignee: 'all',
  status: 'all',
  priority: 'all',
  due: 'all',
};

/** How far ahead "due this week" looks, in days. */
export const DUE_SOON_DAYS = 7;

const oneOf = <T extends string>(value: string | null, allowed: readonly T[]): T | 'all' =>
  allowed.find((option) => option === value) ?? 'all';

/** Read filters from URL search params, ignoring anything malformed. */
export function readTaskFilters(params: URLSearchParams): TaskFilters {
  return {
    query: params.get('q') ?? '',
    projectId: (params.get('project') as ProjectId | null) ?? 'all',
    departmentId: (params.get('department') as DepartmentId | null) ?? 'all',
    assignee: (params.get('assignee') as EmployeeId | 'unassigned' | null) ?? 'all',
    status: oneOf(params.get('status'), [...TASK_STATUSES, 'open'] as const),
    priority: oneOf(params.get('priority'), PRIORITIES),
    due: oneOf(params.get('due'), DUE_FILTERS),
  };
}

export function hasTaskFilters(filters: TaskFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    (Object.keys(NO_TASK_FILTERS) as (keyof TaskFilters)[]).some(
      (key) => key !== 'query' && filters[key] !== 'all',
    )
  );
}

function matchesDue(task: Task, due: TaskFilters['due'], today: string): boolean {
  switch (due) {
    case 'all':
      return true;
    case 'overdue':
      return isOverdue(task, today);
    case 'week':
      return isDueWithin(task, today, DUE_SOON_DAYS);
    case 'none':
      return task.deadline === null;
  }
}

/**
 * View filtering for the board: text search over title, description and project
 * name, plus exact matches on every other filter. Filters compose (all must
 * match). `today` is the user's local calendar day. Oldest first.
 */
export function filterTasks(
  tasks: readonly Task[],
  filters: TaskFilters,
  projects: Readonly<Record<string, Project>>,
  today: string,
): Task[] {
  const query = filters.query.trim().toLowerCase();
  return tasks
    .filter((task) => filters.projectId === 'all' || task.projectId === filters.projectId)
    .filter((task) => filters.departmentId === 'all' || task.departmentId === filters.departmentId)
    .filter((task) =>
      filters.assignee === 'all'
        ? true
        : filters.assignee === 'unassigned'
          ? task.assigneeId === null
          : task.assigneeId === filters.assignee,
    )
    .filter((task) =>
      filters.status === 'all'
        ? true
        : filters.status === 'open'
          ? !isTerminalStatus(task.status)
          : task.status === filters.status,
    )
    .filter((task) => filters.priority === 'all' || task.priority === filters.priority)
    .filter((task) => matchesDue(task, filters.due, today))
    .filter(
      (task) =>
        query === '' ||
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query) ||
        (projects[task.projectId]?.name.toLowerCase().includes(query) ?? false),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * Operational shortcuts: each is just a filter combination (no separate pages).
 * Open work only, so a quick view never lists finished tasks.
 */
export const QUICK_VIEWS = [
  { id: 'unassigned', label: 'Unassigned', params: { assignee: 'unassigned', status: 'open' } },
  { id: 'blocked', label: 'Blocked', params: { status: 'blocked' } },
  { id: 'review', label: 'Awaiting review', params: { status: 'in_review' } },
  { id: 'overdue', label: 'Overdue', params: { due: 'overdue' } },
  { id: 'week', label: 'Due this week', params: { due: 'week' } },
] as const;

export type QuickView = (typeof QUICK_VIEWS)[number];

/** The URL for the task board with exactly these filters. */
export function tasksUrl(path: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return search ? `${path}?${search}` : path;
}
