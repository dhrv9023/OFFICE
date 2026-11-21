import { useId, useState, type SyntheticEvent } from 'react';
import { commands } from '@/commands';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Textarea } from '@/components/Field';
import { toast } from '@/components/toast/toastStore';
import type { DomainError } from '@/domain/errors';
import type { TaskId } from '@/domain/ids';
import { useBlockPrompt } from './blockPrompt';
import { LIMITS } from '@/domain/rules/validation';
import { USER_ACTOR } from '@/domain/types';
import { errorTitle, fieldError } from '@/features/common/commandFeedback';
import { useWorkspace } from '@/stores/workspace';

/** Mounted once in the shell. Runs `changeTaskStatus` with the reason given. */
export function BlockTaskDialog() {
  const taskId = useBlockPrompt((state) => state.taskId);
  const close = () => {
    useBlockPrompt.setState({ taskId: null });
  };
  return taskId ? <BlockForm key={taskId} taskId={taskId} onClose={close} /> : null;
}

function BlockForm({ taskId, onClose }: { taskId: TaskId; onClose: () => void }) {
  const task = useWorkspace((state) => state.tasks[taskId]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<DomainError | null>(null);
  const formId = useId();
  if (!task) return null;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = commands.changeTaskStatus(USER_ACTOR, {
      taskId,
      status: 'blocked',
      reason,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Task blocked', `"${task.title}"${reason.trim() ? `: ${reason.trim()}` : ''}`);
    onClose();
  };

  const reasonError = fieldError(error, 'reason');
  return (
    <Dialog
      open
      onClose={onClose}
      title="Mark as blocked"
      description={`"${task.title}". Saying why helps whoever unblocks it. The reason is shown on the task until it moves on.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary">
            Mark as blocked
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-3">
        {error && !reasonError ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-sm"
          >
            <p className="font-medium text-danger">{errorTitle(error)}</p>
            <p className="mt-0.5 text-muted">{error.message}</p>
          </div>
        ) : null}
        <Textarea
          label="Reason"
          hint={`Optional. Up to ${String(LIMITS.reason)} characters.`}
          value={reason}
          data-autofocus
          error={reasonError}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </form>
    </Dialog>
  );
}
