import { conflict, notFound } from '@/domain/errors';
import type { EmployeeId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import { validateGrants } from '@/domain/rules/access';
import {
  ACCESS_STATUSES,
  PERMISSIONS,
  type AccessProfile,
  type AccessStatus,
  type Grant,
} from '@/domain/types';
import { activityEvent, checkActor, commit } from '../support';
import type { CommandHandler } from '../types';

export interface UpdateAccessProfileInput {
  readonly employeeId: EmployeeId;
  readonly status?: AccessStatus | undefined;
  /** The complete new list of grants (replaces the old one). */
  readonly grants?: readonly Grant[] | undefined;
}

const STATUS_TEXT: Record<AccessStatus, string> = {
  disabled: 'disabled',
  active: 'enabled',
  suspended: 'suspended',
};

/**
 * Changes what an AI employee may do. Founder only (`access.manage` can never be
 * granted), enforced by the command layer before this runs. Founder-only
 * permissions and out-of-range scopes are refused.
 */
export const updateAccessProfile: CommandHandler<UpdateAccessProfileInput, AccessProfile> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;
  const employee = state.employees[input.employeeId];
  if (!employee) return err(notFound('employee', input.employeeId));
  const current = state.accessProfiles[employee.id];
  if (!current) return err(notFound('employee', input.employeeId));

  const status = input.status ?? current.status;
  if (!ACCESS_STATUSES.includes(status)) {
    return err({
      code: 'validation',
      field: 'status',
      message: `Unknown access status ${JSON.stringify(status)}.`,
    });
  }
  const grants = input.grants === undefined ? ok(current.grants) : validateGrants(input.grants);
  if (!grants.ok) return grants;

  const key = (list: readonly Grant[]) =>
    list
      .map((grant) => `${grant.permission}:${grant.scope}:${String(grant.requiresApproval)}`)
      .sort()
      .join('|');
  const statusChanged = status !== current.status;
  const grantsChanged = key(grants.value) !== key(current.grants);
  if (!statusChanged && !grantsChanged) {
    return err(conflict('no_change', `${employee.name}'s access already looks like this.`));
  }

  const now = context.clock.now();
  const profile: AccessProfile = { ...current, status, grants: grants.value, updatedAt: now };
  const parts: string[] = [];
  if (statusChanged) parts.push(`AI access ${STATUS_TEXT[status]}`);
  if (grantsChanged) {
    const before = new Set(current.grants.map((grant) => grant.permission));
    const after = new Set(grants.value.map((grant) => grant.permission));
    const added = [...after].filter((permission) => !before.has(permission));
    const removed = [...before].filter((permission) => !after.has(permission));
    if (added.length)
      parts.push(`granted ${added.map((p) => PERMISSIONS[p].label.toLowerCase()).join(', ')}`);
    if (removed.length)
      parts.push(`removed ${removed.map((p) => PERMISSIONS[p].label.toLowerCase()).join(', ')}`);
    if (!added.length && !removed.length) parts.push('changed scopes or approval rules');
  }
  return ok({
    value: profile,
    state: commit(
      state,
      { accessProfiles: { ...state.accessProfiles, [employee.id]: profile } },
      [
        activityEvent(context, now, {
          eventType: 'access.changed',
          description: `${employee.name}'s access was changed: ${parts.join('; ')}.`,
          employeeId: employee.id,
        }),
      ],
      [],
    ),
  });
};
