import { validationError, type DomainError } from '../errors';
import { ID_PREFIXES, type EntityId, type EntityKind, type Id } from '../ids';
import { err, ok, type Result } from '../result';
import { validateDeadline } from '../rules/validation';
import type { WorkspaceRecords } from '../rules/workspaceIntegrity';
import {
  ACCESS_STATUSES,
  ACTION_TYPES,
  APPROVAL_STATUSES,
  EXECUTION_STATUSES,
  GRANT_SCOPES,
  PERMISSION_NAMES,
  type AccessProfile,
  type ActionTarget,
  type ApprovalRequest,
  type Execution,
  type Grant,
  type RequestedAction,
} from '../types/access';
import { ACTIVITY_EVENT_TYPES, type ActivityEvent } from '../types/activity';
import type { AgentConfig } from '../types/agentConfig';
import type { Message } from '../types/message';
import type { ActorId } from '../types/actor';
import type { Department } from '../types/department';
import type { Employee } from '../types/employee';
import { MEETING_STATUSES, type Meeting } from '../types/meeting';
import { NOTIFICATION_TYPES, type Notification } from '../types/notification';
import { PRIORITIES } from '../types/priority';
import { PROJECT_CATEGORIES, PROJECT_STATUSES, type Project } from '../types/project';
import { TASK_STATUSES, type Task } from '../types/task';

/*
 * Structural decoding of untrusted data (a saved database record or an import file)
 * into typed entity records. This checks SHAPE only — every field present with the
 * right type and a legal enum value. Relationships and business invariants are
 * checked afterwards by `buildWorkspace`.
 *
 * Properties that are not part of an entity are dropped, so nothing unexpected can
 * ride along into the application state.
 */

interface Issue {
  readonly path: string;
  readonly message: string;
}

/** Marks a value that failed to decode (distinct from every legal value, including null). */
const INVALID = Symbol('invalid');
type Invalid = typeof INVALID;

/** Returns the decoded value, or INVALID after recording why it is not acceptable. */
type Decoder<T> = (value: unknown, path: string, issues: Issue[]) => T | Invalid;

function fail(issues: Issue[], path: string, message: string): Invalid {
  issues.push({ path, message });
  return INVALID;
}

const text: Decoder<string> = (value, path, issues) =>
  typeof value === 'string' ? value : fail(issues, path, 'must be text');

const flag: Decoder<boolean> = (value, path, issues) =>
  typeof value === 'boolean' ? value : fail(issues, path, 'must be true or false');

const timestamp: Decoder<string> = (value, path, issues) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : fail(issues, path, 'must be a date-time such as 2026-01-31T09:00:00.000Z');

function isId<K extends EntityKind>(kind: K, value: unknown): value is Id<K> {
  const prefix = `${ID_PREFIXES[kind]}_`;
  return typeof value === 'string' && value.startsWith(prefix) && value.length > prefix.length;
}

const id =
  <K extends EntityKind>(kind: K): Decoder<Id<K>> =>
  (value, path, issues) =>
    isId(kind, value)
      ? value
      : fail(issues, path, `must be a ${kind} ID starting with "${ID_PREFIXES[kind]}_"`);

const oneOf =
  <T extends string>(options: readonly T[]): Decoder<T> =>
  (value, path, issues) =>
    options.find((option) => option === value) ??
    fail(issues, path, `must be one of: ${options.join(', ')}`);

const nullable =
  <T>(decoder: Decoder<T>): Decoder<T | null> =>
  (value, path, issues) =>
    value === null ? null : decoder(value, path, issues);

const list =
  <T>(decoder: Decoder<T>): Decoder<T[]> =>
  (value, path, issues) => {
    if (!Array.isArray(value)) return fail(issues, path, 'must be a list');
    const items: T[] = [];
    let valid = true;
    const entries = value as unknown[];
    for (let index = 0; index < entries.length; index++) {
      const item = decoder(entries[index], `${path}[${index}]`, issues);
      if (item === INVALID) valid = false;
      else items.push(item);
    }
    return valid ? items : INVALID;
  };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const shape =
  <T extends object>(fields: { readonly [K in keyof T]-?: Decoder<T[K]> }): Decoder<T> =>
  (value, path, issues) => {
    if (!isPlainObject(value)) return fail(issues, path, 'must be an object');
    const result: Record<string, unknown> = {};
    let valid = true;
    for (const key of Object.keys(fields) as (keyof T & string)[]) {
      if (!(key in value)) {
        fail(issues, `${path}.${key}`, 'is missing');
        valid = false;
        continue;
      }
      const decoded = fields[key](value[key], `${path}.${key}`, issues);
      if (decoded === INVALID) valid = false;
      else result[key] = decoded;
    }
    return valid ? (result as T) : INVALID;
  };

const actorId: Decoder<ActorId> = (value, path, issues) =>
  value === 'user' || value === 'system' || isId('employee', value)
    ? value
    : fail(issues, path, 'must be "user", "system" or an employee ID');

const entityId: Decoder<EntityId> = (value, path, issues) =>
  isId('department', value) ||
  isId('employee', value) ||
  isId('project', value) ||
  isId('task', value) ||
  isId('approval', value)
    ? value
    : fail(issues, path, 'must be a department, employee, project, task or approval ID');

const deadline: Decoder<string | null> = (value, path, issues) => {
  const result = validateDeadline(value);
  return result.ok ? result.value : fail(issues, path, 'must be a date like 2026-12-31, or null');
};

const department = shape<Department>({
  id: id('department'),
  name: text,
  description: text,
  color: text,
  roomId: id('room'),
});

const employee = shape<Employee>({
  id: id('employee'),
  name: text,
  role: text,
  departmentId: id('department'),
  description: text,
  skills: list(text),
  currentTaskId: nullable(id('task')),
  deskId: id('desk'),
  avatarId: text,
  createdAt: timestamp,
});

const project = shape<Project>({
  id: id('project'),
  name: text,
  description: text,
  category: oneOf(PROJECT_CATEGORIES),
  objectives: list(text),
  requirements: list(text),
  priority: oneOf(PRIORITIES),
  status: oneOf(PROJECT_STATUSES),
  deadline,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const task = shape<Task>({
  id: id('task'),
  projectId: id('project'),
  departmentId: id('department'),
  assigneeId: nullable(id('employee')),
  title: text,
  description: text,
  priority: oneOf(PRIORITIES),
  status: oneOf(TASK_STATUSES),
  dependencies: list(id('task')),
  deadline,
  blockedReason: nullable(text),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const durationMinutes: Decoder<number> = (value, path, issues) =>
  typeof value === 'number' && Number.isInteger(value)
    ? value
    : fail(issues, path, 'must be a whole number of minutes');

const meeting = shape<Meeting>({
  id: id('meeting'),
  title: text,
  agenda: text,
  roomId: id('room'),
  participantIds: list(id('employee')),
  startsAt: nullable(text),
  durationMinutes: nullable(durationMinutes),
  projectId: nullable(id('project')),
  status: oneOf(MEETING_STATUSES),
  notes: text,
  createdAt: timestamp,
  updatedAt: timestamp,
});

const activityEvent = shape<ActivityEvent>({
  id: id('activity'),
  actorId,
  eventType: oneOf(ACTIVITY_EVENT_TYPES),
  description: text,
  projectId: nullable(id('project')),
  taskId: nullable(id('task')),
  employeeId: nullable(id('employee')),
  meetingId: nullable(id('meeting')),
  timestamp,
});

const notification = shape<Notification>({
  id: id('notification'),
  title: text,
  message: text,
  type: oneOf(NOTIFICATION_TYPES),
  relatedEntityId: nullable(entityId),
  isRead: flag,
  createdAt: timestamp,
});

const grant = shape<Grant>({
  permission: oneOf(PERMISSION_NAMES),
  scope: oneOf(GRANT_SCOPES),
  requiresApproval: flag,
});

const accessProfile = shape<AccessProfile>({
  employeeId: id('employee'),
  status: oneOf(ACCESS_STATUSES),
  grants: list(grant),
  updatedAt: timestamp,
});

const targetTypes = ['project', 'task', 'employee', 'meeting', 'workspace'] as const;
const actionTarget = shape<ActionTarget>({
  type: oneOf(targetTypes),
  id: nullable(text),
  label: text,
  version: text,
});

/** Action inputs are plain JSON written by the app; kept as they are. */
const json: Decoder<unknown> = (value) => value;

const requestedAction = shape<RequestedAction>({
  type: oneOf(ACTION_TYPES),
  input: json,
});

const approvalRequest = shape<ApprovalRequest>({
  id: id('approval'),
  executionId: id('execution'),
  requesterId: id('employee'),
  action: requestedAction,
  target: actionTarget,
  summary: text,
  reason: text,
  policyReason: text,
  status: oneOf(APPROVAL_STATUSES),
  createdAt: timestamp,
  decidedAt: nullable(timestamp),
  decidedBy: nullable(actorId),
  decisionNote: text,
});

const executionError = shape<{ code: string; message: string }>({ code: text, message: text });

const execution = shape<Execution>({
  id: id('execution'),
  requestId: text,
  actorId: id('employee'),
  action: requestedAction,
  target: actionTarget,
  summary: text,
  status: oneOf(EXECUTION_STATUSES),
  approvalId: nullable(id('approval')),
  retryOf: nullable(id('execution')),
  requestedAt: timestamp,
  completedAt: nullable(timestamp),
  result: text,
  error: nullable(executionError),
});

const finite: Decoder<number> = (value, path, issues) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail(issues, path, 'must be a number');

/** Known fields only: anything else (a stray key, a credential) is dropped on load. */
const agentConfig = shape<AgentConfig>({
  employeeId: id('employee'),
  configVersion: finite,
  provider: nullable(text),
  model: text,
  systemInstructions: text,
  timeoutMs: finite,
  maxIterations: finite,
  maxTokens: finite,
  maxCostUsd: nullable(finite),
  updatedAt: timestamp,
});

const message = shape<Message>({
  id: id('message'),
  from: actorId,
  to: actorId,
  body: text,
  createdAt: timestamp,
});

const workspaceRecords = shape<WorkspaceRecords>({
  departments: list(department),
  employees: list(employee),
  projects: list(project),
  tasks: list(task),
  meetings: list(meeting),
  activity: list(activityEvent),
  notifications: list(notification),
  accessProfiles: list(accessProfile),
  approvals: list(approvalRequest),
  executions: list(execution),
  agentConfigs: list(agentConfig),
  messages: list(message),
});

/**
 * Decodes the `workspace` payload of a snapshot. On failure, returns EVERY
 * structural problem found, each with the path of the offending value
 * (e.g. `workspace.tasks[3].status`).
 */
export function decodeWorkspaceRecords(value: unknown): Result<WorkspaceRecords, DomainError[]> {
  const issues: Issue[] = [];
  const records = workspaceRecords(value, 'workspace', issues);
  if (records === INVALID) {
    return err(
      issues.map((issue) => validationError(issue.path, `${issue.path} ${issue.message}.`)),
    );
  }
  return ok(records);
}
