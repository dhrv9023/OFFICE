import { CalendarDays, CalendarX2, GripVertical, Link2 } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { Avatar } from '@/components/Avatar';
import { cn } from '@/components/cn';
import { DepartmentMark, PriorityIcon } from '@/components/Marks';
import type { TaskId } from '@/domain/ids';
import { unresolvedDependencies } from '@/domain/rules/dependencies';
import { TASK_STATUSES, type Task, type TaskStatus, type WorkspaceState } from '@/domain/types';
import { isOverdue } from '@/domain/rules/deadlines';
import { formatDeadline, PRIORITY, TASK_STATUS, todayIso } from '@/features/common/presentation';
import { useWorkspace } from '@/stores/workspace';
import { moveTask } from './moveTask';
import { checkMove, taskLockReason } from './taskMoves';
import { TaskStatusMenu } from './TaskStatusMenu';

const COLUMN_ACCENT: Record<TaskStatus, string> = {
  todo: 'bg-subtle',
  in_progress: 'bg-accent',
  in_review: 'bg-secondary',
  blocked: 'bg-danger',
  done: 'bg-success',
  cancelled: 'bg-line-strong',
};

interface KanbanBoardProps {
  /** The tasks to show (already filtered). */
  tasks: readonly Task[];
  onOpenTask: (taskId: TaskId) => void;
}

/**
 * One column per task status. Cards can be dragged between columns; while
 * dragging, every column is checked against the domain rules so the user sees
 * where the card can go. A drop runs `changeTaskStatus`; if the command refuses,
 * the store is untouched, so the card stays where it was and the reason is shown.
 * Each card also has a status menu for keyboard and touch users.
 */
export function KanbanBoard({ tasks, onOpenTask }: KanbanBoardProps) {
  const workspace = useWorkspace((state) => state);
  const [dragging, setDragging] = useState<TaskId | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const dragged = dragging ? workspace.tasks[dragging] : undefined;

  const drop = (status: TaskStatus, taskId: TaskId | null) => {
    setDragging(null);
    setOver(null);
    const task = taskId ? workspace.tasks[taskId] : undefined;
    if (!task || task.status === status) return;
    if (moveTask(task, status)) {
      setAnnouncement(`Moved "${task.title}" to ${TASK_STATUS[status].label}.`);
    }
  };

  return (
    <>
      <div
        role="region"
        aria-label="Task board"
        tabIndex={0}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-10 lg:scroll-px-10 lg:px-10"
      >
        {TASK_STATUSES.map((status) => {
          const column = tasks.filter((task) => task.status === status);
          const blocked =
            dragged && dragged.status !== status
              ? checkMove(dragged, status, workspace.tasks)
              : null;
          const state = !dragged
            ? 'idle'
            : dragged.status === status
              ? 'origin'
              : blocked
                ? 'blocked'
                : 'allowed';
          const headingId = `board-column-${status}`;

          return (
            <section
              key={status}
              aria-labelledby={headingId}
              data-drop-state={state}
              onDragOver={(event: DragEvent) => {
                if (!dragged) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (over !== status) setOver(status);
              }}
              onDragLeave={(event: DragEvent) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setOver(null);
              }}
              onDrop={(event: DragEvent) => {
                event.preventDefault();
                drop(status, dragging ?? (event.dataTransfer.getData('text/plain') as TaskId));
              }}
              className={cn(
                'flex w-[18rem] shrink-0 snap-start flex-col rounded-xl border bg-surface-sunken transition-colors duration-150',
                state === 'idle' || state === 'origin' ? 'border-transparent' : '',
                state === 'allowed' && 'border-dashed border-accent/60',
                state === 'allowed' &&
                  over === status &&
                  'border-solid border-accent bg-accent-soft',
                state === 'blocked' && 'border-dashed border-line opacity-60',
              )}
            >
              <div className="flex items-center gap-2 px-3 pt-3 pb-2.5">
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full', COLUMN_ACCENT[status])}
                />
                <h2 id={headingId} className="text-sm font-semibold">
                  {TASK_STATUS[status].label}
                </h2>
                <span className="text-sm text-muted tabular-nums">{column.length}</span>
              </div>

              {state === 'blocked' && over === status && blocked ? (
                <p
                  role="status"
                  className="mx-3 mb-2 rounded-md bg-surface px-2 py-1.5 text-xs text-warning"
                >
                  {blocked.message}
                </p>
              ) : null}

              <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {column.map((task) => (
                  <li key={task.id}>
                    <TaskCard
                      task={task}
                      workspace={workspace}
                      dragging={dragging === task.id}
                      onOpen={onOpenTask}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', task.id);
                        event.dataTransfer.effectAllowed = 'move';
                        setDragging(task.id);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      onMoved={(to) => {
                        setAnnouncement(`Moved "${task.title}" to ${TASK_STATUS[to].label}.`);
                      }}
                    />
                  </li>
                ))}
                {column.length === 0 ? (
                  <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-subtle">
                    {state === 'allowed' ? 'Drop here' : 'No tasks'}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

interface TaskCardProps {
  task: Task;
  workspace: WorkspaceState;
  dragging: boolean;
  onOpen: (taskId: TaskId) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
  onMoved: (to: TaskStatus) => void;
}

function TaskCard({
  task,
  workspace,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
  onMoved,
}: TaskCardProps) {
  const project = workspace.projects[task.projectId];
  const department = workspace.departments[task.departmentId];
  const assignee = task.assigneeId ? workspace.employees[task.assigneeId] : undefined;
  const assigneeDepartment = assignee ? workspace.departments[assignee.departmentId] : undefined;
  const waiting = unresolvedDependencies(task, workspace.tasks).length;
  const movable = taskLockReason(task, project) === null;

  return (
    <article
      draggable={movable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={task.title}
      className={cn(
        'group rounded-lg border border-line bg-card p-3.5 shadow-card transition-[opacity,border-color,transform] duration-150 hover:border-line-strong',
        movable && 'cursor-grab active:cursor-grabbing',
        dragging && 'scale-[0.98] opacity-50',
        task.status === 'cancelled' && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-1.5">
        {movable ? (
          <GripVertical
            className="mt-0.5 -ml-1 size-4 shrink-0 text-line-strong group-hover:text-subtle"
            aria-hidden="true"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{project?.name}</p>
          <button
            type="button"
            onClick={() => {
              onOpen(task.id);
            }}
            className={cn(
              'mt-0.5 block w-full text-left text-sm leading-snug font-medium break-words hover:text-accent-strong',
              task.status === 'cancelled' && 'line-through decoration-subtle',
            )}
          >
            {task.title}
          </button>
        </div>
        <TaskStatusMenu task={task} variant="compact" onMoved={onMoved} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <PriorityIcon priority={task.priority} className="size-3" />
          {PRIORITY[task.priority].label}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {department ? <DepartmentMark color={department.color} className="size-2" /> : null}
          <span className="truncate">{department?.name}</span>
        </span>
        {task.deadline ? (
          isOverdue(task, todayIso()) ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-danger">
              <CalendarX2 className="size-3" aria-hidden="true" />
              Overdue · {formatDeadline(task.deadline)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3" aria-hidden="true" />
              {formatDeadline(task.deadline)}
            </span>
          )
        ) : null}
      </div>
      {task.status === 'blocked' && task.blockedReason ? (
        <p className="mt-2 line-clamp-2 rounded-md bg-danger/10 px-2 py-1 text-xs text-content">
          <span className="font-medium text-danger">Blocked: </span>
          {task.blockedReason}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        {assignee ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs">
            <Avatar avatarId={assignee.avatarId} color={assigneeDepartment?.color} size="sm" />
            <span className="truncate">{assignee.name}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden="true"
              className="size-6 rounded-md border border-dashed border-line-strong"
            />
            Unassigned
          </span>
        )}
        {task.dependencies.length > 0 ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 text-xs',
              waiting > 0 ? 'text-warning' : 'text-success',
            )}
          >
            <Link2 className="size-3.5" aria-hidden="true" />
            <span aria-hidden="true">
              {task.dependencies.length - waiting}/{task.dependencies.length}
            </span>
            <span className="sr-only">
              {waiting > 0
                ? `Waiting on ${waiting} of ${task.dependencies.length} dependencies`
                : 'All dependencies done'}
            </span>
          </span>
        ) : null}
      </div>
    </article>
  );
}
