import { commands } from '@/commands';
import { toast } from '@/components/toast/toastStore';
import { checkStatusChange } from '@/domain/rules/taskTransitions';
import { USER_ACTOR, type Task, type TaskStatus } from '@/domain/types';
import { errorTitle } from '@/features/common/commandFeedback';
import { TASK_STATUS } from '@/features/common/presentation';
import { getWorkspace } from '@/stores/workspace';
import { requestBlock } from './blockPrompt';

/**
 * Moves a task through the `changeTaskStatus` command. On rejection nothing
 * changes (the store is untouched) and the domain's reason is shown. Moving to
 * "Blocked" first asks for a reason (see BlockTaskDialog) and returns false: the
 * move happens when the dialog is confirmed.
 */
export function moveTask(task: Task, to: TaskStatus): boolean {
  if (to === 'blocked') {
    // Ask why first, but only if the move is allowed at all (same rule as the command).
    const allowed = checkStatusChange(task, 'blocked', getWorkspace().tasks);
    if (allowed.ok) {
      requestBlock(task.id);
      return false;
    }
  }
  const result = commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: to });
  if (!result.ok) {
    toast.error(
      `Couldn't move "${task.title}" to ${TASK_STATUS[to].label}`,
      `${errorTitle(result.error)}: ${result.error.message}`,
      'task-move',
    );
    return false;
  }
  return true;
}
