import type { ApprovalId, EmployeeId, ExecutionId } from '../ids';
import type { ActorId } from './actor';

/*
 * Access control (Phase 1.8). Who may do what, what needs the founder's approval,
 * and the record of every action an AI employee requested.
 *
 * The founder ('user') has full authority and is the only one who can manage
 * access or decide approvals. AI employees ('agent' actors) act only through
 * grants on their access profile. System housekeeping is not an actor that
 * performs business actions.
 */

/** Every action the command layer can perform, by command name. */
export const ACTION_TYPES = [
  'createProject',
  'updateProject',
  'deleteProject',
  'createTask',
  'updateTask',
  'assignTask',
  'changeTaskStatus',
  'deleteTask',
  'renameEmployee',
  'scheduleMeeting',
  'updateMeeting',
  'startMeeting',
  'completeMeeting',
  'cancelMeeting',
  'markNotificationRead',
  'markAllNotificationsRead',
  'updateAccessProfile',
  'sendMessage',
  'updateAgentConfig',
  'approveRequest',
  'rejectRequest',
  'cancelRequest',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/**
 * Capabilities, one per thing the commands can actually do. `founderOnly`
 * permissions can never be granted to an AI employee.
 */
export const PERMISSIONS = {
  'project.create': { label: 'Create projects', founderOnly: false, scopes: ['any'] },
  'project.edit': { label: 'Edit project details', founderOnly: false, scopes: ['any'] },
  'project.change_status': {
    label: 'Change project status (activate, hold, complete, archive, restore)',
    founderOnly: false,
    scopes: ['any'],
  },
  'project.delete': { label: 'Delete projects', founderOnly: false, scopes: ['any'] },
  'task.create': {
    label: 'Create tasks',
    founderOnly: false,
    scopes: ['own', 'department', 'any'],
  },
  'task.edit': {
    label: 'Edit task details',
    founderOnly: false,
    scopes: ['own', 'department', 'any'],
  },
  'task.assign': {
    label: 'Assign and reassign tasks',
    founderOnly: false,
    scopes: ['own', 'department', 'any'],
  },
  'task.change_status': {
    label: 'Move tasks through their workflow',
    founderOnly: false,
    scopes: ['own', 'department', 'any'],
  },
  'task.delete': {
    label: 'Delete tasks',
    founderOnly: false,
    scopes: ['own', 'department', 'any'],
  },
  'employee.rename': { label: 'Rename employees', founderOnly: false, scopes: ['any'] },
  'meeting.create': { label: 'Schedule meetings', founderOnly: false, scopes: ['own', 'any'] },
  'meeting.edit': { label: 'Edit scheduled meetings', founderOnly: false, scopes: ['own', 'any'] },
  'meeting.start': { label: 'Start meetings', founderOnly: false, scopes: ['own', 'any'] },
  'meeting.complete': {
    label: 'Record meetings as held',
    founderOnly: false,
    scopes: ['own', 'any'],
  },
  'meeting.cancel': { label: 'Cancel meetings', founderOnly: false, scopes: ['own', 'any'] },
  // Reads (Phase 2.0): an agent sees only what these grant. Writing never implies reading.
  'employee.read': {
    label: 'See employee profiles',
    founderOnly: false,
    scopes: ['own', 'department', 'any'],
  },
  'task.read': { label: 'See tasks', founderOnly: false, scopes: ['own', 'department', 'any'] },
  'project.read': {
    label: 'See projects',
    founderOnly: false,
    scopes: ['own', 'department', 'any'],
  },
  'meeting.read': { label: 'See meetings', founderOnly: false, scopes: ['own', 'any'] },
  'message.read': { label: 'Read their messages', founderOnly: false, scopes: ['own'] },
  'message.send': { label: 'Send messages to the founder', founderOnly: false, scopes: ['own'] },
  'notification.manage': {
    label: 'Manage the founder’s notifications',
    founderOnly: true,
    scopes: ['any'],
  },
  'access.manage': { label: 'Change who may do what', founderOnly: true, scopes: ['any'] },
  'approval.decide': { label: 'Approve or reject requests', founderOnly: true, scopes: ['any'] },
  'agent.configure': { label: 'Configure AI employees', founderOnly: true, scopes: ['any'] },
} as const satisfies Record<
  string,
  { label: string; founderOnly: boolean; scopes: readonly ('own' | 'department' | 'any')[] }
>;
export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_NAMES = Object.keys(PERMISSIONS) as Permission[];

/**
 * How far a grant reaches:
 *  - own        only resources tied to the employee (tasks assigned to them,
 *               meetings they attend, tasks they create for themselves)
 *  - department resources owned by their department
 *  - any        everything
 */
export const GRANT_SCOPES = ['own', 'department', 'any'] as const;
export type GrantScope = (typeof GRANT_SCOPES)[number];

export interface Grant {
  readonly permission: Permission;
  readonly scope: GrantScope;
  /** Every use needs the founder's approval first (on top of the fixed policy). */
  readonly requiresApproval: boolean;
}

/**
 * Whether an AI employee may act at all. Every profile starts `disabled`: no AI
 * is connected in Phase 1, and nothing acts until the founder enables it.
 */
export const ACCESS_STATUSES = ['disabled', 'active', 'suspended'] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

/** One per employee. The employee ID is the agent's stable identity. */
export interface AccessProfile {
  readonly employeeId: EmployeeId;
  readonly status: AccessStatus;
  readonly grants: readonly Grant[];
  readonly updatedAt: string;
}

/* ───────────────────────── Approvals ───────────────────────── */

export const APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  /** The target changed (or the action became invalid) after the request. */
  'stale',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** What an action is about, and its version when the request was made. */
export interface ActionTarget {
  readonly type: 'project' | 'task' | 'employee' | 'meeting' | 'workspace';
  readonly id: string | null;
  /** Human label at request time, e.g. a task title. */
  readonly label: string;
  /** Opaque version of the target when requested; a different value means it changed. */
  readonly version: string;
}

/** The exact operation, frozen at request time. Inputs carry no secrets. */
export interface RequestedAction {
  readonly type: ActionType;
  readonly input: unknown;
}

export interface ApprovalRequest {
  readonly id: ApprovalId;
  readonly executionId: ExecutionId;
  /** The AI employee who asked. */
  readonly requesterId: EmployeeId;
  readonly action: RequestedAction;
  readonly target: ActionTarget;
  /** One sentence describing the change, e.g. `Delete task "Pricing page"`. */
  readonly summary: string;
  /** Why the employee wants it (their words). */
  readonly reason: string;
  /** Why approval is needed (from the policy or the grant). */
  readonly policyReason: string;
  readonly status: ApprovalStatus;
  readonly createdAt: string;
  readonly decidedAt: string | null;
  /** Who decided: the founder, or the requester when they cancelled. */
  readonly decidedBy: ActorId | null;
  readonly decisionNote: string;
}

/* ───────────────────────── Executions ───────────────────────── */

/**
 * Final state of a requested action. Execution is synchronous and local, so the
 * intermediate steps (requested → authorized → running) happen within one commit
 * and only the outcome is stored.
 */
export const EXECUTION_STATUSES = [
  'awaiting_approval',
  'succeeded',
  'failed',
  /** Refused by identity or permission checks. */
  'denied',
  'rejected',
  'cancelled',
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export interface Execution {
  readonly id: ExecutionId;
  /** The caller's idempotency key: the same key never runs twice. */
  readonly requestId: string;
  readonly actorId: EmployeeId;
  readonly action: RequestedAction;
  readonly target: ActionTarget;
  readonly summary: string;
  readonly status: ExecutionStatus;
  readonly approvalId: ApprovalId | null;
  /** The execution this one retries, if any. */
  readonly retryOf: ExecutionId | null;
  readonly requestedAt: string;
  readonly completedAt: string | null;
  /** Short outcome, e.g. the ID of what was created. */
  readonly result: string;
  readonly error: { readonly code: string; readonly message: string } | null;
}
