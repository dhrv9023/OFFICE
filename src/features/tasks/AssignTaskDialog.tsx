import { useId, useState, type SyntheticEvent } from 'react';
import { commands } from '@/commands';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { toast } from '@/components/toast/toastStore';
import type { DomainError } from '@/domain/errors';
import type { EmployeeId } from '@/domain/ids';
import { USER_ACTOR, type Task } from '@/domain/types';
import { errorTitle } from '@/features/common/commandFeedback';
import { useWorkspace } from '@/stores/workspace';
import { AssigneePicker } from './AssigneePicker';

interface AssignTaskDialogProps {
  task: Task;
  open: boolean;
  onClose: () => void;
}

export function AssignTaskDialog(props: AssignTaskDialogProps) {
  return props.open ? <AssignForm {...props} /> : null;
}

function AssignForm({ task, onClose }: AssignTaskDialogProps) {
  const employees = useWorkspace((state) => state.employees);
  const current = task.assigneeId ? employees[task.assigneeId] : undefined;
  const [assignee, setAssignee] = useState<EmployeeId | null>(task.assigneeId);
  const [crossDepartment, setCrossDepartment] = useState(
    current !== undefined && current.departmentId !== task.departmentId,
  );
  const [error, setError] = useState<DomainError | null>(null);
  const formId = useId();

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (assignee === task.assigneeId) {
      onClose();
      return;
    }
    const result = commands.assignTask(USER_ACTOR, {
      taskId: task.id,
      assigneeId: assignee,
      allowCrossDepartment: crossDepartment,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const name = assignee ? (employees[assignee]?.name ?? 'the new assignee') : null;
    toast.success(
      name ? (current ? 'Task reassigned' : 'Task assigned') : 'Task unassigned',
      name ? `"${task.title}" is now with ${name}.` : `"${task.title}" has no assignee.`,
    );
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={current ? 'Reassign task' : 'Assign task'}
      description={`"${task.title}"`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary">
            {assignee === null ? 'Save' : current ? 'Reassign' : 'Assign'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-sm"
          >
            <p className="font-medium text-danger">{errorTitle(error)}</p>
            <p className="mt-0.5 text-muted">{error.message}</p>
          </div>
        ) : null}
        <AssigneePicker
          task={task}
          value={assignee}
          onChange={setAssignee}
          allowCrossDepartment={crossDepartment}
          onAllowCrossDepartmentChange={setCrossDepartment}
        />
      </form>
    </Dialog>
  );
}
