import type { Clock } from '@/domain/clock';
import type { DomainResult } from '@/domain/errors';
import type { ApprovalId, EmployeeId, ExecutionId, IdGenerator } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import type { Actor, ActionType, Execution, RequestedAction, WorkspaceState } from '@/domain/types';
import {
  approveRequest,
  cancelRequest,
  rejectRequest,
  requestAction,
  retryExecution,
  type ActionRequest,
  type DecisionInput,
  type DecisionOutcome,
  type ExecutionOutcome,
} from './execution';
import { createReader, type Reader } from './reads';
import { ACTION_HANDLERS, authorizeAction } from './registry';
import type { CommandHandler } from './types';

/** The minimal store surface commands need. Lets tests run against plain memory. */
export interface WorkspaceStorePort {
  getState(): WorkspaceState;
  /** Replaces the whole state in one step. */
  setState(next: WorkspaceState): void;
}

export interface CommandDependencies {
  readonly store: WorkspaceStorePort;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /**
   * Whether the workspace may be changed right now. When it returns false every
   * command is rejected with `workspace_unavailable` — this is what keeps commands
   * from touching a workspace that has not finished loading. Defaults to always.
   */
  readonly isAvailable?: () => boolean;
}

/**
 * The application's write API. Every method takes the acting Actor first, then the
 * command input, and returns a Result. There is no other way to change business
 * state: every call is authorized (identity, status, permission, scope, approval
 * policy) before its handler runs, whoever calls it.
 */
export type Commands = ReturnType<typeof createCommands>['commands'];

/** What an AI employee's runner is given: actions bound to that employee's identity. */
export interface AgentGateway {
  readonly employeeId: EmployeeId;
  request(
    action: RequestedAction,
    options: { requestId: string; reason?: string },
  ): DomainResult<ExecutionOutcome>;
  retry(executionId: ExecutionId, requestId: string): DomainResult<ExecutionOutcome>;
  cancel(approvalId: DecisionInput['approvalId']): DomainResult<DecisionOutcome>;
  /** The recorded outcome of one of this employee's own executions (null for anyone else's). */
  statusOf(executionId: ExecutionId): Pick<Execution, 'status' | 'error'> | null;
  /** The approval request behind one of this employee's own executions, if any. */
  approvalFor(executionId: ExecutionId): ApprovalId | null;
}

/**
 * Binds the pure handlers to a store. Executing a command reads the current
 * state, authorizes the actor, runs the handler and — only if it succeeded —
 * commits the complete next state in a single `setState`. A refused or rejected
 * command leaves the store untouched.
 */
export function createCommands({ store, clock, ids, isAvailable }: CommandDependencies) {
  const unavailable = () =>
    err({
      code: 'workspace_unavailable' as const,
      message: 'The workspace is not ready yet. Wait for it to finish loading and try again.',
    });

  const bind =
    <Input, Output>(type: ActionType, handler: CommandHandler<Input, Output>) =>
    (actor: Actor, input: Input): DomainResult<Output> => {
      if (isAvailable && !isAvailable()) return unavailable();
      const state = store.getState();
      // The security boundary: no handler runs for an actor who may not do this,
      // and an agent cannot skip a required approval by calling the command directly.
      const authorized = authorizeAction(state, actor, type, input);
      if (!authorized.ok) return authorized;
      const outcome = handler(state, input, { actor, clock, ids });
      if (!outcome.ok) return outcome;
      store.setState(outcome.value.state);
      return ok(outcome.value.value);
    };

  /** Commits an executor outcome. Duplicates change nothing. */
  const settle = <T extends { state: WorkspaceState; duplicate?: boolean }>(
    result: DomainResult<T>,
  ): DomainResult<T> => {
    if (result.ok && result.value.duplicate !== true) store.setState(result.value.state);
    return result;
  };

  const decision =
    (type: ActionType, run: typeof approveRequest) =>
    (actor: Actor, input: DecisionInput): DomainResult<DecisionOutcome> => {
      if (isAvailable && !isAvailable()) return unavailable();
      const state = store.getState();
      const authorized = authorizeAction(state, actor, type, input);
      if (!authorized.ok) return authorized;
      const outcome = run(state, input, { actor, clock, ids });
      if (!outcome.ok) return outcome;
      store.setState(outcome.value.state);
      return ok(outcome.value.value);
    };

  const h = ACTION_HANDLERS;
  const commands = {
    createProject: bind('createProject', h.createProject),
    updateProject: bind('updateProject', h.updateProject),
    deleteProject: bind('deleteProject', h.deleteProject),
    createTask: bind('createTask', h.createTask),
    updateTask: bind('updateTask', h.updateTask),
    assignTask: bind('assignTask', h.assignTask),
    changeTaskStatus: bind('changeTaskStatus', h.changeTaskStatus),
    deleteTask: bind('deleteTask', h.deleteTask),
    renameEmployee: bind('renameEmployee', h.renameEmployee),
    scheduleMeeting: bind('scheduleMeeting', h.scheduleMeeting),
    updateMeeting: bind('updateMeeting', h.updateMeeting),
    startMeeting: bind('startMeeting', h.startMeeting),
    completeMeeting: bind('completeMeeting', h.completeMeeting),
    cancelMeeting: bind('cancelMeeting', h.cancelMeeting),
    markNotificationRead: bind('markNotificationRead', h.markNotificationRead),
    markAllNotificationsRead: (actor: Actor) =>
      bind('markAllNotificationsRead', h.markAllNotificationsRead)(actor, undefined),
    updateAccessProfile: bind('updateAccessProfile', h.updateAccessProfile),
    sendMessage: bind('sendMessage', h.sendMessage),
    updateAgentConfig: bind('updateAgentConfig', h.updateAgentConfig),
    approveRequest: decision('approveRequest', approveRequest),
    rejectRequest: decision('rejectRequest', rejectRequest),
    cancelRequest: decision('cancelRequest', cancelRequest),
  } as const;

  /**
   * The execution pipeline for AI employees: records every request (allowed,
   * denied, failed or awaiting approval) and applies only what is authorized.
   */
  const executor = {
    request(request: ActionRequest): DomainResult<ExecutionOutcome> {
      if (isAvailable && !isAvailable()) return unavailable();
      return settle(requestAction(store.getState(), request, { clock, ids }));
    },
    retry(executionId: ExecutionId, requestId: string): DomainResult<ExecutionOutcome> {
      if (isAvailable && !isAvailable()) return unavailable();
      return settle(retryExecution(store.getState(), { executionId, requestId }, { clock, ids }));
    },
  };

  /**
   * The only handle an AI employee's runner should receive: identity is fixed
   * here by the application, so the runner cannot claim to be someone else, and
   * it exposes neither the raw commands nor workspace import, export or reset.
   */
  const gatewayFor = (employeeId: EmployeeId): AgentGateway =>
    Object.freeze({
      employeeId,
      request: (action: RequestedAction, options: { requestId: string; reason?: string }) =>
        executor.request({
          employeeId,
          action,
          requestId: options.requestId,
          reason: options.reason,
        }),
      retry: (executionId: ExecutionId, requestId: string) => {
        const original = store.getState().executions.find((item) => item.id === executionId);
        if (original && original.actorId !== employeeId) {
          return err({
            code: 'permission_denied' as const,
            permission: 'execution.retry',
            message: 'An employee can only retry their own requests.',
          });
        }
        return executor.retry(executionId, requestId);
      },
      cancel: (approvalId: DecisionInput['approvalId']) =>
        commands.cancelRequest({ kind: 'agent', employeeId }, { approvalId }),
      statusOf: (executionId: ExecutionId) => {
        const execution = store
          .getState()
          .executions.find((item) => item.id === executionId && item.actorId === employeeId);
        return execution ? { status: execution.status, error: execution.error } : null;
      },
      approvalFor: (executionId: ExecutionId) => {
        const execution = store
          .getState()
          .executions.find((item) => item.id === executionId && item.actorId === employeeId);
        return execution?.approvalId ?? null;
      },
    });

  /**
   * Scoped reads for one AI employee (Phase 2.0): explicit read permissions,
   * frozen views, no store access. Identity is fixed here, like the gateway.
   */
  const readerFor = (employeeId: EmployeeId): Reader =>
    createReader(() => store.getState(), employeeId);

  return { commands, executor, gatewayFor, readerFor };
}
