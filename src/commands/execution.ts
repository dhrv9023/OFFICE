import {
  conflict,
  invalidReference,
  validationError,
  type DomainError,
  type DomainResult,
} from '@/domain/errors';
import type { ApprovalId, EmployeeId, ExecutionId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import { requirementsOf } from '@/domain/rules/access';
import {
  TASK_STATUS_LABELS,
  type ActionTarget,
  type Actor,
  type ApprovalRequest,
  type Execution,
  type RequestedAction,
  type WorkspaceState,
} from '@/domain/types';
import { authorizeAction, isBusinessAction, runAction, type BusinessAction } from './registry';
import { activityEvent, notification } from './support';
import type { CommandContext } from './types';

/*
 * The execution pipeline for AI employees (Phase 1.8):
 *
 *   identity → status → permission + scope → domain dry run → approval policy
 *     ├─ needs approval → ApprovalRequest (pending) + Execution (awaiting_approval)
 *     └─ allowed        → the command's own state change + Execution (succeeded)
 *
 * Every outcome, including refusals, is recorded as an Execution. Approving
 * re-checks identity, permission, the target's version and domain validity, then
 * applies the stored action once, in the same commit as the decision.
 *
 * These are pure functions over WorkspaceState; createCommands binds them to the
 * store. Nothing here talks to a model: callers are controlled test actors now,
 * and an agent runner later.
 */

export const MAX_EXECUTIONS = 1000;
const MAX_REQUEST_ID = 100;

export interface ActionRequest {
  readonly employeeId: EmployeeId;
  readonly action: RequestedAction;
  /** Idempotency key chosen by the caller. The same key never runs twice. */
  readonly requestId: string;
  /** Why the employee wants to do this (shown to the founder). */
  readonly reason?: string | undefined;
  readonly retryOf?: ExecutionId | null | undefined;
}

export interface ExecutionOutcome {
  readonly state: WorkspaceState;
  readonly execution: Execution;
  readonly approval: ApprovalRequest | null;
  /** True when the request ID was already used for this exact action: nothing ran again. */
  readonly duplicate: boolean;
}

/** Stable comparison of two actions (same type, same input). */
function sameAction(a: RequestedAction, b: RequestedAction): boolean {
  return a.type === b.type && JSON.stringify(a.input) === JSON.stringify(b.input);
}

/** A JSON-safe copy of the input, frozen at request time. */
function freeze(input: unknown): unknown {
  return input === undefined ? null : (JSON.parse(JSON.stringify(input)) as unknown);
}

function appendExecution(state: WorkspaceState, execution: Execution): WorkspaceState {
  const executions = [...state.executions, execution];
  return {
    ...state,
    executions: executions.length > MAX_EXECUTIONS ? executions.slice(-MAX_EXECUTIONS) : executions,
  };
}

function replaceExecution(state: WorkspaceState, execution: Execution): WorkspaceState {
  return {
    ...state,
    executions: state.executions.map((item) => (item.id === execution.id ? execution : item)),
  };
}

function replaceApproval(state: WorkspaceState, approval: ApprovalRequest): WorkspaceState {
  return {
    ...state,
    approvals: state.approvals.map((item) => (item.id === approval.id ? approval : item)),
  };
}

function withEvents(
  state: WorkspaceState,
  events: WorkspaceState['activity'],
  notifications: WorkspaceState['notifications'] = [],
): WorkspaceState {
  return {
    ...state,
    activity: [...state.activity, ...events].slice(-1000),
    notifications: [...state.notifications, ...notifications].slice(-200),
  };
}

const UNKNOWN_TARGET: ActionTarget = { type: 'workspace', id: null, label: 'Unknown', version: '' };

function targetOf(state: WorkspaceState, action: RequestedAction): ActionTarget {
  const requirements = requirementsOf(action.type, action.input, state);
  return requirements.ok ? (requirements.value[0]?.target ?? UNKNOWN_TARGET) : UNKNOWN_TARGET;
}

/** One sentence the founder can read, e.g. `Delete task "Pricing page"`. */
export function describeAction(state: WorkspaceState, action: RequestedAction): string {
  const input = (action.input ?? {}) as Record<string, unknown>;
  const label = targetOf(state, action).label;
  const name = (id: unknown) =>
    typeof id === 'string' ? (state.employees[id as EmployeeId]?.name ?? 'someone') : 'nobody';
  const patch = (input.patch ?? {}) as Record<string, unknown>;
  switch (action.type) {
    case 'createProject':
      return `Create project "${label}"`;
    case 'updateProject':
      return typeof patch.status === 'string'
        ? `Change project "${label}" to ${patch.status}`
        : `Edit project "${label}"`;
    case 'deleteProject':
      return `Delete project "${label}" and its tasks`;
    case 'createTask':
      return `Create task "${label}"${input.assigneeId ? ` for ${name(input.assigneeId)}` : ''}`;
    case 'updateTask':
      return `Edit task "${label}"`;
    case 'assignTask':
      return input.assigneeId
        ? `Assign "${label}" to ${name(input.assigneeId)}`
        : `Unassign "${label}"`;
    case 'changeTaskStatus':
      return `Move "${label}" to ${
        (TASK_STATUS_LABELS as Readonly<Record<string, string | undefined>>)[
          String(input.status)
        ] ?? JSON.stringify(input.status)
      }`;
    case 'deleteTask':
      return `Delete task "${label}"`;
    case 'renameEmployee':
      return `Rename ${label} to "${String(input.name)}"`;
    case 'scheduleMeeting':
      return `Schedule meeting "${label}"`;
    case 'updateMeeting':
      return `Edit meeting "${label}"`;
    case 'startMeeting':
      return `Start meeting "${label}"`;
    case 'completeMeeting':
      return `Record meeting "${label}" as held`;
    case 'cancelMeeting':
      return `Cancel meeting "${label}"`;
    default:
      return `${action.type} (${label})`;
  }
}

/** A short result line from a command's output (the ID of what it touched). */
function resultOf(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return `Done: ${String(value.id)}`;
  }
  return 'Done';
}

const errorOf = (error: DomainError) => ({ code: error.code, message: error.message });

/**
 * An AI employee asks to perform an action. Always returns the recorded
 * execution (denied, failed, awaiting approval or succeeded), except when the
 * request itself is malformed or reuses a request ID for a different action.
 */
export function requestAction(
  state: WorkspaceState,
  request: ActionRequest,
  context: Omit<CommandContext, 'actor'>,
): DomainResult<ExecutionOutcome> {
  const employee = state.employees[request.employeeId];
  if (!employee) {
    return err({
      code: 'invalid_actor',
      message: `Agent "${request.employeeId}" is not an employee of this workspace.`,
    });
  }
  const requestId = typeof request.requestId === 'string' ? request.requestId.trim() : '';
  if (requestId === '' || requestId.length > MAX_REQUEST_ID) {
    return err(
      validationError(
        'requestId',
        `A request ID of 1–${String(MAX_REQUEST_ID)} characters is required.`,
      ),
    );
  }
  // Founder-only actions are refused by authorization anyway; these are never requestable.
  if (
    !isBusinessAction(request.action.type) ||
    request.action.type === 'updateAccessProfile' ||
    request.action.type === 'updateAgentConfig'
  ) {
    return err(
      validationError(
        'action',
        `${JSON.stringify(request.action.type)} cannot be requested by an AI employee.`,
      ),
    );
  }
  const action: RequestedAction = {
    type: request.action.type,
    input: freeze(request.action.input),
  };

  // Idempotency: the same key from the same employee never runs twice.
  const existing = state.executions.find(
    (execution) => execution.actorId === employee.id && execution.requestId === requestId,
  );
  if (existing) {
    if (!sameAction(existing.action, action)) {
      return err(
        conflict(
          'idempotency_conflict',
          `Request "${requestId}" was already used for a different action. Use a new request ID.`,
        ),
      );
    }
    const approval = state.approvals.find((item) => item.id === existing.approvalId) ?? null;
    return ok({ state, execution: existing, approval, duplicate: true });
  }

  const actor: Actor = { kind: 'agent', employeeId: employee.id };
  const now = context.clock.now();
  const base: Execution = {
    id: context.ids.next('execution'),
    requestId,
    actorId: employee.id,
    action,
    target: targetOf(state, action),
    summary: describeAction(state, action),
    status: 'failed',
    approvalId: null,
    retryOf: request.retryOf ?? null,
    requestedAt: now,
    completedAt: now,
    result: '',
    error: null,
  };
  const record = (execution: Execution) =>
    ok({ state: appendExecution(state, execution), execution, approval: null, duplicate: false });

  // Identity, status, permission and scope. Approval is decided below.
  const authorization = authorizeAction(state, actor, action.type, action.input, true);
  if (!authorization.ok) {
    return record({ ...base, status: 'denied', error: errorOf(authorization.error) });
  }

  // Domain validation, without committing anything.
  const dryRun = runAction(action.type as BusinessAction, state, action.input, {
    ...context,
    actor,
  });
  if (!dryRun.ok) return record({ ...base, status: 'failed', error: errorOf(dryRun.error) });

  const policyReason = authorization.value.approvalReason;
  if (policyReason === null) {
    const execution: Execution = {
      ...base,
      status: 'succeeded',
      result: resultOf(dryRun.value.value),
    };
    return ok({
      state: appendExecution(dryRun.value.state, execution),
      execution,
      approval: null,
      duplicate: false,
    });
  }

  // Needs the founder: record the request; nothing is applied.
  const approval: ApprovalRequest = {
    id: context.ids.next('approval'),
    executionId: base.id,
    requesterId: employee.id,
    action,
    target: base.target,
    summary: base.summary,
    reason: (request.reason ?? '').trim().slice(0, 500),
    policyReason,
    status: 'pending',
    createdAt: now,
    decidedAt: null,
    decidedBy: null,
    decisionNote: '',
  };
  const execution: Execution = {
    ...base,
    status: 'awaiting_approval',
    approvalId: approval.id,
    completedAt: null,
  };
  const ctx = { ...context, actor };
  const next = withEvents(
    { ...appendExecution(state, execution), approvals: [...state.approvals, approval] },
    [
      activityEvent(ctx, now, {
        eventType: 'approval.requested',
        description: `${employee.name} asked for approval: ${approval.summary}.`,
        employeeId: employee.id,
      }),
    ],
    [
      notification(ctx, now, {
        type: 'warning',
        title: 'Approval needed',
        message: `${employee.name} asks to ${approval.summary.charAt(0).toLowerCase()}${approval.summary.slice(1)}.`,
        relatedEntityId: approval.id,
      }),
    ],
  );
  return ok({ state: next, execution, approval, duplicate: false });
}

/* ───────────────────────── Decisions ───────────────────────── */

export interface DecisionInput {
  readonly approvalId: ApprovalId;
  readonly note?: string | undefined;
}

export interface DecisionOutcome {
  readonly approval: ApprovalRequest;
  readonly execution: Execution | null;
}

function findPending(
  state: WorkspaceState,
  approvalId: ApprovalId,
): DomainResult<{ approval: ApprovalRequest; execution: Execution | undefined }> {
  const approval = state.approvals.find((item) => item.id === approvalId);
  if (!approval) return err(invalidReference('approval', approvalId, 'approvalId'));
  if (approval.status !== 'pending') {
    return err(
      conflict(
        'approval_closed',
        `This request was already ${approval.status === 'stale' ? 'marked out of date' : approval.status}.`,
      ),
    );
  }
  const execution = state.executions.find((item) => item.id === approval.executionId);
  return ok({ approval, execution });
}

/**
 * The founder approves. The stored action runs only if everything that made it
 * acceptable still holds; otherwise the request is marked stale with the reason
 * and nothing is applied. Runs once: a decided request cannot be approved again.
 */
export function approveRequest(
  state: WorkspaceState,
  input: DecisionInput,
  context: CommandContext,
): DomainResult<{ state: WorkspaceState; value: DecisionOutcome }> {
  const found = findPending(state, input.approvalId);
  if (!found.ok) return found;
  const { approval, execution } = found.value;
  const now = context.clock.now();
  const note = (input.note ?? '').trim().slice(0, 500);
  const requester = state.employees[approval.requesterId];
  const agent: Actor = { kind: 'agent', employeeId: approval.requesterId };

  const markStale = (reason: DomainError) => {
    const stale: ApprovalRequest = {
      ...approval,
      status: 'stale',
      decidedAt: now,
      decidedBy: 'user',
      decisionNote: reason.message,
    };
    const failed = execution
      ? { ...execution, status: 'failed' as const, completedAt: now, error: errorOf(reason) }
      : null;
    let next = replaceApproval(state, stale);
    if (failed) next = replaceExecution(next, failed);
    next = withEvents(next, [
      activityEvent(context, now, {
        eventType: 'approval.stale',
        description: `Approval for "${approval.summary}" could not be applied: ${reason.message}`,
        employeeId: approval.requesterId,
      }),
    ]);
    return ok({ state: next, value: { approval: stale, execution: failed } });
  };

  // 1. The target must be exactly as it was when the request was made.
  const current = targetOf(state, approval.action);
  if (
    approval.target.id !== null &&
    (current.id !== approval.target.id || current.version !== approval.target.version)
  ) {
    return markStale(
      conflict(
        'approval_closed',
        current.id === approval.target.id
          ? `"${approval.target.label}" changed after the request was made. Ask ${requester?.name ?? 'the employee'} to request it again.`
          : `"${approval.target.label}" no longer exists.`,
      ),
    );
  }
  // 2. The requester must still exist, be active and hold the permission.
  const authorization = authorizeAction(
    state,
    agent,
    approval.action.type,
    approval.action.input,
    true,
  );
  if (!authorization.ok) return markStale(authorization.error);
  // 3. The action must still be valid under the domain rules.
  if (!isBusinessAction(approval.action.type)) {
    return markStale(validationError('action', 'This action cannot be approved.'));
  }
  const run = runAction(approval.action.type, state, approval.action.input, {
    ...context,
    actor: agent,
  });
  if (!run.ok) return markStale(run.error);

  const approved: ApprovalRequest = {
    ...approval,
    status: 'approved',
    decidedAt: now,
    decidedBy: 'user',
    decisionNote: note,
  };
  const succeeded = execution
    ? {
        ...execution,
        status: 'succeeded' as const,
        completedAt: now,
        result: resultOf(run.value.value),
      }
    : null;
  let next = replaceApproval(run.value.state, approved);
  if (succeeded) next = replaceExecution(next, succeeded);
  next = withEvents(next, [
    activityEvent(context, now, {
      eventType: 'approval.approved',
      description: `The founder approved ${requester?.name ?? 'an employee'}'s request: ${approval.summary}.`,
      employeeId: approval.requesterId,
    }),
  ]);
  return ok({ state: next, value: { approval: approved, execution: succeeded } });
}

function close(
  state: WorkspaceState,
  input: DecisionInput,
  context: CommandContext,
  status: 'rejected' | 'cancelled',
): DomainResult<{ state: WorkspaceState; value: DecisionOutcome }> {
  const found = findPending(state, input.approvalId);
  if (!found.ok) return found;
  const { approval, execution } = found.value;
  const now = context.clock.now();
  const decidedBy = context.actor.kind === 'agent' ? context.actor.employeeId : 'user';
  const closed: ApprovalRequest = {
    ...approval,
    status,
    decidedAt: now,
    decidedBy,
    decisionNote: (input.note ?? '').trim().slice(0, 500),
  };
  const ended = execution ? { ...execution, status, completedAt: now } : null;
  let next = replaceApproval(state, closed);
  if (ended) next = replaceExecution(next, ended);
  const requester = state.employees[approval.requesterId]?.name ?? 'An employee';
  next = withEvents(next, [
    activityEvent(context, now, {
      eventType: status === 'rejected' ? 'approval.rejected' : 'approval.cancelled',
      description:
        status === 'rejected'
          ? `The founder rejected ${requester}'s request: ${approval.summary}.${closed.decisionNote ? ` Note: ${closed.decisionNote}` : ''}`
          : `${requester}'s request was withdrawn: ${approval.summary}.`,
      employeeId: approval.requesterId,
    }),
  ]);
  return ok({ state: next, value: { approval: closed, execution: ended } });
}

/** The founder rejects. A rejected request never runs. */
export const rejectRequest = (
  state: WorkspaceState,
  input: DecisionInput,
  context: CommandContext,
) => close(state, input, context, 'rejected');

/** The requester withdraws their own request (or the founder cancels it). */
export const cancelRequest = (
  state: WorkspaceState,
  input: DecisionInput,
  context: CommandContext,
) => close(state, input, context, 'cancelled');

/**
 * Explicitly retries a failed execution under a new request ID. It goes through
 * the whole pipeline again (permissions, validation, approval): a retry is never
 * a shortcut.
 */
export function retryExecution(
  state: WorkspaceState,
  input: { executionId: ExecutionId; requestId: string },
  context: Omit<CommandContext, 'actor'>,
): DomainResult<ExecutionOutcome> {
  const original = state.executions.find((item) => item.id === input.executionId);
  if (!original) return err(invalidReference('execution', input.executionId, 'executionId'));
  if (original.status !== 'failed') {
    return err(
      conflict(
        'no_change',
        original.status === 'succeeded'
          ? 'This action already succeeded; it will not run twice.'
          : `Only failed actions can be retried (this one is ${original.status.replace('_', ' ')}).`,
      ),
    );
  }
  return requestAction(
    state,
    {
      employeeId: original.actorId,
      action: original.action,
      requestId: input.requestId,
      reason: 'Retry of a failed request.',
      retryOf: original.id,
    },
    context,
  );
}
