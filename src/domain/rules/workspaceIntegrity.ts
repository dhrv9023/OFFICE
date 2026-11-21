import { duplicateId, invalidReference, validationError, type DomainError } from '../errors';
import type { EntityKind } from '../ids';
import { err, ok, type Result } from '../result';
import type { AccessProfile, ApprovalRequest, Execution } from '../types/access';
import type { ActivityEvent } from '../types/activity';
import type { AgentConfig } from '../types/agentConfig';
import type { Message } from '../types/message';
import type { Department } from '../types/department';
import type { Employee } from '../types/employee';
import type { Meeting } from '../types/meeting';
import type { Notification } from '../types/notification';
import type { OfficeLayout } from '../types/office';
import type { Project } from '../types/project';
import { isActiveStatus, type Task } from '../types/task';
import type { WorkspaceState } from '../types/workspace';
import { findDependencyCycle } from './dependencies';
import { validateGrants } from './access';
import { validateAgentConfig } from './agentConfig';
import { validateMessageBody } from './validation';
import { findActiveTask } from './employeeStatus';
import {
  checkMeetingParticipants,
  meetingWindow,
  validateMeetingDuration,
  validateMeetingStart,
} from './meetings';
import { checkProjectState } from './projectTransitions';
import {
  validateEmployeeName,
  validateMeetingTitle,
  validateProjectName,
  validateTaskTitle,
} from './validation';

/** IDs that occur more than once, each reported once, in first-seen order. */
export function findDuplicateIds(items: readonly { readonly id: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { id } of items) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

/** Flat lists of entities, as found in seed data, an import file or a database. */
export interface WorkspaceRecords {
  readonly departments: readonly Department[];
  readonly employees: readonly Employee[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
  readonly meetings: readonly Meeting[];
  readonly activity: readonly ActivityEvent[];
  readonly notifications: readonly Notification[];
  readonly accessProfiles: readonly AccessProfile[];
  readonly approvals: readonly ApprovalRequest[];
  readonly executions: readonly Execution[];
  readonly agentConfigs: readonly AgentConfig[];
  readonly messages: readonly Message[];
}

function indexById<T extends { readonly id: string }>(items: readonly T[]): Record<T['id'], T> {
  const map = {} as Record<T['id'], T>;
  for (const item of items) map[item.id as T['id']] = item;
  return map;
}

/**
 * Builds a WorkspaceState from flat records, refusing anything inconsistent.
 * This is the gate for data entering from outside the command path (seed now;
 * persistence and import in Phase 1.2).
 */
export function buildWorkspace(
  records: WorkspaceRecords,
  layout: OfficeLayout,
): Result<WorkspaceState, DomainError[]> {
  const duplicates: DomainError[] = [];
  const collect = (entity: EntityKind, items: readonly { readonly id: string }[]): void => {
    for (const id of findDuplicateIds(items)) duplicates.push(duplicateId(entity, id));
  };
  collect('department', records.departments);
  collect('employee', records.employees);
  collect('project', records.projects);
  collect('task', records.tasks);
  collect('meeting', records.meetings);
  collect('activity', records.activity);
  collect('notification', records.notifications);
  collect('approval', records.approvals);
  collect('execution', records.executions);
  collect('message', records.messages);
  for (const id of findDuplicateIds(
    records.agentConfigs.map((config) => ({ id: config.employeeId })),
  )) {
    duplicates.push(duplicateId('employee', id));
  }
  for (const id of findDuplicateIds(
    records.accessProfiles.map((profile) => ({ id: profile.employeeId })),
  )) {
    duplicates.push(duplicateId('employee', id));
  }
  if (duplicates.length > 0) return err(duplicates);

  const state: WorkspaceState = {
    departments: indexById(records.departments),
    employees: indexById(records.employees),
    projects: indexById(records.projects),
    tasks: indexById(records.tasks),
    meetings: indexById(records.meetings),
    activity: records.activity,
    notifications: records.notifications,
    accessProfiles: Object.fromEntries(
      records.accessProfiles.map((profile) => [profile.employeeId, profile]),
    ),
    approvals: records.approvals,
    executions: records.executions,
    agentConfigs: Object.fromEntries(
      records.agentConfigs.map((config) => [config.employeeId, config]),
    ),
    messages: records.messages,
  };

  const errors = validateWorkspace(state, layout);
  return errors.length > 0 ? err(errors) : ok(state);
}

/**
 * Checks every invariant of the business state and returns all violations
 * (empty = consistent). Commands are written to preserve these; tests assert it
 * after every command, and loading code must run it on untrusted data.
 */
export function validateWorkspace(state: WorkspaceState, layout: OfficeLayout): DomainError[] {
  const errors: DomainError[] = [];
  const tasks = Object.values(state.tasks);

  const checkKeys = (entity: EntityKind, map: Readonly<Record<string, { id: string }>>): void => {
    for (const [key, value] of Object.entries(map)) {
      if (key !== value.id) {
        errors.push(validationError('id', `${entity} stored under "${key}" has ID "${value.id}".`));
      }
    }
  };
  checkKeys('department', state.departments);
  checkKeys('employee', state.employees);
  checkKeys('project', state.projects);
  checkKeys('task', state.tasks);
  checkKeys('meeting', state.meetings);

  for (const id of findDuplicateIds(state.activity)) errors.push(duplicateId('activity', id));
  for (const id of findDuplicateIds(state.notifications)) {
    errors.push(duplicateId('notification', id));
  }

  // Departments ↔ rooms
  for (const department of Object.values(state.departments)) {
    const room = layout.rooms.find((candidate) => candidate.id === department.roomId);
    if (!room) {
      errors.push(invalidReference('room', department.roomId, 'department.roomId'));
    } else if (room.departmentId !== department.id) {
      errors.push(
        invalidReference(
          'room',
          department.roomId,
          'department.roomId',
          `${room.name} is not ${department.name}'s room.`,
        ),
      );
    }
  }

  // Employees ↔ departments, desks, current task
  const deskOwners = new Map<string, string>();
  for (const employee of Object.values(state.employees)) {
    const department = state.departments[employee.departmentId];
    if (!department) {
      errors.push(invalidReference('department', employee.departmentId, 'employee.departmentId'));
    }
    const name = validateEmployeeName(employee.name);
    if (!name.ok || name.value !== employee.name) {
      errors.push(
        validationError('employee.name', `Employee "${employee.id}" has an invalid name.`),
      );
    }

    const desk = layout.desks.find((candidate) => candidate.id === employee.deskId);
    if (!desk) {
      errors.push(invalidReference('desk', employee.deskId, 'employee.deskId'));
    } else if (department && desk.roomId !== department.roomId) {
      errors.push(
        invalidReference(
          'desk',
          employee.deskId,
          'employee.deskId',
          `${employee.name}'s desk is not in their department's room.`,
        ),
      );
    }

    const otherOwner = deskOwners.get(employee.deskId);
    if (otherOwner) {
      errors.push(
        validationError(
          'employee.deskId',
          `${employee.name} and ${otherOwner} share desk "${employee.deskId}".`,
        ),
      );
    }
    deskOwners.set(employee.deskId, employee.name);

    const active = tasks.filter(
      (task) => task.assigneeId === employee.id && isActiveStatus(task.status),
    );
    if (active.length > 1) {
      errors.push(
        validationError(
          'task.assigneeId',
          `${employee.name} has ${active.length} active tasks; at most one is allowed.`,
        ),
      );
    }
    const expected = findActiveTask(employee.id, tasks)?.id ?? null;
    if (employee.currentTaskId !== expected) {
      errors.push(
        validationError(
          'employee.currentTaskId',
          `${employee.name}'s current task is out of sync with task state.`,
        ),
      );
    }
  }

  // Projects
  for (const project of Object.values(state.projects)) {
    const name = validateProjectName(project.name);
    if (!name.ok) errors.push(name.error);
    const lifecycle = checkProjectState(
      project,
      tasks.filter((task) => task.projectId === project.id),
    );
    if (!lifecycle.ok) errors.push(lifecycle.error);
  }

  // Tasks ↔ projects, departments, assignees, dependencies
  for (const task of tasks) {
    const title = validateTaskTitle(task.title);
    if (!title.ok) errors.push(title.error);

    if (!state.projects[task.projectId]) {
      errors.push(invalidReference('project', task.projectId, 'task.projectId'));
    }
    if (!state.departments[task.departmentId]) {
      errors.push(invalidReference('department', task.departmentId, 'task.departmentId'));
    }
    if (task.assigneeId !== null && !state.employees[task.assigneeId]) {
      errors.push(invalidReference('employee', task.assigneeId, 'task.assigneeId'));
    }
    if (task.blockedReason !== null && task.status !== 'blocked') {
      errors.push(
        validationError(
          'task.blockedReason',
          `"${task.title}" has a blocked reason but is not blocked.`,
        ),
      );
    }
    if (task.assigneeId === null && isActiveStatus(task.status)) {
      errors.push(
        validationError('task.assigneeId', `Active task "${task.title}" has no assignee.`),
      );
    }

    for (const id of findDuplicateIds(
      task.dependencies.map((dependency) => ({ id: dependency })),
    )) {
      errors.push(validationError('task.dependencies', `"${task.title}" lists "${id}" twice.`));
    }
    for (const dependencyId of task.dependencies) {
      const dependency = state.tasks[dependencyId];
      if (!dependency) {
        errors.push(invalidReference('task', dependencyId, 'task.dependencies'));
      } else if (dependency.projectId !== task.projectId) {
        errors.push(
          invalidReference(
            'task',
            dependencyId,
            'task.dependencies',
            `"${task.title}" depends on a task in another project.`,
          ),
        );
      }
    }
    const cycle = findDependencyCycle(task.id, task.dependencies, state.tasks);
    if (cycle) {
      errors.push({
        code: 'dependency_cycle',
        cycle,
        message: `"${task.title}" is part of a circular dependency.`,
      });
    }
  }

  // Meetings ↔ rooms, participants
  for (const meeting of Object.values(state.meetings)) {
    const title = validateMeetingTitle(meeting.title);
    if (!title.ok) errors.push(title.error);
    const room = layout.rooms.find((candidate) => candidate.id === meeting.roomId);
    if (room?.kind !== 'meeting') {
      errors.push(invalidReference('room', meeting.roomId, 'meeting.roomId'));
    }
    const participants = checkMeetingParticipants(meeting.participantIds, state.employees);
    if (!participants.ok) errors.push(participants.error);
    // A time is optional only for meetings created before v3, and then both are missing.
    if (meeting.startsAt !== null || meeting.durationMinutes !== null) {
      const start = validateMeetingStart(meeting.startsAt);
      if (!start.ok) errors.push(start.error);
      const duration = validateMeetingDuration(meeting.durationMinutes);
      if (!duration.ok) errors.push(duration.error);
      if (start.ok && duration.ok && !meetingWindow(meeting)) {
        errors.push(validationError('meeting.startsAt', `"${meeting.title}" has no valid time.`));
      }
    }
    if (meeting.projectId !== null && !state.projects[meeting.projectId]) {
      errors.push(invalidReference('project', meeting.projectId, 'meeting.projectId'));
    }
  }

  // Access: one valid profile per employee, nothing for unknown employees.
  for (const employee of Object.values(state.employees)) {
    const profile = state.accessProfiles[employee.id];
    if (!profile) {
      errors.push(validationError('accessProfiles', `${employee.name} has no access profile.`));
      continue;
    }
    const grants = validateGrants(profile.grants);
    if (!grants.ok) errors.push(grants.error);
  }
  for (const [key, profile] of Object.entries(state.accessProfiles)) {
    if (key !== profile.employeeId || !state.employees[profile.employeeId]) {
      errors.push(invalidReference('employee', profile.employeeId, 'accessProfiles'));
    }
  }
  // Agent configurations: one valid one per employee. Messages: between real actors.
  for (const employee of Object.values(state.employees)) {
    const config = state.agentConfigs[employee.id];
    if (!config) {
      errors.push(validationError('agentConfigs', `${employee.name} has no agent configuration.`));
      continue;
    }
    const valid = validateAgentConfig(config);
    if (!valid.ok) errors.push(valid.error);
  }
  for (const [key, config] of Object.entries(state.agentConfigs)) {
    if (key !== config.employeeId || !state.employees[config.employeeId]) {
      errors.push(invalidReference('employee', config.employeeId, 'agentConfigs'));
    }
  }
  for (const message of state.messages) {
    const body = validateMessageBody(message.body);
    if (!body.ok) errors.push(body.error);
    if (message.from === message.to || (message.from !== 'user' && message.to !== 'user')) {
      errors.push(validationError('message', 'Messages go between the founder and one employee.'));
    }
  }

  // Approvals and executions are history: they may name deleted resources, but
  // their requester must be (or have been) an employee, and links must resolve.
  const executionIds = new Set(state.executions.map((execution) => execution.id));
  for (const approval of state.approvals) {
    if (approval.status === 'pending' && !state.employees[approval.requesterId]) {
      errors.push(invalidReference('employee', approval.requesterId, 'approval.requesterId'));
    }
    if (approval.status === 'pending' && !executionIds.has(approval.executionId)) {
      errors.push(invalidReference('execution', approval.executionId, 'approval.executionId'));
    }
  }
  for (const id of findDuplicateIds(
    state.executions.map((execution) => ({ id: `${execution.actorId}|${execution.requestId}` })),
  )) {
    errors.push(validationError('execution.requestId', `Request "${id}" was recorded twice.`));
  }

  // Notifications must point at something that exists (deletes clear the pointer).
  // Activity events are history and may legitimately reference deleted entities.
  for (const notification of state.notifications) {
    const id = notification.relatedEntityId;
    if (id === null) continue;
    const exists =
      id in state.projects ||
      id in state.tasks ||
      id in state.employees ||
      id in state.departments ||
      state.approvals.some((approval) => approval.id === id);
    if (!exists) {
      errors.push(
        validationError(
          'notification.relatedEntityId',
          `Notification "${notification.title}" points at "${id}", which does not exist.`,
        ),
      );
    }
  }

  return errors;
}
