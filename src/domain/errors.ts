import type { EntityKind, TaskId } from './ids';
import type { Result } from './result';
import type { ProjectStatus } from './types/project';
import type { TaskStatus } from './types/task';

export type AssignmentRejection =
  /** Employee's department differs from the task's and cross-department work was not allowed. */
  | 'department_mismatch'
  /** Employee already has an active (in progress / in review) task. */
  | 'employee_busy'
  /** Task is done or cancelled. */
  | 'task_closed'
  /** An active task must keep an assignee. */
  | 'assignee_required';

export type ConflictReason =
  | 'no_change'
  | 'project_archived'
  /** Completed projects take no new tasks until they are reopened. */
  | 'project_completed'
  /** A project cannot be completed while it has open tasks. */
  | 'project_open_tasks'
  | 'task_closed'
  /** A held or cancelled meeting is a closed record. */
  | 'meeting_closed'
  /** An approval request was already decided, cancelled or made stale. */
  | 'approval_closed'
  /** The same request ID was used for a different action. */
  | 'idempotency_conflict';

/**
 * Every way a business operation can be rejected. `code` discriminates the union;
 * `message` is always present and safe to show to a user.
 */
export type DomainError =
  | { readonly code: 'validation'; readonly field: string; readonly message: string }
  | {
      readonly code: 'not_found';
      readonly entity: EntityKind;
      readonly id: string;
      readonly message: string;
    }
  | {
      readonly code: 'invalid_reference';
      readonly entity: EntityKind;
      readonly id: string;
      readonly field: string;
      readonly message: string;
    }
  | {
      readonly code: 'duplicate_id';
      readonly entity: EntityKind;
      readonly id: string;
      readonly message: string;
    }
  | {
      readonly code: 'invalid_transition';
      readonly from: TaskStatus;
      readonly to: TaskStatus;
      readonly message: string;
    }
  | {
      readonly code: 'invalid_project_transition';
      readonly from: ProjectStatus;
      readonly to: ProjectStatus;
      readonly message: string;
    }
  | {
      readonly code: 'assignment_rejected';
      readonly reason: AssignmentRejection;
      readonly message: string;
    }
  | {
      readonly code: 'dependency_cycle';
      /** The loop, starting and ending at the same task. */
      readonly cycle: readonly TaskId[];
      readonly message: string;
    }
  | {
      readonly code: 'dependencies_incomplete';
      /** Every dependency that is not done. */
      readonly blockedBy: readonly TaskId[];
      /** The subset of `blockedBy` that was cancelled and so will never be done. */
      readonly cancelled: readonly TaskId[];
      readonly message: string;
    }
  | { readonly code: 'conflict'; readonly reason: ConflictReason; readonly message: string }
  | { readonly code: 'invalid_actor'; readonly message: string }
  /** The actor is known but may not do this (missing grant, wrong scope, inactive, founder-only). */
  | { readonly code: 'permission_denied'; readonly permission: string; readonly message: string }
  /** Allowed only with the founder's approval: request it through the executor. */
  | { readonly code: 'approval_required'; readonly permission: string; readonly message: string }
  /** Commands were called before the workspace finished loading, or while it is being replaced. */
  | { readonly code: 'workspace_unavailable'; readonly message: string };

export type DomainErrorCode = DomainError['code'];

export type DomainResult<T> = Result<T, DomainError>;

const ENTITY_LABELS: Record<EntityKind, string> = {
  department: 'Department',
  employee: 'Employee',
  project: 'Project',
  task: 'Task',
  activity: 'Activity event',
  notification: 'Notification',
  meeting: 'Meeting',
  approval: 'Approval request',
  execution: 'Execution',
  message: 'Message',
  room: 'Room',
  desk: 'Desk',
};

export function validationError(field: string, message: string): DomainError {
  return { code: 'validation', field, message };
}

export function notFound(entity: EntityKind, id: string): DomainError {
  return {
    code: 'not_found',
    entity,
    id,
    message: `${ENTITY_LABELS[entity]} "${id}" was not found.`,
  };
}

export function invalidReference(
  entity: EntityKind,
  id: string,
  field: string,
  message?: string,
): DomainError {
  return {
    code: 'invalid_reference',
    entity,
    id,
    field,
    message:
      message ??
      `${field} refers to ${ENTITY_LABELS[entity].toLowerCase()} "${id}", which does not exist.`,
  };
}

export function duplicateId(entity: EntityKind, id: string): DomainError {
  return {
    code: 'duplicate_id',
    entity,
    id,
    message: `${ENTITY_LABELS[entity]} ID "${id}" is used more than once.`,
  };
}

export function assignmentRejected(reason: AssignmentRejection, message: string): DomainError {
  return { code: 'assignment_rejected', reason, message };
}

export function conflict(reason: ConflictReason, message: string): DomainError {
  return { code: 'conflict', reason, message };
}
