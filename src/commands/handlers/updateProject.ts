import { conflict } from '@/domain/errors';
import type { ProjectId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import { checkProjectStatusChange } from '@/domain/rules/projectTransitions';
import { PROJECT_FIELD_VALIDATORS, validateFields } from '@/domain/rules/validation';
import type {
  ActivityEvent,
  Notification,
  NotificationType,
  Project,
  ProjectFields,
  ProjectStatus,
} from '@/domain/types';
import {
  activityEvent,
  changedFields,
  checkActor,
  commit,
  findProject,
  notification,
} from '../support';
import type { CommandHandler } from '../types';

export interface UpdateProjectInput {
  readonly projectId: ProjectId;
  /** Only the fields present are changed. */
  readonly patch: { readonly [K in keyof ProjectFields]?: ProjectFields[K] | undefined };
}

const STATUS_NOTICE: Readonly<Record<ProjectStatus, { type: NotificationType; text: string }>> = {
  planning: { type: 'info', text: 'is back in planning' },
  active: { type: 'info', text: 'is now active' },
  on_hold: { type: 'warning', text: 'was put on hold' },
  completed: { type: 'success', text: 'was completed' },
  archived: { type: 'info', text: 'was archived' },
};

/**
 * Edits a project's details and/or status. Rejects a patch that changes nothing.
 * Status changes follow PROJECT_TRANSITIONS (completion needs every task closed).
 * An archived project is read-only except for its status (restoring it).
 */
export const updateProject: CommandHandler<UpdateProjectInput, Project> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const found = findProject(state, input.projectId);
  if (!found.ok) return found;
  const current = found.value;

  const fields = validateFields(PROJECT_FIELD_VALIDATORS, input.patch);
  if (!fields.ok) return fields;

  const changed = changedFields<ProjectFields>(current, fields.value);
  if (changed.length === 0) {
    return err(conflict('no_change', 'Nothing to update: the project already has these values.'));
  }

  if (current.status === 'archived' && changed.some((field) => field !== 'status')) {
    return err(
      conflict(
        'project_archived',
        `"${current.name}" is archived and read-only. Restore it before editing its details.`,
      ),
    );
  }

  if (changed.includes('status') && fields.value.status !== undefined) {
    const tasks = Object.values(state.tasks).filter((task) => task.projectId === current.id);
    const allowed = checkProjectStatusChange(current, fields.value.status, tasks);
    if (!allowed.ok) return allowed;
  }

  const now = context.clock.now();
  const project: Project = { ...current, ...fields.value, updatedAt: now };

  const events: ActivityEvent[] = [];
  const notifications: Notification[] = [];

  const detailChanges = changed.filter((field) => field !== 'status');
  if (detailChanges.length > 0) {
    events.push(
      activityEvent(context, now, {
        eventType: 'project.updated',
        description: `Project "${project.name}" was updated (${detailChanges.join(', ')}).`,
        projectId: project.id,
      }),
    );
  }

  if (changed.includes('status')) {
    const notice = STATUS_NOTICE[project.status];
    events.push(
      activityEvent(context, now, {
        eventType: 'project.status_changed',
        description: `Project "${project.name}" ${notice.text}.`,
        projectId: project.id,
      }),
    );
    notifications.push(
      notification(context, now, {
        type: notice.type,
        title: 'Project status changed',
        message: `"${project.name}" ${notice.text}.`,
        relatedEntityId: project.id,
      }),
    );
  }

  return ok({
    value: project,
    state: commit(
      state,
      { projects: { ...state.projects, [project.id]: project } },
      events,
      notifications,
    ),
  });
};
