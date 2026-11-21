import type { TaskId } from '@/domain/ids';
import { ok } from '@/domain/result';
import type { Task } from '@/domain/types';
import {
  activityEvent,
  checkActor,
  commit,
  detachNotifications,
  findTask,
  withoutKeys,
} from '../support';
import type { CommandHandler } from '../types';

export interface DeleteTaskInput {
  readonly taskId: TaskId;
}

export interface DeleteTaskOutput {
  readonly taskId: TaskId;
  /** Tasks that depended on the deleted one and had that dependency removed. */
  readonly updatedDependentIds: readonly TaskId[];
}

/**
 * Deletes a task in any status. Tasks that depended on it drop the dependency,
 * its assignee is freed, and notifications about it lose their link.
 */
export const deleteTask: CommandHandler<DeleteTaskInput, DeleteTaskOutput> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const found = findTask(state, input.taskId);
  if (!found.ok) return found;
  const task = found.value;

  const now = context.clock.now();
  const deleted = new Set<string>([task.id]);
  const remaining: Record<TaskId, Task> = withoutKeys(state.tasks, deleted);
  const updatedDependentIds: TaskId[] = [];

  for (const other of Object.values(remaining)) {
    if (!other.dependencies.includes(task.id)) continue;
    remaining[other.id] = {
      ...other,
      dependencies: other.dependencies.filter((id) => id !== task.id),
      updatedAt: now,
    };
    updatedDependentIds.push(other.id);
  }

  return ok({
    value: { taskId: task.id, updatedDependentIds },
    state: commit(
      state,
      {
        tasks: remaining,
        notifications: detachNotifications(state.notifications, deleted),
      },
      [
        activityEvent(context, now, {
          eventType: 'task.deleted',
          description: `Task "${task.title}" was deleted.`,
          projectId: task.projectId,
          taskId: task.id,
          employeeId: task.assigneeId,
        }),
      ],
      [],
    ),
  });
};
