import { conflict, notFound, type DomainResult } from '@/domain/errors';
import type { EmployeeId, EntityId, MeetingId, ProjectId, TaskId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import { syncCurrentTasks } from '@/domain/rules/employeeStatus';
import {
  actorIdOf,
  isTerminalStatus,
  type ActivityEvent,
  type ActivityEventType,
  type ActorId,
  type Department,
  type Employee,
  type Notification,
  type NotificationType,
  type Project,
  type Task,
  type WorkspaceState,
} from '@/domain/types';
import type { CommandContext } from './types';

/** Retention caps keep the durable state bounded; the oldest entries are dropped first. */
export const MAX_ACTIVITY_EVENTS = 1000;
export const MAX_NOTIFICATIONS = 200;

/** An agent may only act if it is a real employee. */
export function checkActor(state: WorkspaceState, context: CommandContext): DomainResult<ActorId> {
  const { actor } = context;
  if (actor.kind === 'agent' && !state.employees[actor.employeeId]) {
    return err({
      code: 'invalid_actor',
      message: `Agent "${actor.employeeId}" is not an employee of this workspace.`,
    });
  }
  return ok(actorIdOf(actor));
}

export function findProject(state: WorkspaceState, id: ProjectId): DomainResult<Project> {
  const project = state.projects[id];
  return project ? ok(project) : err(notFound('project', id));
}

export function findTask(state: WorkspaceState, id: TaskId): DomainResult<Task> {
  const task = state.tasks[id];
  return task ? ok(task) : err(notFound('task', id));
}

export function findEmployee(state: WorkspaceState, id: EmployeeId): DomainResult<Employee> {
  const employee = state.employees[id];
  return employee ? ok(employee) : err(notFound('employee', id));
}

export function findDepartment(
  state: WorkspaceState,
  id: Department['id'],
): DomainResult<Department> {
  const department = state.departments[id];
  return department ? ok(department) : err(notFound('department', id));
}

/** Archived projects are read-only: their tasks cannot be created or changed. */
export function requireOpenProject(project: Project): DomainResult<Project> {
  if (project.status === 'archived') {
    return err(
      conflict('project_archived', `"${project.name}" is archived and can no longer be changed.`),
    );
  }
  return ok(project);
}

/** Finished and cancelled tasks are immutable. */
export function requireOpenTask(task: Task): DomainResult<Task> {
  if (isTerminalStatus(task.status)) {
    return err(conflict('task_closed', `"${task.title}" is closed and can no longer be changed.`));
  }
  return ok(task);
}

export interface ActivityDraft {
  readonly eventType: ActivityEventType;
  readonly description: string;
  readonly projectId?: ProjectId | null;
  readonly taskId?: TaskId | null;
  readonly employeeId?: EmployeeId | null;
  readonly meetingId?: MeetingId | null;
}

export function activityEvent(
  context: CommandContext,
  timestamp: string,
  draft: ActivityDraft,
): ActivityEvent {
  return {
    id: context.ids.next('activity'),
    actorId: actorIdOf(context.actor),
    eventType: draft.eventType,
    description: draft.description,
    projectId: draft.projectId ?? null,
    taskId: draft.taskId ?? null,
    employeeId: draft.employeeId ?? null,
    meetingId: draft.meetingId ?? null,
    timestamp,
  };
}

export interface NotificationDraft {
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly relatedEntityId: EntityId | null;
}

export function notification(
  context: CommandContext,
  createdAt: string,
  draft: NotificationDraft,
): Notification {
  return { id: context.ids.next('notification'), ...draft, isRead: false, createdAt };
}

function appendCapped<T>(existing: readonly T[], added: readonly T[], max: number): readonly T[] {
  if (added.length === 0) return existing;
  const combined = [...existing, ...added];
  return combined.length > max ? combined.slice(combined.length - max) : combined;
}

/** Notifications pointing at deleted entities lose their pointer (they stay readable). */
export function detachNotifications(
  notifications: readonly Notification[],
  deleted: ReadonlySet<string>,
): readonly Notification[] {
  return notifications.map((item) =>
    item.relatedEntityId !== null && deleted.has(item.relatedEntityId)
      ? { ...item, relatedEntityId: null }
      : item,
  );
}

export interface StateChanges {
  /** Employee record edits (e.g. a rename). Current tasks are still re-synced when tasks change. */
  readonly employees?: WorkspaceState['employees'];
  readonly projects?: WorkspaceState['projects'];
  readonly meetings?: WorkspaceState['meetings'];
  readonly accessProfiles?: WorkspaceState['accessProfiles'];
  readonly approvals?: WorkspaceState['approvals'];
  readonly agentConfigs?: WorkspaceState['agentConfigs'];
  readonly messages?: WorkspaceState['messages'];
  readonly tasks?: WorkspaceState['tasks'];
  readonly notifications?: WorkspaceState['notifications'];
}

/**
 * Builds the next state for a command: applies entity changes, re-syncs every
 * employee's current task whenever tasks changed, and appends the activity events
 * and notifications. All commands finish through this one function so related
 * updates always land together.
 */
export function commit(
  state: WorkspaceState,
  changes: StateChanges,
  events: readonly ActivityEvent[],
  notifications: readonly Notification[],
): WorkspaceState {
  const tasks = changes.tasks ?? state.tasks;
  const employees = changes.employees ?? state.employees;
  return {
    departments: state.departments,
    employees: changes.tasks ? syncCurrentTasks(employees, tasks) : employees,
    projects: changes.projects ?? state.projects,
    tasks,
    meetings: changes.meetings ?? state.meetings,
    accessProfiles: changes.accessProfiles ?? state.accessProfiles,
    approvals: changes.approvals ?? state.approvals,
    executions: state.executions,
    agentConfigs: changes.agentConfigs ?? state.agentConfigs,
    messages: changes.messages ?? state.messages,
    activity: appendCapped(state.activity, events, MAX_ACTIVITY_EVENTS),
    notifications: appendCapped(
      changes.notifications ?? state.notifications,
      notifications,
      MAX_NOTIFICATIONS,
    ),
  };
}

/** Copy of `record` without the given keys. */
export function withoutKeys<K extends string, V>(
  record: Readonly<Record<K, V>>,
  keys: ReadonlySet<string>,
): Record<K, V> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.has(key))) as Record<
    K,
    V
  >;
}

/** Equality for field values: primitives by identity, string lists element-wise. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}

/** Names of the fields in `patch` whose value differs from `current`. */
export function changedFields<T extends object>(current: T, patch: Partial<T>): (keyof T)[] {
  return (Object.keys(patch) as (keyof T)[]).filter((key) => !sameValue(current[key], patch[key]));
}
