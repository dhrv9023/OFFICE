import { useMemo } from 'react';
import { Avatar } from '@/components/Avatar';
import { cn } from '@/components/cn';
import { StatusIndicator } from '@/components/StatusIndicator';
import type { EmployeeId } from '@/domain/ids';
import { checkAssignment, checkUnassignment } from '@/domain/rules/assignment';
import type { Task } from '@/domain/types';
import { WORK_STATUS } from '@/features/common/presentation';
import { selectEmployeeSummaries, selectOpenTaskCounts } from '@/stores/selectors';
import { useWorkspace } from '@/stores/workspace';

interface AssigneePickerProps {
  /** The task being assigned (for a new task, a draft with its department and status). */
  task: Task;
  value: EmployeeId | null;
  onChange: (value: EmployeeId | null) => void;
  allowCrossDepartment: boolean;
  onAllowCrossDepartmentChange: (allow: boolean) => void;
}

/**
 * Lists everyone who could take `task`, with role, department, current status and
 * workload. Who is eligible — and why not — comes from the domain's own
 * assignment rules, so the picker can never disagree with the command.
 */
export function AssigneePicker({
  task,
  value,
  onChange,
  allowCrossDepartment,
  onAllowCrossDepartmentChange,
}: AssigneePickerProps) {
  const workspace = useWorkspace((state) => state);
  const { summaries, openCounts, tasks } = useMemo(
    () => ({
      summaries: selectEmployeeSummaries(workspace),
      openCounts: selectOpenTaskCounts(workspace),
      tasks: Object.values(workspace.tasks),
    }),
    [workspace],
  );

  const own = summaries.filter(({ employee }) => employee.departmentId === task.departmentId);
  const others = summaries.filter(({ employee }) => employee.departmentId !== task.departmentId);
  const unassign = checkUnassignment(task);
  const departmentName = workspace.departments[task.departmentId]?.name ?? 'This department';

  const option = (summary: (typeof summaries)[number]) => {
    const { employee, department, status, currentTask } = summary;
    const check = checkAssignment(task, employee, tasks, { allowCrossDepartment });
    const disabled = !check.ok;
    const open = openCounts[employee.id] ?? 0;
    return (
      <label
        key={employee.id}
        className={cn(
          'flex items-start gap-3 rounded-lg border p-2.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
          value === employee.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface-raised',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-line-strong',
        )}
      >
        <input
          type="radio"
          name="assignee"
          className="sr-only"
          checked={value === employee.id}
          disabled={disabled}
          onChange={() => {
            onChange(employee.id);
          }}
        />
        <Avatar avatarId={employee.avatarId} color={department?.color} size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center justify-between gap-x-2">
            <span className="truncate text-sm font-medium">{employee.name}</span>
            <StatusIndicator tone={WORK_STATUS[status].tone} label={WORK_STATUS[status].label} />
          </span>
          <span className="block truncate text-xs text-muted">
            {employee.role} · {department?.name}
          </span>
          <span className="block truncate text-xs text-subtle">
            {open} open {open === 1 ? 'task' : 'tasks'}
            {currentTask ? ` · now: ${currentTask.title}` : ''}
          </span>
          {disabled ? (
            <span className="mt-1 block text-xs text-warning">{check.error.message}</span>
          ) : null}
        </span>
      </label>
    );
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">Assignee</legend>
      <label
        className={cn(
          'flex items-center gap-3 rounded-lg border p-2.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
          value === null ? 'border-accent bg-accent-soft' : 'border-line bg-surface-raised',
          unassign.ok ? 'cursor-pointer hover:border-line-strong' : 'cursor-not-allowed opacity-60',
        )}
      >
        <input
          type="radio"
          name="assignee"
          className="sr-only"
          checked={value === null}
          disabled={!unassign.ok}
          onChange={() => {
            onChange(null);
          }}
        />
        <span className="flex size-9 items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-subtle">
          —
        </span>
        <span>
          <span className="block font-medium">Unassigned</span>
          <span className="block text-xs text-subtle">
            {unassign.ok ? 'Decide later' : unassign.error.message}
          </span>
        </span>
      </label>

      <p className="mt-2 text-xs font-medium text-subtle">{departmentName}</p>
      {own.length > 0 ? (
        own.map(option)
      ) : (
        <p className="text-xs text-muted">Nobody works in this department yet.</p>
      )}

      {others.length > 0 ? (
        <>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowCrossDepartment}
              onChange={(event) => {
                onAllowCrossDepartmentChange(event.target.checked);
              }}
              className="size-4 accent-[var(--color-accent)]"
            />
            Allow someone from another department
          </label>
          {allowCrossDepartment ? (
            <>
              <p className="mt-1 text-xs font-medium text-subtle">Other departments</p>
              {others.map(option)}
            </>
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}
