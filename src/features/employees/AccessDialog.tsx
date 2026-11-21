import { useId, useState, type SyntheticEvent } from 'react';
import { commands } from '@/commands';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { Dialog } from '@/components/Dialog';
import { toast } from '@/components/toast/toastStore';
import type { DomainError } from '@/domain/errors';
import type { EmployeeId } from '@/domain/ids';
import { defaultGrants } from '@/domain/rules/access';
import {
  ACCESS_STATUSES,
  PERMISSION_NAMES,
  PERMISSIONS,
  USER_ACTOR,
  type AccessStatus,
  type Grant,
  type GrantScope,
  type Permission,
} from '@/domain/types';
import { errorTitle } from '@/features/common/commandFeedback';
import { useWorkspace } from '@/stores/workspace';

const STATUS_TEXT: Record<AccessStatus, { label: string; hint: string }> = {
  disabled: { label: 'Disabled', hint: 'Cannot act at all. Every employee starts here.' },
  active: { label: 'Active', hint: 'May act within the grants below.' },
  suspended: { label: 'Suspended', hint: 'Temporarily stopped; grants are kept.' },
};

const SCOPE_TEXT: Record<GrantScope, string> = {
  own: 'Their own',
  department: 'Their department',
  any: 'Anything',
};

/** Fixed by the policy: these always need the founder, whatever the grant says. */
const ALWAYS_APPROVED: Partial<Record<Permission, string>> = {
  'project.delete': 'Always needs your approval',
  'project.change_status': 'Completing or archiving always needs your approval',
  'task.delete': 'Always needs your approval',
  'task.assign': "Taking over someone else's work always needs your approval",
  'employee.rename': 'Always needs your approval',
};

const GROUPS: { label: string; prefix: string }[] = [
  { label: 'Projects', prefix: 'project.' },
  { label: 'Tasks', prefix: 'task.' },
  { label: 'People', prefix: 'employee.' },
  { label: 'Meetings', prefix: 'meeting.' },
];

/**
 * What one AI employee may do. Founder only: the change goes through
 * `updateAccessProfile`, which no employee can be granted.
 */
export function AccessDialog({
  employeeId,
  onClose,
}: {
  employeeId: EmployeeId | null;
  onClose: () => void;
}) {
  return employeeId ? (
    <AccessForm key={employeeId} employeeId={employeeId} onClose={onClose} />
  ) : null;
}

function AccessForm({ employeeId, onClose }: { employeeId: EmployeeId; onClose: () => void }) {
  const employee = useWorkspace((state) => state.employees[employeeId]);
  const profile = useWorkspace((state) => state.accessProfiles[employeeId]);
  const color = useWorkspace((state) =>
    employee ? state.departments[employee.departmentId]?.color : undefined,
  );
  const [status, setStatus] = useState<AccessStatus>(profile?.status ?? 'disabled');
  const [grants, setGrants] = useState<readonly Grant[]>(profile?.grants ?? []);
  const [error, setError] = useState<DomainError | null>(null);
  const formId = useId();
  if (!employee || !profile) return null;

  const grantOf = (permission: Permission) =>
    grants.find((grant) => grant.permission === permission);
  const update = (permission: Permission, next: Grant | null) => {
    setGrants((current) => {
      const others = current.filter((grant) => grant.permission !== permission);
      return next ? [...others, next] : others;
    });
    setError(null);
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const ordered = PERMISSION_NAMES.flatMap((permission) => grantOf(permission) ?? []);
    const result = commands.updateAccessProfile(USER_ACTOR, {
      employeeId,
      status,
      grants: ordered,
    });
    if (!result.ok) {
      if (result.error.code === 'conflict' && result.error.reason === 'no_change') {
        onClose();
        return;
      }
      setError(result.error);
      return;
    }
    toast.success(
      'Access updated',
      `${employee.name}: ${STATUS_TEXT[status].label.toLowerCase()}.`,
    );
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Access for ${employee.name}`}
      description="What this AI employee may do when connected. Only you can change this. No AI is connected yet, so nothing acts on these settings today."
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => {
              setGrants(defaultGrants(employee));
            }}
          >
            Reset to role defaults
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary">
            Save access
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Avatar avatarId={employee.avatarId} color={color} size="lg" />
          <div>
            <p className="font-medium">{employee.name}</p>
            <p className="text-sm text-muted">{employee.role}</p>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-sm"
          >
            <p className="font-medium text-danger">{errorTitle(error)}</p>
            <p className="mt-0.5 text-muted">{error.message}</p>
          </div>
        ) : null}

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Status</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ACCESS_STATUSES.map((option) => (
              <label
                key={option}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                  status === option
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-surface-raised',
                )}
              >
                <input
                  type="radio"
                  name={`${formId}-status`}
                  checked={status === option}
                  onChange={() => {
                    setStatus(option);
                  }}
                  className="mt-0.5 size-4 accent-[var(--color-accent)]"
                />
                <span>
                  <span className="block text-sm font-medium">{STATUS_TEXT[option].label}</span>
                  <span className="block text-xs text-muted">{STATUS_TEXT[option].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {GROUPS.map((group) => (
          <fieldset key={group.prefix}>
            <legend className="mb-2 text-sm font-medium">{group.label}</legend>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {PERMISSION_NAMES.filter(
                (permission) =>
                  permission.startsWith(group.prefix) && !PERMISSIONS[permission].founderOnly,
              ).map((permission) => {
                const definition = PERMISSIONS[permission];
                const granted = grantOf(permission);
                const scopes = definition.scopes as readonly GrantScope[];
                return (
                  <li
                    key={permission}
                    className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
                  >
                    <label className="flex min-w-0 flex-1 items-start gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={granted !== undefined}
                        onChange={(event) => {
                          update(
                            permission,
                            event.target.checked
                              ? { permission, scope: scopes[0] ?? 'any', requiresApproval: false }
                              : null,
                          );
                        }}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
                      />
                      <span>
                        {definition.label}
                        {ALWAYS_APPROVED[permission] ? (
                          <span className="block text-xs text-muted">
                            {ALWAYS_APPROVED[permission]}
                          </span>
                        ) : null}
                      </span>
                    </label>
                    {granted ? (
                      <div className="flex items-center gap-3 pl-6 sm:pl-0">
                        {scopes.length > 1 ? (
                          <label className="flex items-center gap-1.5 text-xs text-muted">
                            <span className="sr-only">Scope for {definition.label}</span>
                            <select
                              value={granted.scope}
                              onChange={(event) => {
                                update(permission, {
                                  ...granted,
                                  scope: event.target.value as GrantScope,
                                });
                              }}
                              className="h-8 rounded-md border border-line-strong/80 bg-surface-sunken px-2 text-xs text-content"
                            >
                              {scopes.map((scope) => (
                                <option key={scope} value={scope}>
                                  {SCOPE_TEXT[scope]}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <span className="text-xs text-muted">
                            {SCOPE_TEXT[scopes[0] ?? 'any']}
                          </span>
                        )}
                        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={granted.requiresApproval}
                            onChange={(event) => {
                              update(permission, {
                                ...granted,
                                requiresApproval: event.target.checked,
                              });
                            }}
                            className="size-3.5 accent-[var(--color-accent)]"
                          />
                          Ask me first
                        </label>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}

        <p className="text-xs text-muted">
          Never grantable: managing access, deciding approvals, your notifications, and workspace
          import, export and reset. Those stay with you.
        </p>
      </form>
    </Dialog>
  );
}
