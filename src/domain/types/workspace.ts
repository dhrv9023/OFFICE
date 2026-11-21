import type { DepartmentId, EmployeeId, MeetingId, ProjectId, TaskId } from '../ids';
import type { ActivityEvent } from './activity';
import type { AccessProfile, ApprovalRequest, Execution } from './access';
import type { AgentConfig } from './agentConfig';
import type { Message } from './message';
import type { Department } from './department';
import type { Employee } from './employee';
import type { Meeting } from './meeting';
import type { Notification } from './notification';
import type { Project } from './project';
import type { Task } from './task';

export type EntityMap<K extends string, V> = Readonly<Record<K, V>>;

/**
 * The canonical durable business state: one immutable value holding everything.
 * Commands produce the next WorkspaceState from the current one; nothing else writes it.
 *
 * Derived values (employee work status, project progress, unread counts) are NOT
 * stored here — they are computed by pure functions in `rules/`.
 */
export interface WorkspaceState {
  readonly departments: EntityMap<DepartmentId, Department>;
  readonly employees: EntityMap<EmployeeId, Employee>;
  readonly projects: EntityMap<ProjectId, Project>;
  readonly tasks: EntityMap<TaskId, Task>;
  /** Meetings the founder has scheduled, held or cancelled (Phase 1.6). */
  readonly meetings: EntityMap<MeetingId, Meeting>;
  /** Audit log, oldest first. */
  readonly activity: readonly ActivityEvent[];
  /** Oldest first. */
  readonly notifications: readonly Notification[];
  /** What each AI employee may do (Phase 1.8). One per employee, keyed by employee ID. */
  readonly accessProfiles: EntityMap<EmployeeId, AccessProfile>;
  /** Requests waiting for (or decided by) the founder. Oldest first. */
  readonly approvals: readonly ApprovalRequest[];
  /** Every action an AI employee requested, and how it ended. Oldest first. */
  readonly executions: readonly Execution[];
  /** How each AI employee would run (Phase 2.0). One per employee. No credentials. */
  readonly agentConfigs: EntityMap<EmployeeId, AgentConfig>;
  /** Founder ↔ employee messages, oldest first (Phase 2.0). */
  readonly messages: readonly Message[];
}
