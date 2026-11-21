import type { DomainError } from '@/domain/errors';
import { checkStatusChange, TASK_TRANSITIONS } from '@/domain/rules/taskTransitions';
import type { Project, Task, TaskStatus, WorkspaceState } from '@/domain/types';

export interface TaskMove {
  readonly to: TaskStatus;
  /** Why the move is not possible right now, or null if it is. */
  readonly blocked: DomainError | null;
}

/** Why nothing about a task can change, or null. Mirrors the commands' read-only rules. */
export function taskLockReason(task: Task, project: Project | undefined): string | null {
  if (project?.status === 'archived') return 'This project is archived and read-only.';
  if (task.status === 'done' || task.status === 'cancelled') {
    return 'This task is closed and can no longer be changed.';
  }
  return null;
}

/**
 * Every status the task could move to next, each checked with the domain's full
 * rules (transition table, assignee, dependencies, one active task per person).
 */
export function taskMoves(task: Task, tasks: WorkspaceState['tasks']): TaskMove[] {
  return TASK_TRANSITIONS[task.status].map((to) => {
    const check = checkStatusChange(task, to, tasks);
    return { to, blocked: check.ok ? null : check.error };
  });
}

/** Can `task` be dropped on the column for `to`? Same checks as `taskMoves`. */
export function checkMove(
  task: Task,
  to: TaskStatus,
  tasks: WorkspaceState['tasks'],
): DomainError | null {
  const check = checkStatusChange(task, to, tasks);
  return check.ok ? null : check.error;
}
