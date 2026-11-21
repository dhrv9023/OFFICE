import { assignmentRejected, type DomainResult } from '../errors';
import { err, ok } from '../result';
import { isActiveStatus, TASK_STATUS_LABELS, type Task, type TaskStatus } from '../types/task';
import type { WorkspaceState } from '../types/workspace';
import { cancelledDependencies, unresolvedDependencies } from './dependencies';
import { findActiveTask } from './employeeStatus';

/**
 * The complete task workflow. A transition is legal only if it is listed here.
 *
 *   todo ──▶ in_progress ──▶ in_review ──▶ done
 *     ▲          │  ▲            │
 *     └──────────┘  └────────────┘ (changes requested)
 *
 * `blocked` can be entered from any open status and left to `todo` or `in_progress`.
 * `cancelled` can be entered from any open status.
 * `done` and `cancelled` are terminal: there is deliberately no way out. Reopening
 * would be a new policy and must be added here explicitly.
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  todo: ['in_progress', 'blocked', 'cancelled'],
  in_progress: ['in_review', 'blocked', 'todo', 'cancelled'],
  in_review: ['done', 'in_progress', 'blocked', 'cancelled'],
  blocked: ['todo', 'in_progress', 'cancelled'],
  done: [],
  cancelled: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

/** Checks the transition table only. */
export function checkTransition(from: TaskStatus, to: TaskStatus): DomainResult<TaskStatus> {
  if (canTransition(from, to)) return ok(to);
  const reason =
    from === to
      ? `Task is already ${TASK_STATUS_LABELS[to].toLowerCase()}.`
      : `A task cannot move from "${TASK_STATUS_LABELS[from]}" to "${TASK_STATUS_LABELS[to]}".`;
  return err({ code: 'invalid_transition', from, to, message: reason });
}

/**
 * Full precondition check for moving `task` to `to`:
 *  1. the transition table allows it;
 *  2. an active status needs an assignee;
 *  3. starting work (non-active → active) needs the assignee to be free
 *     and every dependency to be DONE (a cancelled dependency keeps blocking
 *     until it is removed from the task).
 */
export function checkStatusChange(
  task: Task,
  to: TaskStatus,
  tasks: WorkspaceState['tasks'],
): DomainResult<TaskStatus> {
  const allowed = checkTransition(task.status, to);
  if (!allowed.ok) return allowed;

  if (!isActiveStatus(to)) return ok(to);

  if (task.assigneeId === null) {
    return err(
      assignmentRejected('assignee_required', 'Assign the task to someone before starting it.'),
    );
  }

  if (!isActiveStatus(task.status)) {
    const current = findActiveTask(task.assigneeId, Object.values(tasks));
    if (current && current.id !== task.id) {
      return err(
        assignmentRejected(
          'employee_busy',
          `The assignee is already working on "${current.title}". Finish or pause it first.`,
        ),
      );
    }

    const blockedBy = unresolvedDependencies(task, tasks);
    if (blockedBy.length > 0) {
      const cancelled = cancelledDependencies(task, tasks);
      const waiver =
        cancelled.length === 0
          ? ''
          : ` ${cancelled.length} of them ${cancelled.length === 1 ? 'was' : 'were'} cancelled: remove or replace ${cancelled.length === 1 ? 'that dependency' : 'those dependencies'} to continue.`;
      return err({
        code: 'dependencies_incomplete',
        blockedBy,
        cancelled,
        message: `This task depends on ${blockedBy.length} unfinished task${blockedBy.length === 1 ? '' : 's'}.${waiver}`,
      });
    }
  }

  return ok(to);
}
