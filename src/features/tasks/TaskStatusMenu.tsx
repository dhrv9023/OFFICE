import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/Badge';
import { DropdownMenu, type MenuItem } from '@/components/DropdownMenu';
import type { Task, TaskStatus } from '@/domain/types';
import { TASK_STATUS } from '@/features/common/presentation';
import { useWorkspace } from '@/stores/workspace';
import { moveTask } from './moveTask';
import { taskLockReason, taskMoves } from './taskMoves';

interface TaskStatusMenuProps {
  task: Task;
  /** Called after a successful move. */
  onMoved?: (to: TaskStatus) => void;
  /** `compact` shows only an icon-sized trigger (board cards). */
  variant?: 'badge' | 'compact';
}

/**
 * The keyboard- and touch-friendly way to change a task's status. Every option
 * that the rules would reject is shown disabled with the reason.
 */
export function TaskStatusMenu({ task, onMoved, variant = 'badge' }: TaskStatusMenuProps) {
  const tasks = useWorkspace((state) => state.tasks);
  const project = useWorkspace((state) => state.projects[task.projectId]);
  const lock = taskLockReason(task, project);
  const status = TASK_STATUS[task.status];

  const items: MenuItem[] = lock
    ? [
        {
          label: 'No moves available',
          description: lock,
          disabled: true,
          onSelect: () => undefined,
        },
      ]
    : taskMoves(task, tasks).map(({ to, blocked }) => ({
        label: `Move to ${TASK_STATUS[to].label}`,
        disabled: blocked !== null,
        ...(blocked ? { description: blocked.message } : {}),
        onSelect: () => {
          if (moveTask(task, to)) onMoved?.(to);
        },
      }));

  return (
    <DropdownMenu
      label={`Change status of "${task.title}" (now ${status.label})`}
      align="end"
      menuClassName="w-72"
      triggerClassName={
        variant === 'compact'
          ? 'inline-flex size-7 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-hover hover:text-content'
          : 'inline-flex items-center gap-1 rounded-md transition-colors hover:opacity-85'
      }
      trigger={
        variant === 'compact' ? (
          <ChevronDown className="size-4" aria-hidden="true" />
        ) : (
          <Badge tone={status.tone} className="h-7 px-2 text-xs">
            {status.label}
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Badge>
        )
      }
      items={items}
    />
  );
}
