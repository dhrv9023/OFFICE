/**
 * Identifiers are plain strings with a kind prefix (`task_…`, `emp_…`). The prefix is
 * encoded in the type, so a ProjectId cannot be passed where a TaskId is expected,
 * and an ID seen in a log or database is self-describing.
 */
export const ID_PREFIXES = {
  department: 'dept',
  employee: 'emp',
  project: 'prj',
  task: 'task',
  activity: 'evt',
  notification: 'ntf',
  meeting: 'mtg',
  approval: 'apr',
  execution: 'exe',
  message: 'msg',
  room: 'room',
  desk: 'desk',
} as const;

export type EntityKind = keyof typeof ID_PREFIXES;

export type Id<K extends EntityKind> = `${(typeof ID_PREFIXES)[K]}_${string}`;

export type DepartmentId = Id<'department'>;
export type EmployeeId = Id<'employee'>;
export type ProjectId = Id<'project'>;
export type TaskId = Id<'task'>;
export type ActivityEventId = Id<'activity'>;
export type NotificationId = Id<'notification'>;
export type MeetingId = Id<'meeting'>;
export type ApprovalId = Id<'approval'>;
export type ExecutionId = Id<'execution'>;
export type MessageId = Id<'message'>;
export type RoomId = Id<'room'>;
export type DeskId = Id<'desk'>;

/** IDs a notification may point at. */
export type EntityId = DepartmentId | EmployeeId | ProjectId | TaskId | ApprovalId;

/**
 * The only way new IDs are minted. Production uses a random implementation
 * (services/ids.ts); tests use the sequential one below for reproducible output.
 */
export interface IdGenerator {
  next<K extends EntityKind>(kind: K): Id<K>;
}

/** Deterministic generator: `prj_0001`, `task_0001`, `task_0002`, … (one counter per kind). */
export function createSequentialIdGenerator(): IdGenerator {
  const counters = new Map<EntityKind, number>();
  return {
    next<K extends EntityKind>(kind: K): Id<K> {
      const n = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, n);
      return `${ID_PREFIXES[kind]}_${String(n).padStart(4, '0')}` as Id<K>;
    },
  };
}
