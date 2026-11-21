import type { ProjectId, TaskId } from '@/domain/ids';
import { ok } from '@/domain/result';
import {
  activityEvent,
  checkActor,
  commit,
  detachNotifications,
  findProject,
  notification,
  withoutKeys,
} from '../support';
import type { CommandHandler } from '../types';

export interface DeleteProjectInput {
  readonly projectId: ProjectId;
}

export interface DeleteProjectOutput {
  readonly projectId: ProjectId;
  readonly deletedTaskIds: readonly TaskId[];
}

/**
 * Deletes a project together with all of its tasks. Employees working on those
 * tasks are freed, and notifications about the deleted entities lose their link.
 * The activity log keeps its history.
 */
export const deleteProject: CommandHandler<DeleteProjectInput, DeleteProjectOutput> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const found = findProject(state, input.projectId);
  if (!found.ok) return found;
  const project = found.value;

  const deletedTaskIds = Object.values(state.tasks)
    .filter((task) => task.projectId === project.id)
    .map((task) => task.id);
  const deleted = new Set<string>([project.id, ...deletedTaskIds]);
  const now = context.clock.now();
  const taskNote =
    deletedTaskIds.length === 0
      ? ''
      : ` along with ${deletedTaskIds.length} task${deletedTaskIds.length === 1 ? '' : 's'}`;

  return ok({
    value: { projectId: project.id, deletedTaskIds },
    state: commit(
      state,
      {
        projects: withoutKeys(state.projects, deleted),
        tasks: withoutKeys(state.tasks, deleted),
        notifications: detachNotifications(state.notifications, deleted),
      },
      [
        activityEvent(context, now, {
          eventType: 'project.deleted',
          description: `Project "${project.name}" was deleted${taskNote}.`,
          projectId: project.id,
        }),
      ],
      [
        notification(context, now, {
          type: 'warning',
          title: 'Project deleted',
          message: `"${project.name}" was deleted${taskNote}.`,
          relatedEntityId: null,
        }),
      ],
    ),
  });
};
