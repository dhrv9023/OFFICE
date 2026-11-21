import type { DomainResult } from '../errors';
import { err, ok } from '../result';
import type { Project, ProjectStatus } from '../types/project';
import { isTerminalStatus, type Task } from '../types/task';

export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  archived: 'Archived',
};

/**
 * The project lifecycle. A status change is legal only if it is listed here.
 *
 *   planning ──▶ active ──▶ completed ──▶ archived
 *      ▲  │        ▲ │         │  ▲          │
 *      │  └──▶ on_hold ◀─┘      │  └── (reopen: completed → active)
 *      └──────── restore: archived → planning | active
 *
 * Completion is always a human decision: it is never applied automatically, and it
 * requires every task of the project to be done or cancelled.
 */
export const PROJECT_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> = {
  planning: ['active', 'on_hold', 'archived'],
  active: ['on_hold', 'completed', 'archived'],
  on_hold: ['active', 'planning', 'archived'],
  completed: ['active', 'archived'],
  archived: ['planning', 'active'],
};

export function canChangeProjectStatus(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}

/**
 * Full check for moving `project` to `to`:
 *  1. the transition table allows it;
 *  2. completing requires no open (not done / not cancelled) tasks.
 *
 * @param tasks the tasks of this project
 */
export function checkProjectStatusChange(
  project: Project,
  to: ProjectStatus,
  tasks: readonly Task[],
): DomainResult<ProjectStatus> {
  const from = project.status;
  if (!canChangeProjectStatus(from, to)) {
    return err({
      code: 'invalid_project_transition',
      from,
      to,
      message: `A project cannot move from "${PROJECT_STATUS_LABELS[from]}" to "${PROJECT_STATUS_LABELS[to]}".`,
    });
  }
  if (to === 'completed') {
    const open = openTasks(tasks);
    if (open.length > 0) {
      return err({
        code: 'conflict',
        reason: 'project_open_tasks',
        message: `"${project.name}" still has ${open.length} open task${open.length === 1 ? '' : 's'}. Finish or cancel ${open.length === 1 ? 'it' : 'them'} before completing the project.`,
      });
    }
  }
  return ok(to);
}

/** Tasks that are neither done nor cancelled. */
export function openTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((task) => !isTerminalStatus(task.status));
}

/**
 * The lifecycle rule that holds for a project at rest, independent of how it got
 * there: a completed project has no open tasks. (Every other project status is
 * valid with any tasks, including archived — archiving does not close work.)
 * Used by `validateWorkspace`, so saved and imported data is held to the same rule
 * the commands enforce.
 *
 * @param tasks the tasks of this project
 */
export function checkProjectState(project: Project, tasks: readonly Task[]): DomainResult<Project> {
  if (project.status !== 'completed') return ok(project);
  const open = openTasks(tasks);
  if (open.length === 0) return ok(project);
  return err({
    code: 'conflict',
    reason: 'project_open_tasks',
    message: `Project "${project.name}" is marked completed but still has ${open.length} open task${open.length === 1 ? '' : 's'}.`,
  });
}
