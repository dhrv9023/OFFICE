import { useId, useState, type SyntheticEvent } from 'react';
import { commands } from '@/commands';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Textarea } from '@/components/Field';
import { toast } from '@/components/toast/toastStore';
import type { DomainError } from '@/domain/errors';
import { USER_ACTOR, type Meeting } from '@/domain/types';
import { errorTitle, fieldError } from '@/features/common/commandFeedback';

/** Marks a scheduled meeting as held, with the founder's own notes. */
export function CompleteMeetingDialog({
  meeting,
  onClose,
}: {
  meeting: Meeting | null;
  onClose: () => void;
}) {
  return meeting ? <CompleteForm key={meeting.id} meeting={meeting} onClose={onClose} /> : null;
}

function CompleteForm({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<DomainError | null>(null);
  const formId = useId();

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = commands.completeMeeting(USER_ACTOR, { meetingId: meeting.id, notes });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success('Meeting recorded', `"${meeting.title}" is marked as held.`);
    onClose();
  };

  const notesError = fieldError(error, 'notes');
  return (
    <Dialog
      open
      onClose={onClose}
      title="Mark as held"
      description={`"${meeting.title}". Write down what was discussed or decided. Only you write these notes.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary">
            Mark as held
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-3">
        {error && !notesError ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-sm"
          >
            <p className="font-medium text-danger">{errorTitle(error)}</p>
            <p className="mt-0.5 text-muted">{error.message}</p>
          </div>
        ) : null}
        <Textarea
          label="Notes"
          hint="Optional. Decisions, follow-ups, who does what."
          value={notes}
          data-autofocus
          error={notesError}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
        />
      </form>
    </Dialog>
  );
}
