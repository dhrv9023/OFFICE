import { assignmentRejected, conflict } from '@/domain/errors';
import type { DepartmentId, TaskId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import { checkDependencies } from '@/domain/rules/dependencies';
import { TASK_FIELD_VALIDATORS, validateFields } from '@/domain/rules/validation';
import type { Priority, Task } from '@/domain/types';
import {
  activityEvent,
  changedFields,
  checkActor,
  commit,
  findDepartment,
  findProject,
  findTask,
  requireOpenProject,
  requireOpenTask,
} from '../support';
import type { CommandHandler } from '../types';

export interface UpdateTaskInput {
  readonly taskId: TaskId;
  /** Only the fields present are changed. Status and assignee have their own commands. */
  readonly patch: {
    readonly title?: string | undefined;
    readonly description?: string | undefined;
    readonly priority?: Priority | undefined;
    /** A new due date, or null to clear it. */
    readonly deadline?: string | null | undefined;
    readonly departmentId?: DepartmentId | undefined;
    readonly dependencies?: readonly TaskId[] | undefined;
  };
  /** Explicitly allow moving the task to a department its assignee is not in. */
  readonly allowCrossDepartment?: boolean | undefined;
}

type EditableTaskFields = Pick<
  Task,
  'title' | 'description' | 'priority' | 'deadline' | 'departmentId' | 'dependencies'
>;

/** Edits a task's details, owning department or dependencies. Closed tasks are immutable. */
export const updateTask: CommandHandler<UpdateTaskInput, Task> = (state, input, context) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const found = findTask(state, input.taskId);
  if (!found.ok) return found;
  const current = found.value;

  const project = findProject(state, current.projectId);
  if (!project.ok) return project;
  const openProject = requireOpenProject(project.value);
  if (!openProject.ok) return openProject;
  const openTask = requireOpenTask(current);
  if (!openTask.ok) return openTask;

  const { title, description, priority, deadline } = input.patch;
  const fields = validateFields(TASK_FIELD_VALIDATORS, { title, description, priority, deadline });
  if (!fields.ok) return fields;
  const patch: { -readonly [K in keyof EditableTaskFields]?: EditableTaskFields[K] } = {
    ...fields.value,
  };

  if (input.patch.departmentId !== undefined) {
    const department = findDepartment(state, input.patch.departmentId);
    if (!department.ok) return department;

    const assignee = current.assigneeId === null ? undefined : state.employees[current.assigneeId];
    if (
      assignee &&
      assignee.departmentId !== department.value.id &&
      input.allowCrossDepartment !== true
    ) {
      return err(
        assignmentRejected(
          'department_mismatch',
          `${assignee.name} is assigned to this task but is not in ${department.value.name}. Reassign the task first.`,
        ),
      );
    }
    patch.departmentId = department.value.id;
  }

  if (input.patch.dependencies !== undefined) {
    const dependencies = checkDependencies(current, input.patch.dependencies, state.tasks);
    if (!dependencies.ok) return dependencies;
    patch.dependencies = dependencies.value;
  }

  const changed = changedFields<EditableTaskFields>(current, patch);
  if (changed.length === 0) {
    return err(conflict('no_change', 'Nothing to update: the task already has these values.'));
  }

  const now = context.clock.now();
  const task: Task = { ...current, ...patch, updatedAt: now };

  return ok({
    value: task,
    state: commit(
      state,
      { tasks: { ...state.tasks, [task.id]: task } },
      [
        activityEvent(context, now, {
          eventType: 'task.updated',
          description: `Task "${task.title}" was updated (${changed.join(', ')}).`,
          projectId: task.projectId,
          taskId: task.id,
          employeeId: task.assigneeId,
        }),
      ],
      [],
    ),
  });
};
