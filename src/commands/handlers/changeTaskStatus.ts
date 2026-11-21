import type { TaskId } from '@/domain/ids';
import { ok } from '@/domain/result';
import { openDependents } from '@/domain/rules/dependencies';
import { calculateProjectProgress } from '@/domain/rules/projectProgress';
import { checkStatusChange } from '@/domain/rules/taskTransitions';
import { validateEnum, validateReason } from '@/domain/rules/validation';
import {
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type Notification,
  type NotificationType,
  type Task,
  type TaskStatus,
  type WorkspaceState,
} from '@/domain/types';
import {
  activityEvent,
  checkActor,
  commit,
  findProject,
  findTask,
  notification,
  requireOpenProject,
} from '../support';
import type { CommandHandler } from '../types';

export interface ChangeTaskStatusInput {
  readonly taskId: TaskId;
  readonly status: TaskStatus;
  /** Optional explanation, e.g. why the task is blocked or cancelled. */
  readonly reason?: string | undefined;
}

/** Which status changes are worth a notification, and how they read. */
const STATUS_NOTICE: Readonly<
  Partial<Record<TaskStatus, { type: NotificationType; title: string; text: string }>>
> = {
  in_review: { type: 'info', title: 'Ready for review', text: 'is ready for review' },
  blocked: { type: 'warning', title: 'Task blocked', text: 'is blocked' },
  done: { type: 'success', title: 'Task completed', text: 'was completed' },
  cancelled: { type: 'info', title: 'Task cancelled', text: 'was cancelled' },
};

/**
 * Moves a task through its workflow. This is the one place task status changes,
 * for human and AI actors alike; the transition table and its preconditions are
 * enforced by `checkStatusChange`.
 */
export const changeTaskStatus: CommandHandler<ChangeTaskStatusInput, Task> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const found = findTask(state, input.taskId);
  if (!found.ok) return found;
  const current = found.value;

  const project = findProject(state, current.projectId);
  if (!project.ok) return project;
  const open = requireOpenProject(project.value);
  if (!open.ok) return open;

  const status = validateEnum('status', input.status, TASK_STATUSES);
  if (!status.ok) return status;
  const reason = validateReason(input.reason ?? '');
  if (!reason.ok) return reason;

  const allowed = checkStatusChange(current, status.value, state.tasks);
  if (!allowed.ok) return allowed;

  const now = context.clock.now();
  const task: Task = {
    ...current,
    status: status.value,
    // The reason travels with the block and is cleared when the task moves on.
    blockedReason: status.value === 'blocked' && reason.value !== '' ? reason.value : null,
    updatedAt: now,
  };
  const tasks: WorkspaceState['tasks'] = { ...state.tasks, [task.id]: task };
  const reasonNote = reason.value === '' ? '' : ` Reason: ${reason.value}`;

  const notifications: Notification[] = [];
  const notice = STATUS_NOTICE[task.status];
  if (notice) {
    // Cancelling a prerequisite strands the tasks that wait on it: say so.
    const stranded = task.status === 'cancelled' ? openDependents(task.id, tasks).length : 0;
    const strandedNote =
      stranded === 0
        ? ''
        : ` ${stranded} task${stranded === 1 ? ' depends' : 's depend'} on it and cannot start until the dependency is removed.`;
    notifications.push(
      notification(context, now, {
        type: stranded > 0 ? 'warning' : notice.type,
        title: notice.title,
        message: `"${task.title}" ${notice.text}.${reasonNote}${strandedNote}`,
        relatedEntityId: task.id,
      }),
    );
  }

  if (task.status === 'done') {
    const progress = calculateProjectProgress(
      Object.values(tasks).filter((item) => item.projectId === task.projectId),
    );
    if (progress.percent === 100) {
      notifications.push(
        notification(context, now, {
          type: 'success',
          title: 'All tasks complete',
          message: `Every task in "${project.value.name}" is done.`,
          relatedEntityId: project.value.id,
        }),
      );
    }
  }

  return ok({
    value: task,
    state: commit(
      state,
      { tasks },
      [
        activityEvent(context, now, {
          eventType: 'task.status_changed',
          description: `Task "${task.title}" moved from ${TASK_STATUS_LABELS[current.status]} to ${TASK_STATUS_LABELS[task.status]}.${reasonNote}`,
          projectId: task.projectId,
          taskId: task.id,
          employeeId: task.assigneeId,
        }),
      ],
      notifications,
    ),
  });
};
