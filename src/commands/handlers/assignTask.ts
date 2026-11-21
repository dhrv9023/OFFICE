import { conflict } from '@/domain/errors';
import type { EmployeeId, TaskId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import { checkAssignment, checkUnassignment } from '@/domain/rules/assignment';
import type { Task } from '@/domain/types';
import {
  activityEvent,
  checkActor,
  commit,
  findEmployee,
  findProject,
  findTask,
  notification,
  requireOpenProject,
} from '../support';
import type { CommandHandler } from '../types';

export interface AssignTaskInput {
  readonly taskId: TaskId;
  /** The new assignee, or null to unassign. */
  readonly assigneeId: EmployeeId | null;
  /** Explicitly allow an assignee from another department. */
  readonly allowCrossDepartment?: boolean | undefined;
}

/** Assigns, reassigns or unassigns a task. */
export const assignTask: CommandHandler<AssignTaskInput, Task> = (state, input, context) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const found = findTask(state, input.taskId);
  if (!found.ok) return found;
  const current = found.value;

  const project = findProject(state, current.projectId);
  if (!project.ok) return project;
  const open = requireOpenProject(project.value);
  if (!open.ok) return open;

  if (input.assigneeId === current.assigneeId) {
    return err(conflict('no_change', 'The task already has this assignee.'));
  }

  const previous = current.assigneeId === null ? undefined : state.employees[current.assigneeId];
  const now = context.clock.now();
  const base = { projectId: current.projectId, taskId: current.id };

  if (input.assigneeId === null) {
    const allowed = checkUnassignment(current);
    if (!allowed.ok) return allowed;

    const task: Task = { ...current, assigneeId: null, updatedAt: now };
    return ok({
      value: task,
      state: commit(
        state,
        { tasks: { ...state.tasks, [task.id]: task } },
        [
          activityEvent(context, now, {
            ...base,
            eventType: 'task.unassigned',
            description: `Task "${task.title}" was unassigned${previous ? ` from ${previous.name}` : ''}.`,
            employeeId: current.assigneeId,
          }),
        ],
        [],
      ),
    });
  }

  const employee = findEmployee(state, input.assigneeId);
  if (!employee.ok) return employee;
  const allowed = checkAssignment(current, employee.value, Object.values(state.tasks), {
    allowCrossDepartment: input.allowCrossDepartment,
  });
  if (!allowed.ok) return allowed;

  const task: Task = { ...current, assigneeId: employee.value.id, updatedAt: now };
  const reassigned = previous !== undefined;

  return ok({
    value: task,
    state: commit(
      state,
      { tasks: { ...state.tasks, [task.id]: task } },
      [
        activityEvent(context, now, {
          ...base,
          eventType: reassigned ? 'task.reassigned' : 'task.assigned',
          description: reassigned
            ? `Task "${task.title}" was reassigned from ${previous.name} to ${employee.value.name}.`
            : `Task "${task.title}" was assigned to ${employee.value.name}.`,
          employeeId: employee.value.id,
        }),
      ],
      [
        notification(context, now, {
          type: 'info',
          title: reassigned ? 'Task reassigned' : 'Task assigned',
          message: `${employee.value.name} was assigned "${task.title}".`,
          relatedEntityId: task.id,
        }),
      ],
    ),
  });
};
