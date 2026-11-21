import { useId, useMemo, useState, type SyntheticEvent } from 'react';
import { commands } from '@/commands';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { Dialog } from '@/components/Dialog';
import { DepartmentMark, PriorityIcon } from '@/components/Marks';
import { toast } from '@/components/toast/toastStore';
import type { DomainError } from '@/domain/errors';
import type { EmployeeId, TaskId } from '@/domain/ids';
import { checkAssignment } from '@/domain/rules/assignment';
import { isTerminalStatus, USER_ACTOR, type Task } from '@/domain/types';
import { errorTitle } from '@/features/common/commandFeedback';
import { formatDeadline, PRIORITY, TASK_STATUS } from '@/features/common/presentation';
import { useWorkspace } from '@/stores/workspace';

interface AssignExistingTaskDialogProps {
  employeeId: EmployeeId | null;
  onClose: () => void;
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

/**
 * Gives one of the open, unassigned tasks to an employee. Which tasks they can
 * take — and why not — comes from the domain's assignment rules, and the change
 * itself is the ordinary `assignTask` command.
 */
export function AssignExistingTaskDialog({ employeeId, onClose }: AssignExistingTaskDialogProps) {
  return employeeId ? (
    <AssignForm key={employeeId} employeeId={employeeId} onClose={onClose} />
  ) : null;
}

function AssignForm({ employeeId, onClose }: { employeeId: EmployeeId; onClose: () => void }) {
  const workspace = useWorkspace((state) => state);
  const employee = workspace.employees[employeeId];
  const [selected, setSelected] = useState<TaskId | null>(null);
  const [crossDepartment, setCrossDepartment] = useState(false);
  const [error, setError] = useState<DomainError | null>(null);
  const formId = useId();

  const unassigned = useMemo(
    () =>
      Object.values(workspace.tasks)
        .filter(
          (task) =>
            task.assigneeId === null &&
            !isTerminalStatus(task.status) &&
            workspace.projects[task.projectId]?.status !== 'archived',
        )
        .sort(
          (a, b) =>
            PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
            a.createdAt.localeCompare(b.createdAt),
        ),
    [workspace],
  );

  if (!employee) return null;
  const tasks = Object.values(workspace.tasks);
  const own = unassigned.filter((task) => task.departmentId === employee.departmentId);
  const others = unassigned.filter((task) => task.departmentId !== employee.departmentId);
  const department = workspace.departments[employee.departmentId];

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!selected) return;
    const result = commands.assignTask(USER_ACTOR, {
      taskId: selected,
      assigneeId: employeeId,
      allowCrossDepartment: crossDepartment,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`Task assigned to ${employee.name}`, `"${result.value.title}"`);
    onClose();
  };

  const option = (task: Task) => {
    const check = checkAssignment(task, employee, tasks, { allowCrossDepartment: crossDepartment });
    const project = workspace.projects[task.projectId];
    const taskDepartment = workspace.departments[task.departmentId];
    const checked = selected === task.id;
    return (
      <li key={task.id}>
        <label
          className={cn(
            'flex items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
            checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface-raised',
            check.ok ? 'cursor-pointer hover:border-line-strong' : 'cursor-not-allowed opacity-60',
          )}
        >
          <input
            type="radio"
            name={`${formId}-task`}
            value={task.id}
            checked={checked}
            disabled={!check.ok}
            onChange={() => {
              setSelected(task.id);
              setError(null);
            }}
            className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">{task.title}</span>
              <Badge tone={TASK_STATUS[task.status].tone}>{TASK_STATUS[task.status].label}</Badge>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>{project?.name ?? 'Unknown project'}</span>
              <span className="inline-flex items-center gap-1.5">
                {taskDepartment ? <DepartmentMark color={taskDepartment.color} /> : null}
                {taskDepartment?.name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <PriorityIcon priority={task.priority} className="size-3" />
                {PRIORITY[task.priority].label}
              </span>
              {task.deadline ? <span>{formatDeadline(task.deadline)}</span> : null}
            </span>
            {!check.ok ? (
              <span className="mt-1.5 block text-xs text-warning">{check.error.message}</span>
            ) : null}
          </span>
        </label>
      </li>
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Assign a task to ${employee.name}`}
      description="Open tasks that nobody owns yet. Tasks from their own department come first."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" disabled={selected === null}>
            Assign task
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4">
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-sm"
          >
            <p className="font-medium text-danger">{errorTitle(error)}</p>
            <p className="mt-0.5 text-muted">{error.message}</p>
          </div>
        ) : null}

        {unassigned.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            Every open task already has an owner. Create a new task for {employee.name} instead.
          </p>
        ) : (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                {department?.name ?? 'Their department'}{' '}
                <span className="font-normal text-muted">· {own.length}</span>
              </legend>
              {own.length === 0 ? (
                <p className="text-sm text-muted">No unassigned tasks in this department.</p>
              ) : (
                <ul className="flex flex-col gap-2">{own.map(option)}</ul>
              )}
            </fieldset>

            {others.length > 0 ? (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">
                  Other departments{' '}
                  <span className="font-normal text-muted">· {others.length}</span>
                </legend>
                <label className="mb-2 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={crossDepartment}
                    onChange={(event) => {
                      setCrossDepartment(event.target.checked);
                      if (!event.target.checked) setSelected(null);
                    }}
                    className="mt-0.5 size-4 accent-[var(--color-accent)]"
                  />
                  <span>
                    Allow work outside {employee.name}&apos;s department
                    <span className="block text-xs text-subtle">
                      Cross-department help must be chosen explicitly.
                    </span>
                  </span>
                </label>
                <ul className="flex flex-col gap-2">{others.map(option)}</ul>
              </fieldset>
            ) : null}
          </>
        )}
      </form>
    </Dialog>
  );
}
