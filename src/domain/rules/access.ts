import { invalidReference, type DomainError, type DomainResult } from '../errors';
import type { EmployeeId } from '../ids';
import { err, ok } from '../result';
import {
  GRANT_SCOPES,
  PERMISSIONS,
  type AccessProfile,
  type ActionTarget,
  type ActionType,
  type Grant,
  type GrantScope,
  type Permission,
} from '../types/access';
import type { Actor } from '../types/actor';
import type { Employee } from '../types/employee';
import type { WorkspaceState } from '../types/workspace';

/*
 * The authorization policy: which permission each action needs, on which
 * resource, and when the founder must approve. Pure functions over the
 * workspace, used by the command layer for every call (UI, office, executor).
 * Business validity is NOT checked here; the command handlers stay authoritative.
 */

/** Read a field from untrusted input without trusting its shape. */
function field(input: unknown, key: string): unknown {
  return typeof input === 'object' && input !== null
    ? (input as Record<string, unknown>)[key]
    : undefined;
}
const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** One permission check on one resource. */
export interface Requirement {
  readonly permission: Permission | null;
  readonly target: ActionTarget;
  /** Whether a grant at `scope` covers this resource for `employee`. */
  readonly inScope: (scope: GrantScope, employee: Employee) => boolean;
  /** Why the founder must approve this regardless of the grant, or null. */
  readonly approval: string | null;
  /** Approval that depends on who is acting (e.g. taking over someone else's work). */
  readonly approvalFor?: (employee: Employee) => string | null;
  /** Only the requester (or the founder) may perform it, no grant needed (e.g. cancelling one's own request). */
  readonly selfService?: (employee: Employee) => boolean;
}

/**
 * A version of an entity from its full content (53-bit hash of its JSON), so any
 * change is detected — even two edits within the same millisecond, which a
 * timestamp would miss.
 */
export function contentVersion(entity: object): string {
  const text = JSON.stringify(entity);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const WORKSPACE: ActionTarget = { type: 'workspace', id: null, label: 'Workspace', version: '' };
const any = () => true;

function taskTarget(state: WorkspaceState, taskId: unknown): ActionTarget | DomainError {
  const id = text(taskId);
  const task = id ? state.tasks[id as keyof WorkspaceState['tasks']] : undefined;
  if (!task) return invalidReference('task', String(taskId), 'taskId');
  return {
    type: 'task',
    id: task.id,
    label: task.title,
    version: contentVersion(task),
  };
}

function projectTarget(state: WorkspaceState, projectId: unknown): ActionTarget | DomainError {
  const id = text(projectId);
  const project = id ? state.projects[id as keyof WorkspaceState['projects']] : undefined;
  if (!project) return invalidReference('project', String(projectId), 'projectId');
  return {
    type: 'project',
    id: project.id,
    label: project.name,
    version: contentVersion(project),
  };
}

function meetingTarget(state: WorkspaceState, meetingId: unknown): ActionTarget | DomainError {
  const id = text(meetingId);
  const meeting = id ? state.meetings[id as keyof WorkspaceState['meetings']] : undefined;
  if (!meeting) return invalidReference('meeting', String(meetingId), 'meetingId');
  return {
    type: 'meeting',
    id: meeting.id,
    label: meeting.title,
    version: contentVersion(meeting),
  };
}

const isError = (value: ActionTarget | DomainError): value is DomainError => 'code' in value;

/**
 * What an action needs. Returns one or more requirements (e.g. editing a
 * project's details and status at once needs both permissions), or an error when
 * the resource it names does not exist.
 */
export function requirementsOf(
  type: ActionType,
  input: unknown,
  state: WorkspaceState,
): DomainResult<readonly Requirement[]> {
  const taskScoped = (permission: Permission, approval: string | null = null) => {
    const target = taskTarget(state, field(input, 'taskId'));
    if (isError(target)) return err(target);
    const task = state.tasks[target.id as keyof WorkspaceState['tasks']];
    return ok([
      {
        permission,
        target,
        approval,
        inScope: (scope: GrantScope, employee: Employee) =>
          scope === 'any' ||
          (scope === 'department' && task?.departmentId === employee.departmentId) ||
          (scope === 'own' && task?.assigneeId === employee.id),
      },
    ]);
  };
  const meetingScoped = (permission: Permission) => {
    const target = meetingTarget(state, field(input, 'meetingId'));
    if (isError(target)) return err(target);
    const meeting = state.meetings[target.id as keyof WorkspaceState['meetings']];
    return ok([
      {
        permission,
        target,
        approval: null,
        inScope: (scope: GrantScope, employee: Employee) =>
          scope === 'any' || (meeting?.participantIds.includes(employee.id) ?? false),
      },
    ]);
  };
  const workspace = (permission: Permission): DomainResult<readonly Requirement[]> =>
    ok([{ permission, target: WORKSPACE, approval: null, inScope: any }]);

  switch (type) {
    case 'createProject':
      return ok([
        {
          permission: 'project.create',
          target: {
            ...WORKSPACE,
            type: 'project',
            label: text(field(input, 'name')) ?? 'New project',
          },
          approval: null,
          inScope: (scope) => scope === 'any',
        },
      ]);
    case 'updateProject': {
      const target = projectTarget(state, field(input, 'projectId'));
      if (isError(target)) return err(target);
      const patch = field(input, 'patch');
      const status = text(field(patch, 'status'));
      const project = state.projects[target.id as keyof WorkspaceState['projects']];
      const changesStatus = status !== undefined && status !== project?.status;
      const changesDetails =
        typeof patch === 'object' &&
        patch !== null &&
        Object.keys(patch).some((key) => key !== 'status');
      const requirements: Requirement[] = [];
      if (changesDetails || !changesStatus) {
        requirements.push({ permission: 'project.edit', target, approval: null, inScope: any });
      }
      if (changesStatus) {
        requirements.push({
          permission: 'project.change_status',
          target,
          approval:
            status === 'archived' || status === 'completed'
              ? `${status === 'archived' ? 'Archiving' : 'Completing'} a project always needs the founder.`
              : null,
          inScope: any,
        });
      }
      return ok(requirements);
    }
    case 'deleteProject': {
      const target = projectTarget(state, field(input, 'projectId'));
      if (isError(target)) return err(target);
      return ok([
        {
          permission: 'project.delete',
          target,
          approval: 'Deleting a project always needs the founder.',
          inScope: any,
        },
      ]);
    }
    case 'createTask': {
      const departmentId = text(field(input, 'departmentId'));
      const assigneeId = field(input, 'assigneeId');
      return ok([
        {
          permission: 'task.create',
          target: { ...WORKSPACE, type: 'task', label: text(field(input, 'title')) ?? 'New task' },
          approval: null,
          inScope: (scope, employee) =>
            scope === 'any' ||
            (scope === 'department' && departmentId === employee.departmentId) ||
            (scope === 'own' && assigneeId === employee.id),
        },
      ]);
    }
    case 'updateTask':
      return taskScoped('task.edit');
    case 'changeTaskStatus':
      return taskScoped('task.change_status');
    case 'deleteTask':
      return taskScoped('task.delete', 'Deleting a task always needs the founder.');
    case 'assignTask': {
      const target = taskTarget(state, field(input, 'taskId'));
      if (isError(target)) return err(target);
      const task = state.tasks[target.id as keyof WorkspaceState['tasks']];
      const to = field(input, 'assigneeId');
      const owner = task?.assigneeId ? state.employees[task.assigneeId] : undefined;
      return ok([
        {
          permission: 'task.assign',
          target,
          approval: null,
          // Moving work away from someone else always needs the founder.
          approvalFor: (employee) =>
            owner && owner.id !== employee.id && to !== owner.id
              ? `"${target.label}" belongs to ${owner.name}; reassigning someone else's work needs the founder.`
              : null,
          inScope: (scope, employee) =>
            scope === 'any' ||
            (scope === 'department' && task?.departmentId === employee.departmentId) ||
            // Own scope: only taking an unowned task, or handing back one's own.
            (scope === 'own' &&
              ((task?.assigneeId === null && to === employee.id) ||
                task?.assigneeId === employee.id)),
        },
      ]);
    }
    case 'renameEmployee': {
      const id = text(field(input, 'employeeId'));
      const employee = id ? state.employees[id as EmployeeId] : undefined;
      if (!employee) return err(invalidReference('employee', String(id), 'employeeId'));
      return ok([
        {
          permission: 'employee.rename',
          target: {
            type: 'employee',
            id: employee.id,
            label: employee.name,
            version: contentVersion(employee),
          },
          approval: 'Renaming someone always needs the founder.',
          inScope: any,
        },
      ]);
    }
    case 'scheduleMeeting': {
      const participants = field(input, 'participantIds');
      return ok([
        {
          permission: 'meeting.create',
          target: {
            ...WORKSPACE,
            type: 'meeting',
            label: text(field(input, 'title')) ?? 'New meeting',
          },
          approval: null,
          inScope: (scope, employee) =>
            scope === 'any' || (Array.isArray(participants) && participants.includes(employee.id)),
        },
      ]);
    }
    case 'updateMeeting':
      return meetingScoped('meeting.edit');
    case 'startMeeting':
      return meetingScoped('meeting.start');
    case 'completeMeeting':
      return meetingScoped('meeting.complete');
    case 'cancelMeeting':
      return meetingScoped('meeting.cancel');
    case 'markNotificationRead':
    case 'markAllNotificationsRead':
      return workspace('notification.manage');
    case 'updateAccessProfile':
      return workspace('access.manage');
    case 'updateAgentConfig':
      return workspace('agent.configure');
    case 'sendMessage': {
      const to = field(input, 'to');
      return ok([
        {
          permission: 'message.send',
          target: { ...WORKSPACE, label: 'A message' },
          approval: null,
          // Employees may write to the founder only (employee ↔ employee is a later phase).
          inScope: () => to === 'user',
        },
      ]);
    }
    case 'approveRequest':
    case 'rejectRequest':
      return workspace('approval.decide');
    case 'cancelRequest': {
      const id = text(field(input, 'approvalId'));
      const approval = state.approvals.find((candidate) => candidate.id === id);
      if (!approval) return err(invalidReference('approval', String(id), 'approvalId'));
      return ok([
        {
          permission: null,
          target: { ...WORKSPACE, label: approval.summary },
          approval: null,
          inScope: any,
          selfService: (employee) => approval.requesterId === employee.id,
        },
      ]);
    }
  }
}

/** The outcome of authorizing one call. */
export interface Authorization {
  readonly target: ActionTarget;
  readonly permissions: readonly Permission[];
  /** Why the founder must approve first, or null when the actor may go ahead. */
  readonly approvalReason: string | null;
}

function denied(permission: string, message: string): DomainError {
  return { code: 'permission_denied', permission, message };
}

/**
 * Who may do what. The founder may do everything and never needs approval. AI
 * employees need an active access profile and a grant whose scope covers the
 * resource; founder-only permissions can never be granted. The system actor
 * performs no business actions.
 */
export function authorize(
  state: WorkspaceState,
  actor: Actor,
  type: ActionType,
  input: unknown,
): DomainResult<Authorization> {
  // 1. Identity and standing, before looking at any resource.
  if (actor.kind === 'system') {
    return err(
      denied(
        type,
        'System processes do not perform business actions; only the founder and AI employees do.',
      ),
    );
  }
  const employee = actor.kind === 'agent' ? state.employees[actor.employeeId] : undefined;
  if (actor.kind === 'agent') {
    if (!employee) {
      return err({
        code: 'invalid_actor',
        message: `Agent "${actor.employeeId}" is not an employee of this workspace.`,
      });
    }
    const profile = state.accessProfiles[employee.id];
    if (profile?.status !== 'active') {
      return err(
        denied(
          type,
          `${employee.name} is not enabled to act (AI access is ${profile?.status ?? 'not set up'}).`,
        ),
      );
    }
  }

  // 2. What the action needs, on which resource.
  const requirements = requirementsOf(type, input, state);
  if (!requirements.ok) {
    // The founder gets the handler's own "not found" message; an agent is refused here.
    if (actor.kind === 'user')
      return ok({ target: WORKSPACE, permissions: [], approvalReason: null });
    return requirements;
  }
  const target = requirements.value[0]?.target ?? WORKSPACE;
  const permissions = requirements.value
    .map((requirement) => requirement.permission)
    .filter((permission): permission is Permission => permission !== null);
  if (actor.kind === 'user' || !employee) return ok({ target, permissions, approvalReason: null });
  const profile = state.accessProfiles[employee.id];
  if (!profile) return err(denied(type, `${employee.name} has no access profile.`));

  // 3. A grant whose scope covers the resource, for every permission needed.
  let approvalReason: string | null = null;
  for (const requirement of requirements.value) {
    if (requirement.permission === null) {
      if (!requirement.selfService?.(employee)) {
        return err(denied(type, `${employee.name} can only do this for their own requests.`));
      }
      continue;
    }
    const permission = requirement.permission;
    if (PERMISSIONS[permission].founderOnly) {
      return err(
        denied(permission, `Only the founder can ${PERMISSIONS[permission].label.toLowerCase()}.`),
      );
    }
    const grants = profile.grants.filter((grant) => grant.permission === permission);
    if (grants.length === 0) {
      return err(
        denied(
          permission,
          `${employee.name} does not have the "${PERMISSIONS[permission].label}" permission.`,
        ),
      );
    }
    const covering = grants.find((grant) => requirement.inScope(grant.scope, employee));
    if (!covering) {
      return err(
        denied(
          permission,
          `${employee.name} may ${PERMISSIONS[permission].label.toLowerCase()} only for ${scopeText(grants)}, and "${requirement.target.label}" is outside that.`,
        ),
      );
    }
    approvalReason ??=
      requirement.approval ??
      requirement.approvalFor?.(employee) ??
      (covering.requiresApproval
        ? `${employee.name}'s access requires the founder's approval for this.`
        : null);
  }
  return ok({ target, permissions, approvalReason });
}

function scopeText(grants: readonly Grant[]): string {
  const best = grants.map((grant) => grant.scope);
  if (best.includes('department')) return 'their department';
  return 'their own work';
}

/** Whether `actor` may perform `type` at all right now (for showing what is allowed; not a security check). */
export function hasPermission(profile: AccessProfile | undefined, permission: Permission): boolean {
  return (
    profile?.status === 'active' && profile.grants.some((grant) => grant.permission === permission)
  );
}

/* ───────────────────────── Profiles ───────────────────────── */

const grant = (permission: Permission, scope: GrantScope, requiresApproval = false): Grant => ({
  permission,
  scope,
  requiresApproval,
});

/**
 * Starting grants by role. A project manager organises work across the company;
 * specialists move their own work forward. Nobody can delete, archive, complete,
 * rename or reset without the founder, and every profile starts disabled.
 */
export function defaultGrants(employee: Pick<Employee, 'departmentId'>): Grant[] {
  const reads = (scope: GrantScope) => [
    grant('employee.read', scope),
    grant('task.read', scope),
    grant('project.read', scope),
    grant('meeting.read', 'own'),
    grant('message.read', 'own'),
    grant('message.send', 'own'),
  ];
  if (employee.departmentId === 'dept_management') {
    return [
      ...reads('any'),
      grant('project.create', 'any', true),
      grant('project.edit', 'any'),
      grant('task.create', 'any'),
      grant('task.edit', 'any'),
      grant('task.assign', 'any'),
      grant('task.change_status', 'any'),
      grant('meeting.create', 'own'),
      grant('meeting.edit', 'own'),
      grant('meeting.start', 'own'),
      grant('meeting.complete', 'own'),
      grant('meeting.cancel', 'own'),
    ];
  }
  const base = [
    ...reads('department'),
    grant('task.create', 'own'),
    grant('task.edit', 'own'),
    grant('task.assign', 'own'),
    grant('task.change_status', employee.departmentId === 'dept_qa' ? 'department' : 'own'),
    grant('meeting.start', 'own'),
    grant('meeting.complete', 'own'),
  ];
  return base;
}

export function defaultAccessProfile(employee: Employee, now: string): AccessProfile {
  return {
    employeeId: employee.id,
    status: 'disabled',
    grants: defaultGrants(employee),
    updatedAt: now,
  };
}

/** Grants an access profile may hold: known, grantable, at an allowed scope, once each. */
export function validateGrants(grants: unknown): DomainResult<readonly Grant[]> {
  if (!Array.isArray(grants)) return err(denied('access.manage', 'Grants must be a list.'));
  const seen = new Set<string>();
  const result: Grant[] = [];
  for (const raw of grants as unknown[]) {
    const permission = field(raw, 'permission') as Permission;
    const scope = field(raw, 'scope') as GrantScope;
    const requiresApproval = field(raw, 'requiresApproval');
    const definition = PERMISSIONS[permission] as (typeof PERMISSIONS)[Permission] | undefined;
    if (!definition) {
      return err({
        code: 'validation',
        field: 'grants',
        message: `Unknown permission ${JSON.stringify(permission)}.`,
      });
    }
    if (definition.founderOnly) {
      return err({
        code: 'validation',
        field: 'grants',
        message: `"${definition.label}" is reserved for the founder and cannot be granted.`,
      });
    }
    if (
      !GRANT_SCOPES.includes(scope) ||
      !(definition.scopes as readonly string[]).includes(scope)
    ) {
      return err({
        code: 'validation',
        field: 'grants',
        message: `"${definition.label}" cannot be granted with the scope ${JSON.stringify(scope)}.`,
      });
    }
    if (typeof requiresApproval !== 'boolean') {
      return err({
        code: 'validation',
        field: 'grants',
        message: 'Each grant must say whether approval is needed.',
      });
    }
    if (seen.has(permission)) {
      return err({
        code: 'validation',
        field: 'grants',
        message: `"${definition.label}" is listed twice.`,
      });
    }
    seen.add(permission);
    result.push({ permission, scope, requiresApproval });
  }
  return ok(result);
}

/* ───────────────────────── Reads (Phase 2.0) ───────────────────────── */

/**
 * Whether an AI employee may read a resource: active profile and a read grant
 * whose scope covers it. Writing never implies reading. Returns the employee so
 * callers can resolve "own" and "department".
 */
export function authorizeRead(
  state: WorkspaceState,
  employeeId: EmployeeId,
  permission: Permission,
  label: string,
  inScope: (scope: GrantScope, employee: Employee) => boolean,
): DomainResult<Employee> {
  const employee = state.employees[employeeId];
  if (!employee) {
    return err({
      code: 'invalid_actor',
      message: `Agent "${employeeId}" is not an employee of this workspace.`,
    });
  }
  const profile = state.accessProfiles[employee.id];
  if (profile?.status !== 'active') {
    return err(
      denied(
        permission,
        `${employee.name} is not enabled to act (AI access is ${profile?.status ?? 'not set up'}).`,
      ),
    );
  }
  const grants = profile.grants.filter((candidate) => candidate.permission === permission);
  if (grants.length === 0) {
    return err(
      denied(
        permission,
        `${employee.name} does not have the "${PERMISSIONS[permission].label}" permission.`,
      ),
    );
  }
  if (!grants.some((candidate) => inScope(candidate.scope, employee))) {
    return err(
      denied(
        permission,
        `${employee.name} may ${PERMISSIONS[permission].label.toLowerCase()} only for ${scopeText(grants)}, and "${label}" is outside that.`,
      ),
    );
  }
  return ok(employee);
}
