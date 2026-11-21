import { useId, useMemo, useState, type SyntheticEvent } from 'react';
import { commands } from '@/commands';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Input, Select, Textarea } from '@/components/Field';
import { toast } from '@/components/toast/toastStore';
import type { DomainError } from '@/domain/errors';
import type { DepartmentId, EmployeeId, ProjectId, TaskId } from '@/domain/ids';
import {
  PRIORITIES,
  USER_ACTOR,
  type Priority,
  type Task,
  type WorkspaceState,
} from '@/domain/types';
import { errorTitle, fieldError } from '@/features/common/commandFeedback';
import { PRIORITY, TASK_STATUS } from '@/features/common/presentation';
import { useWorkspace } from '@/stores/workspace';
import { AssigneePicker } from './AssigneePicker';

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Edit this task; omit to create a new one. */
  task?: Task | undefined;
  /** Preselected project for a new task. */
  projectId?: ProjectId | undefined;
  /**
   * Preselected assignee for a new task (e.g. from the office). Their department
   * becomes the task's department; both can still be changed in the form.
   */
  assigneeId?: EmployeeId | undefined;
  /** Called with the saved task. */
  onSaved?: (task: Task) => void;
}

/** Projects that can take new tasks (not archived, not completed). */
function openProjects(state: WorkspaceState) {
  return Object.values(state.projects)
    .filter((project) => project.status !== 'archived' && project.status !== 'completed')
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function TaskFormDialog(props: TaskFormDialogProps) {
  // Remount on open so the form always starts from the task's current values.
  return props.open ? <TaskForm {...props} /> : null;
}

function TaskForm({ onClose, task, projectId, assigneeId, onSaved }: TaskFormDialogProps) {
  const workspace = useWorkspace((state) => state);
  const projects = useMemo(() => openProjects(workspace), [workspace]);
  const departments = Object.values(workspace.departments);
  const formId = useId();

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [project, setProject] = useState<ProjectId | ''>(
    task?.projectId ?? projectId ?? projects[0]?.id ?? '',
  );
  const preselected = assigneeId ? workspace.employees[assigneeId] : undefined;
  const [department, setDepartment] = useState<DepartmentId>(
    task?.departmentId ?? preselected?.departmentId ?? departments[0]?.id ?? ('' as DepartmentId),
  );
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [deadline, setDeadline] = useState(task?.deadline ?? '');
  const [assignee, setAssignee] = useState<EmployeeId | null>(preselected?.id ?? null);
  const [crossDepartment, setCrossDepartment] = useState(false);
  const [dependencies, setDependencies] = useState<readonly TaskId[]>(task?.dependencies ?? []);
  const [error, setError] = useState<DomainError | null>(null);

  const candidates = Object.values(workspace.tasks)
    .filter((other) => other.projectId === project && other.id !== task?.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const assigneeDepartment = task?.assigneeId
    ? workspace.employees[task.assigneeId]?.departmentId
    : undefined;
  const departmentLeavesAssignee =
    task !== undefined && assigneeDepartment !== undefined && assigneeDepartment !== department;

  // A not-yet-created task, so the assignee picker can apply the real assignment rules.
  const draft: Task = {
    id: 'task_draft',
    projectId: project || 'prj_none',
    departmentId: department,
    assigneeId: null,
    title,
    description,
    priority,
    status: 'todo',
    dependencies,
    deadline: null,
    blockedReason: null,
    createdAt: '',
    updatedAt: '',
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setError(null);
    const result = task
      ? commands.updateTask(USER_ACTOR, {
          taskId: task.id,
          patch: {
            ...(title !== task.title ? { title } : {}),
            ...(description !== task.description ? { description } : {}),
            ...(priority !== task.priority ? { priority } : {}),
            ...((deadline || null) !== task.deadline ? { deadline: deadline || null } : {}),
            ...(department !== task.departmentId ? { departmentId: department } : {}),
            ...(dependencies.join() !== task.dependencies.join() ? { dependencies } : {}),
          },
          allowCrossDepartment: crossDepartment,
        })
      : project === ''
        ? null
        : commands.createTask(USER_ACTOR, {
            projectId: project,
            departmentId: department,
            title,
            description,
            priority,
            deadline: deadline || null,
            assigneeId: assignee,
            dependencies,
            allowCrossDepartment: crossDepartment,
          });

    if (result === null) return;
    if (!result.ok) {
      if (result.error.code === 'conflict' && result.error.reason === 'no_change') {
        onClose();
        return;
      }
      setError(result.error);
      return;
    }
    const owner = result.value.assigneeId
      ? workspace.employees[result.value.assigneeId]
      : undefined;
    toast.success(
      task ? 'Task updated' : owner ? `Task assigned to ${owner.name}` : 'Task created',
      `"${result.value.title}"`,
    );
    onSaved?.(result.value);
    onClose();
  };

  const formLevelError =
    error && !['title', 'description', 'priority', 'deadline'].includes(fieldName(error))
      ? error
      : null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={task ? 'Edit task' : preselected ? `New task for ${preselected.name}` : 'New task'}
      description={
        task
          ? 'Status and assignee are changed from the task itself.'
          : preselected
            ? `${preselected.name} is preselected as the assignee. New tasks start in "To do".`
            : 'New tasks start in "To do".'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" disabled={!task && project === ''}>
            {task ? 'Save changes' : 'Create task'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formLevelError ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-sm"
          >
            <p className="font-medium text-danger">{errorTitle(formLevelError)}</p>
            <p className="mt-0.5 text-muted">{formLevelError.message}</p>
          </div>
        ) : null}

        <Input
          label="Title"
          value={title}
          maxLength={140}
          required
          data-autofocus
          error={fieldError(error, 'title')}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        <Textarea
          label="Description"
          hint="Optional. What needs to happen and what done looks like."
          value={description}
          error={fieldError(error, 'description')}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {task ? (
            <Input
              label="Project"
              value={workspace.projects[task.projectId]?.name ?? ''}
              disabled
            />
          ) : projects.length === 0 ? (
            <p className="text-sm text-muted sm:col-span-2">
              There is no project that can take tasks. Create a project, or reopen one, first.
            </p>
          ) : (
            <Select
              label="Project"
              value={project}
              options={projects.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(event) => {
                setProject(event.target.value as ProjectId);
                setDependencies([]);
              }}
            />
          )}
          <Select
            label="Department"
            value={department}
            options={departments.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(event) => {
              setDepartment(event.target.value as DepartmentId);
              setAssignee(null);
            }}
          />
          <Select
            label="Priority"
            value={priority}
            error={fieldError(error, 'priority')}
            options={PRIORITIES.map((value) => ({ value, label: PRIORITY[value].label }))}
            onChange={(event) => {
              setPriority(event.target.value as Priority);
            }}
          />
          <Input
            label="Deadline"
            type="date"
            hint="Optional."
            value={deadline}
            error={fieldError(error, 'deadline')}
            onChange={(event) => {
              setDeadline(event.target.value);
            }}
          />
        </div>

        {task ? (
          departmentLeavesAssignee ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={crossDepartment}
                onChange={(event) => {
                  setCrossDepartment(event.target.checked);
                }}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span>
                Keep the current assignee although they work in another department
                <span className="block text-xs text-subtle">
                  Otherwise reassign the task before moving it.
                </span>
              </span>
            </label>
          ) : null
        ) : (
          <AssigneePicker
            task={draft}
            value={assignee}
            onChange={setAssignee}
            allowCrossDepartment={crossDepartment}
            onAllowCrossDepartmentChange={(allow) => {
              setCrossDepartment(allow);
              if (!allow) setAssignee(null);
            }}
          />
        )}

        <fieldset>
          <legend className="text-sm font-medium">Depends on</legend>
          <p className="mt-0.5 text-xs text-subtle">
            This task cannot start until every task ticked here is done.
          </p>
          {candidates.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No other tasks in this project yet.</p>
          ) : (
            <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-1.5">
              {candidates.map((other) => (
                <li key={other.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface-hover">
                    <input
                      type="checkbox"
                      checked={dependencies.includes(other.id)}
                      onChange={(event) => {
                        setDependencies((current) =>
                          event.target.checked
                            ? [...current, other.id]
                            : current.filter((id) => id !== other.id),
                        );
                      }}
                      className="size-4 shrink-0 accent-[var(--color-accent)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{other.title}</span>
                    <Badge tone={TASK_STATUS[other.status].tone}>
                      {TASK_STATUS[other.status].label}
                    </Badge>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}

function fieldName(error: DomainError): string {
  return error.code === 'validation' ? error.field : '';
}
