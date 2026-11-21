import type { DomainError, DomainResult } from '@/domain/errors';
import { err, ok } from '@/domain/result';
import { authorize, type Authorization } from '@/domain/rules/access';
import type { Actor, ActionType, WorkspaceState } from '@/domain/types';
import { assignTask } from './handlers/assignTask';
import { changeTaskStatus } from './handlers/changeTaskStatus';
import { createProject } from './handlers/createProject';
import { createTask } from './handlers/createTask';
import { deleteProject } from './handlers/deleteProject';
import { deleteTask } from './handlers/deleteTask';
import {
  cancelMeeting,
  completeMeeting,
  scheduleMeeting,
  startMeeting,
  updateMeeting,
} from './handlers/meetings';
import { markAllNotificationsRead, markNotificationRead } from './handlers/notifications';
import { sendMessage } from './handlers/messages';
import { renameEmployee } from './handlers/renameEmployee';
import { updateAgentConfig } from './handlers/updateAgentConfig';
import { updateAccessProfile } from './handlers/updateAccessProfile';
import { updateProject } from './handlers/updateProject';
import { updateTask } from './handlers/updateTask';
import type { CommandContext, CommandHandler, CommandOutcome } from './types';

/**
 * The business actions an actor (or an approved request) can run, by action
 * type. Approval decisions are not here: they are not actions an agent can ask
 * for, and they run these handlers themselves.
 */
export const ACTION_HANDLERS = {
  createProject,
  updateProject,
  deleteProject,
  createTask,
  updateTask,
  assignTask,
  changeTaskStatus,
  deleteTask,
  renameEmployee,
  scheduleMeeting,
  updateMeeting,
  startMeeting,
  completeMeeting,
  cancelMeeting,
  markNotificationRead,
  markAllNotificationsRead,
  updateAccessProfile,
  sendMessage,
  updateAgentConfig,
} as const;

export type BusinessAction = keyof typeof ACTION_HANDLERS;

export function isBusinessAction(type: string): type is BusinessAction {
  return type in ACTION_HANDLERS;
}

/**
 * The single authorization step every action passes, whoever calls it.
 * `approved` is set only by the approval handler, never by callers.
 */
export function authorizeAction(
  state: WorkspaceState,
  actor: Actor,
  type: ActionType,
  input: unknown,
  approved = false,
): DomainResult<Authorization> {
  const authorization = authorize(state, actor, type, input);
  if (!authorization.ok) return authorization;
  if (authorization.value.approvalReason !== null && !approved) {
    const error: DomainError = {
      code: 'approval_required',
      permission: authorization.value.permissions[0] ?? type,
      message: `${authorization.value.approvalReason} Ask through an approval request instead.`,
    };
    return err(error);
  }
  return ok(authorization.value);
}

/** Runs a business action's handler on `state` without committing anything. */
export function runAction(
  type: BusinessAction,
  state: WorkspaceState,
  input: unknown,
  context: CommandContext,
): DomainResult<CommandOutcome<unknown>> {
  const handler = ACTION_HANDLERS[type] as CommandHandler<unknown, unknown>;
  return handler(state, input, context);
}
