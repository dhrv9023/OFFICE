import { useId, useState, type SyntheticEvent } from 'react';
import { commands } from '@/commands';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Input } from '@/components/Field';
import { toast } from '@/components/toast/toastStore';
import type { DomainError } from '@/domain/errors';
import type { EmployeeId } from '@/domain/ids';
import { LIMITS } from '@/domain/rules/validation';
import { USER_ACTOR } from '@/domain/types';
import { errorTitle, fieldError } from '@/features/common/commandFeedback';
import { useWorkspace } from '@/stores/workspace';

interface RenameEmployeeDialogProps {
  employeeId: EmployeeId | null;
  onClose: () => void;
}

/**
 * Changes an employee's display name through the `renameEmployee` command. The
 * rules (trimming, length, single line) live in the domain; this form only shows
 * what the command says.
 */
export function RenameEmployeeDialog({ employeeId, onClose }: RenameEmployeeDialogProps) {
  // Remount per employee so the field always starts from their current name.
  return employeeId ? (
    <RenameForm key={employeeId} employeeId={employeeId} onClose={onClose} />
  ) : null;
}

function RenameForm({ employeeId, onClose }: { employeeId: EmployeeId; onClose: () => void }) {
  const employee = useWorkspace((state) => state.employees[employeeId]);
  const color = useWorkspace((state) =>
    employee ? state.departments[employee.departmentId]?.color : undefined,
  );
  const [name, setName] = useState(employee?.name ?? '');
  const [error, setError] = useState<DomainError | null>(null);
  const formId = useId();

  if (!employee) return null;
  const current = employee.name;
  const length = name.trim().length;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = commands.renameEmployee(USER_ACTOR, { employeeId, name });
    if (!result.ok) {
      if (result.error.code === 'conflict' && result.error.reason === 'no_change') {
        onClose();
        return;
      }
      setError(result.error);
      return;
    }
    toast.success('Employee renamed', `${current} is now ${result.value.name}.`);
    onClose();
  };

  const nameError = fieldError(error, 'name');
  const otherError = error && !nameError ? error : null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Rename employee"
      description="Changes the name shown everywhere. Their role, desk, tasks and history stay the same."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary">
            Save changes
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-raised p-3">
          <Avatar avatarId={employee.avatarId} color={color} size="lg" />
          <div className="min-w-0">
            <p className="text-xs text-muted">Current name</p>
            <p className="font-medium break-words">{current}</p>
            <p className="text-xs text-muted">{employee.role}</p>
          </div>
        </div>

        {otherError ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-sm"
          >
            <p className="font-medium text-danger">{errorTitle(otherError)}</p>
            <p className="mt-0.5 text-muted">{otherError.message}</p>
          </div>
        ) : null}

        <Input
          label="New name"
          value={name}
          autoComplete="off"
          spellCheck={false}
          data-autofocus
          error={nameError}
          hint={`${String(length)} / ${String(LIMITS.employeeName)} characters. Spaces, hyphens and accents are fine.`}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
        />
      </form>
    </Dialog>
  );
}
