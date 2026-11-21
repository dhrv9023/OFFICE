import { validationError } from '@/domain/errors';
import { err, ok } from '@/domain/result';
import { PROJECT_FIELD_VALIDATORS, validateFields } from '@/domain/rules/validation';
import type { Priority, Project, ProjectCategory } from '@/domain/types';
import { activityEvent, checkActor, commit, notification } from '../support';
import type { CommandHandler } from '../types';

export interface CreateProjectInput {
  readonly name: string;
  readonly description?: string | undefined;
  readonly category?: ProjectCategory | undefined;
  readonly objectives?: readonly string[] | undefined;
  readonly requirements?: readonly string[] | undefined;
  readonly priority?: Priority | undefined;
  readonly deadline?: string | null | undefined;
}

/** Creates a project in `planning` status. */
export const createProject: CommandHandler<CreateProjectInput, Project> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const { name, description, category, objectives, requirements, priority, deadline } = input;
  const fields = validateFields(PROJECT_FIELD_VALIDATORS, {
    name,
    description,
    category,
    objectives,
    requirements,
    priority,
    deadline,
  });
  if (!fields.ok) return fields;
  if (fields.value.name === undefined) {
    return err(validationError('name', 'Project name is required.'));
  }

  const now = context.clock.now();
  const project: Project = {
    id: context.ids.next('project'),
    name: fields.value.name,
    description: fields.value.description ?? '',
    category: fields.value.category ?? 'other',
    objectives: fields.value.objectives ?? [],
    requirements: fields.value.requirements ?? [],
    priority: fields.value.priority ?? 'medium',
    status: 'planning',
    deadline: fields.value.deadline ?? null,
    createdAt: now,
    updatedAt: now,
  };

  return ok({
    value: project,
    state: commit(
      state,
      { projects: { ...state.projects, [project.id]: project } },
      [
        activityEvent(context, now, {
          eventType: 'project.created',
          description: `Project "${project.name}" was created.`,
          projectId: project.id,
        }),
      ],
      [
        notification(context, now, {
          type: 'success',
          title: 'Project created',
          message: `"${project.name}" is ready for planning.`,
          relatedEntityId: project.id,
        }),
      ],
    ),
  });
};
