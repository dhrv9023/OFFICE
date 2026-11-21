import { conflict, validationError } from '@/domain/errors';
import type { DepartmentId, EmployeeId, ProjectId, TaskId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import { checkAssignment } from '@/domain/rules/assignment';
import { checkDependencies } from '@/domain/rules/dependencies';
import { TASK_FIELD_VALIDATORS, validateFields } from '@/domain/rules/validation';
import type { ActivityEvent, Notification, Priority, Task } from '@/domain/types';
import {
  activityEvent,
  checkActor,
  commit,
  findDepartment,
  findEmployee,
  findProject,
  notification,
  requireOpenProject,
} from '../support';
import type { CommandHandler } from '../types';

export interface CreateTaskInput {
  readonly projectId: ProjectId;
  readonly departmentId: DepartmentId;
  readonly title: string;
  readonly description?: string | undefined;
  readonly priority?: Priority | undefined;
  /** Optional due date (`YYYY-MM-DD`), or null for none. */
  readonly deadline?: string | null | undefined;
  readonly assigneeId?: EmployeeId | null | undefined;
  readonly dependencies?: readonly TaskId[] | undefined;
  /** Explicitly allow an assignee from another department. */
  readonly allowCrossDepartment?: boolean | undefined;
}

/** Creates a `todo` task, optionally already assigned. */
export const createTask: CommandHandler<CreateTaskInput, Task> = (state, input, context) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const project = findProject(state, input.projectId);
  if (!project.ok) return project;
  const open = requireOpenProject(project.value);
  if (!open.ok) return open;
  if (project.value.status === 'completed') {
    return err(
      conflict(
        'project_completed',
        `"${project.value.name}" is completed. Reopen it before adding new tasks.`,
      ),
    );
  }

  const department = findDepartment(state, input.departmentId);
  if (!department.ok) return department;

  const { title, description, priority, deadline } = input;
  const fields = validateFields(TASK_FIELD_VALIDATORS, { title, description, priority, deadline });
  if (!fields.ok) return fields;
  if (fields.value.title === undefined) {
    return err(validationError('title', 'Task title is required.'));
  }

  const id = context.ids.next('task');
  const dependencies = checkDependencies(
    { id, projectId: project.value.id },
    input.dependencies ?? [],
    state.tasks,
  );
  if (!dependencies.ok) return dependencies;

  const now = context.clock.now();
  const unassigned: Task = {
    id,
    projectId: project.value.id,
    departmentId: department.value.id,
    assigneeId: null,
    title: fields.value.title,
    description: fields.value.description ?? '',
    priority: fields.value.priority ?? 'medium',
    status: 'todo',
    dependencies: dependencies.value,
    deadline: fields.value.deadline ?? null,
    blockedReason: null,
    createdAt: now,
    updatedAt: now,
  };

  const events: ActivityEvent[] = [
    activityEvent(context, now, {
      eventType: 'task.created',
      description: `Task "${unassigned.title}" was created in "${project.value.name}".`,
      projectId: unassigned.projectId,
      taskId: id,
    }),
  ];
  const notifications: Notification[] = [];
  let task = unassigned;

  if (input.assigneeId != null) {
    const employee = findEmployee(state, input.assigneeId);
    if (!employee.ok) return employee;
    const allowed = checkAssignment(unassigned, employee.value, Object.values(state.tasks), {
      allowCrossDepartment: input.allowCrossDepartment,
    });
    if (!allowed.ok) return allowed;

    task = { ...unassigned, assigneeId: employee.value.id };
    events.push(
      activityEvent(context, now, {
        eventType: 'task.assigned',
        description: `Task "${task.title}" was assigned to ${employee.value.name}.`,
        projectId: task.projectId,
        taskId: id,
        employeeId: employee.value.id,
      }),
    );
    notifications.push(
      notification(context, now, {
        type: 'info',
        title: 'Task assigned',
        message: `${employee.value.name} was assigned "${task.title}".`,
        relatedEntityId: id,
      }),
    );
  }

  return ok({
    value: task,
    state: commit(state, { tasks: { ...state.tasks, [id]: task } }, events, notifications),
  });
};
