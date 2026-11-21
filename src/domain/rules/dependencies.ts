import { invalidReference, validationError, type DomainResult } from '../errors';
import type { ProjectId, TaskId } from '../ids';
import { err, ok } from '../result';
import { isTerminalStatus, type Task } from '../types/task';
import type { WorkspaceState } from '../types/workspace';

type TaskMap = WorkspaceState['tasks'];

/**
 * Looks for a loop that would exist if `taskId` depended on `dependencies`.
 * Returns the loop as a path starting and ending at `taskId`, or null.
 */
export function findDependencyCycle(
  taskId: TaskId,
  dependencies: readonly TaskId[],
  tasks: TaskMap,
): TaskId[] | null {
  const visited = new Set<TaskId>();

  const walk = (current: TaskId, path: TaskId[]): TaskId[] | null => {
    if (current === taskId) return [...path, current];
    if (visited.has(current)) return null;
    visited.add(current);
    for (const next of tasks[current]?.dependencies ?? []) {
      const cycle = walk(next, [...path, current]);
      if (cycle) return cycle;
    }
    return null;
  };

  for (const dependency of dependencies) {
    const cycle = walk(dependency, [taskId]);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Validates a proposed dependency list for a task (new or existing):
 * every entry must be a distinct, existing task in the same project, not the task
 * itself, and the result must not create a cycle.
 */
export function checkDependencies(
  task: { readonly id: TaskId; readonly projectId: ProjectId },
  dependencies: unknown,
  tasks: TaskMap,
): DomainResult<readonly TaskId[]> {
  if (!Array.isArray(dependencies)) {
    return err(validationError('dependencies', 'Dependencies must be a list of task IDs.'));
  }

  const seen = new Set<string>();
  const result: TaskId[] = [];

  for (const entry of dependencies as unknown[]) {
    if (typeof entry !== 'string') {
      return err(validationError('dependencies', 'Dependencies must be a list of task IDs.'));
    }
    if (entry === task.id) {
      return err(validationError('dependencies', 'A task cannot depend on itself.'));
    }
    if (seen.has(entry)) {
      return err(
        validationError('dependencies', `Dependency "${entry}" is listed more than once.`),
      );
    }
    seen.add(entry);

    const dependency = tasks[entry as TaskId];
    if (!dependency) return err(invalidReference('task', entry, 'dependencies'));
    if (dependency.projectId !== task.projectId) {
      return err(
        invalidReference(
          'task',
          entry,
          'dependencies',
          `"${dependency.title}" belongs to a different project.`,
        ),
      );
    }
    result.push(dependency.id);
  }

  const cycle = findDependencyCycle(task.id, result, tasks);
  if (cycle) {
    return err({
      code: 'dependency_cycle',
      cycle,
      message: 'These dependencies would create a circular chain of tasks.',
    });
  }

  return ok(result);
}

/**
 * Dependencies still standing in the way of starting `task`.
 *
 * Only a DONE dependency is resolved. A cancelled prerequisite was never delivered,
 * so it keeps blocking: the operator must waive it explicitly by removing (or
 * replacing) the dependency with `updateTask`. A missing dependency also counts
 * as unresolved (fail safe).
 */
export function unresolvedDependencies(task: Task, tasks: TaskMap): TaskId[] {
  return task.dependencies.filter((id) => tasks[id]?.status !== 'done');
}

/** The dependencies of `task` that were cancelled and therefore can never complete. */
export function cancelledDependencies(task: Task, tasks: TaskMap): TaskId[] {
  return task.dependencies.filter((id) => tasks[id]?.status === 'cancelled');
}

/** Open tasks that list `taskId` as a dependency. */
export function openDependents(taskId: TaskId, tasks: TaskMap): Task[] {
  return Object.values(tasks).filter(
    (task) => task.dependencies.includes(taskId) && !isTerminalStatus(task.status),
  );
}
