import {
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Link2,
  Pencil,
  Trash2,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { ROUTES } from '@/app/navigation';
import { commands } from '@/commands';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button, IconButton } from '@/components/Button';
import { cn } from '@/components/cn';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { useModalFocus } from '@/components/overlay';
import { RelativeTime } from '@/components/time';
import type { TaskId } from '@/domain/ids';
import { cancelledDependencies, unresolvedDependencies } from '@/domain/rules/dependencies';
import { USER_ACTOR, type Task, type WorkspaceState } from '@/domain/types';
import { reportCommand } from '@/features/common/commandFeedback';
import { isOverdue } from '@/domain/rules/deadlines';
import {
  formatDate,
  formatDay,
  PRIORITY,
  TASK_STATUS,
  todayIso,
} from '@/features/common/presentation';
import { selectDependents, selectTaskActivity } from '@/stores/selectors';
import { useWorkspace } from '@/stores/workspace';
import { AssignTaskDialog } from './AssignTaskDialog';
import { TaskFormDialog } from './TaskFormDialog';
import { taskLockReason } from './taskMoves';
import { TaskStatusMenu } from './TaskStatusMenu';
import { useTaskLink } from './taskLink';

/** Task details as a side sheet, opened from anywhere with `?task=<id>`. */
export function TaskDetailsDrawer() {
  const { openTaskId, open, close } = useTaskLink();
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel, openTaskId !== null, close);
  if (openTaskId === null) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 animate-fade-in bg-overlay"
        aria-hidden="true"
        onClick={close}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-details-title"
        tabIndex={-1}
        className="relative flex h-full w-full max-w-xl animate-pop-in flex-col border-l border-line bg-popover shadow-overlay focus:outline-none"
      >
        <TaskDetails taskId={openTaskId} onOpenTask={open} onClose={close} />
      </div>
    </div>,
    document.body,
  );
}

function TaskDetails({
  taskId,
  onOpenTask,
  onClose,
}: {
  taskId: TaskId;
  onOpenTask: (taskId: TaskId) => void;
  onClose: () => void;
}) {
  const workspace = useWorkspace((state) => state);
  const task = workspace.tasks[taskId];
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!task) {
    return (
      <>
        <div className="flex justify-end p-3">
          <IconButton icon={X} label="Close task" onClick={onClose} />
        </div>
        <h2 id="task-details-title" className="sr-only">
          Task not found
        </h2>
        <EmptyState
          icon={CircleSlash}
          title="This task no longer exists"
          description="It may have been deleted, or the link is out of date."
        />
      </>
    );
  }

  const project = workspace.projects[task.projectId];
  const lock = taskLockReason(task, project);
  const projectArchived = project?.status === 'archived';

  const remove = () => {
    const result = reportCommand(commands.deleteTask(USER_ACTOR, { taskId: task.id }), {
      title: 'Task deleted',
      description: `"${task.title}"`,
    });
    setDeleting(false);
    if (result.ok) onClose();
  };

  return (
    <>
      <div className="flex items-start gap-3 border-b border-line px-6 py-5">
        <div className="min-w-0 flex-1">
          {project ? (
            <Link
              to={`${ROUTES.projects}/${project.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-content"
            >
              {project.name}
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          ) : null}
          <h2
            id="task-details-title"
            className="mt-1.5 text-xl leading-snug font-semibold tracking-[-0.016em] break-words"
          >
            {task.title}
          </h2>
        </div>
        <IconButton icon={X} label="Close task" onClick={onClose} className="-mt-1 -mr-2" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusMenu task={task} />
          <Button
            size="sm"
            icon={UserRoundPlus}
            disabled={lock !== null}
            onClick={() => {
              setAssigning(true);
            }}
          >
            {task.assigneeId ? 'Reassign' : 'Assign'}
          </Button>
          <Button
            size="sm"
            icon={Pencil}
            disabled={lock !== null}
            onClick={() => {
              setEditing(true);
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            className="text-danger hover:text-danger"
            onClick={() => {
              setDeleting(true);
            }}
          >
            Delete
          </Button>
        </div>
        {lock ? <p className="mt-2 text-xs text-muted">{lock}</p> : null}

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Detail label="Assignee" wide>
            <Assignee task={task} workspace={workspace} />
          </Detail>
          <Detail label="Department">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-[3px]"
                style={{ backgroundColor: workspace.departments[task.departmentId]?.color }}
              />
              {workspace.departments[task.departmentId]?.name ?? 'Unknown'}
            </span>
          </Detail>
          <Detail label="Priority">
            <Badge tone={PRIORITY[task.priority].tone}>{PRIORITY[task.priority].label}</Badge>
          </Detail>
          <Detail label="Deadline">
            {task.deadline ? (
              isOverdue(task, todayIso()) ? (
                <span className="font-medium text-danger">
                  Overdue · {formatDay(task.deadline)}
                </span>
              ) : (
                formatDay(task.deadline)
              )
            ) : (
              <span className="text-muted">None</span>
            )}
          </Detail>
          {task.status === 'blocked' ? (
            <Detail label="Blocked because" wide>
              {task.blockedReason ?? <span className="text-muted">No reason was given</span>}
            </Detail>
          ) : null}
          <Detail label="Created">{formatDate(task.createdAt)}</Detail>
          <Detail label="Updated">
            <RelativeTime iso={task.updatedAt} />
          </Detail>
        </dl>

        <Section title="Description">
          {task.description ? (
            <p className="text-sm whitespace-pre-wrap text-muted">{task.description}</p>
          ) : (
            <p className="text-sm text-subtle">No description.</p>
          )}
        </Section>

        <Dependencies task={task} workspace={workspace} onOpenTask={onOpenTask} />

        <History task={task} workspace={workspace} />
      </div>

      <TaskFormDialog
        open={editing && !projectArchived}
        task={task}
        onClose={() => {
          setEditing(false);
        }}
      />
      <AssignTaskDialog
        open={assigning}
        task={task}
        onClose={() => {
          setAssigning(false);
        }}
      />
      <ConfirmDialog
        open={deleting}
        tone="danger"
        title="Delete this task?"
        description={`"${task.title}" will be removed. Tasks that depend on it lose that dependency. Its history stays in the activity log.`}
        confirmLabel="Delete task"
        onCancel={() => {
          setDeleting(false);
        }}
        onConfirm={remove}
      />
    </>
  );
}

function Detail({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2')}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-2.5 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Assignee({ task, workspace }: { task: Task; workspace: WorkspaceState }) {
  const employee = task.assigneeId ? workspace.employees[task.assigneeId] : undefined;
  if (!employee) return <span className="text-muted">Unassigned</span>;
  const department = workspace.departments[employee.departmentId];
  const outside = employee.departmentId !== task.departmentId;
  return (
    <span className="flex items-center gap-2.5">
      <Avatar avatarId={employee.avatarId} color={department?.color} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{employee.name}</span>
        <span className="block truncate text-xs text-muted">
          {employee.role} · {department?.name}
          {outside ? ' · from another department' : ''}
        </span>
      </span>
    </span>
  );
}

function Dependencies({
  task,
  workspace,
  onOpenTask,
}: {
  task: Task;
  workspace: WorkspaceState;
  onOpenTask: (taskId: TaskId) => void;
}) {
  const unresolved = unresolvedDependencies(task, workspace.tasks);
  const cancelled = cancelledDependencies(task, workspace.tasks);
  const dependents = useMemo(() => selectDependents(workspace, task.id), [workspace, task.id]);

  const summary =
    task.dependencies.length === 0
      ? null
      : unresolved.length === 0
        ? { tone: 'text-success', text: 'All dependencies are done.' }
        : {
            tone: 'text-warning',
            text: `Waiting on ${unresolved.length} of ${task.dependencies.length}.${cancelled.length > 0 ? ' A cancelled dependency never counts as done: edit the task to remove or replace it.' : ''}`,
          };

  const row = (id: TaskId) => {
    const other = workspace.tasks[id];
    if (!other) return null;
    const Icon =
      other.status === 'done'
        ? CircleCheck
        : other.status === 'cancelled'
          ? CircleSlash
          : CircleDashed;
    return (
      <li key={id}>
        <button
          type="button"
          onClick={() => {
            onOpenTask(id);
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
        >
          <Icon
            className={cn(
              'size-4 shrink-0',
              other.status === 'done' ? 'text-success' : 'text-subtle',
              other.status === 'cancelled' && 'text-warning',
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">{other.title}</span>
          <Badge tone={TASK_STATUS[other.status].tone}>{TASK_STATUS[other.status].label}</Badge>
        </button>
      </li>
    );
  };

  return (
    <Section title="Dependencies">
      {task.dependencies.length === 0 ? (
        <p className="text-sm text-subtle">
          <Link2 className="mr-1 inline size-3.5" aria-hidden="true" />
          This task does not depend on anything.
        </p>
      ) : (
        <>
          {summary ? <p className={cn('mb-1.5 text-xs', summary.tone)}>{summary.text}</p> : null}
          <ul>{task.dependencies.map(row)}</ul>
        </>
      )}
      {dependents.length > 0 ? (
        <>
          <p className="mt-3 mb-1 text-xs text-subtle">
            {dependents.length} open {dependents.length === 1 ? 'task waits' : 'tasks wait'} on this
            one
          </p>
          <ul>{dependents.map((dependent) => row(dependent.id))}</ul>
        </>
      ) : null}
    </Section>
  );
}

function History({ task, workspace }: { task: Task; workspace: WorkspaceState }) {
  const events = useMemo(() => selectTaskActivity(workspace, task.id), [workspace, task.id]);
  const actorName = (actorId: string) =>
    actorId === 'user'
      ? 'You'
      : actorId === 'system'
        ? 'System'
        : (workspace.employees[actorId as keyof WorkspaceState['employees']]?.name ?? 'Unknown');

  return (
    <Section title="History">
      {events.length === 0 ? (
        <p className="text-sm text-subtle">No history yet.</p>
      ) : (
        <ol className="relative flex flex-col gap-3 before:absolute before:top-2 before:bottom-2 before:left-[4px] before:w-px before:bg-line">
          {events.map((event) => (
            <li key={event.id} className="relative pl-5">
              <span
                aria-hidden="true"
                className="absolute top-1.5 left-0 size-[9px] rounded-full border-2 border-surface bg-secondary"
              />
              <p className="text-sm">{event.description}</p>
              <p className="text-xs text-subtle">
                {actorName(event.actorId)} · <RelativeTime iso={event.timestamp} />
              </p>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
