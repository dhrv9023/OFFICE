import type { ActivityEventId, EmployeeId, MeetingId, ProjectId, TaskId } from '../ids';
import type { ActorId } from './actor';

export const ACTIVITY_EVENT_TYPES = [
  'project.created',
  'project.updated',
  'project.status_changed',
  'project.deleted',
  'task.created',
  'task.updated',
  'task.assigned',
  'task.reassigned',
  'task.unassigned',
  'task.status_changed',
  'task.deleted',
  'employee.renamed',
  'meeting.scheduled',
  'meeting.updated',
  'meeting.started',
  'meeting.completed',
  'meeting.cancelled',
  'access.changed',
  'agent.configured',
  'approval.requested',
  'approval.approved',
  'approval.rejected',
  'approval.cancelled',
  'approval.stale',
] as const;
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

/**
 * One immutable entry in the audit log. References are kept even after the entity
 * they point to is deleted — the log records history, so `description` is rendered
 * at write time and never depends on the entity still existing.
 */
export interface ActivityEvent {
  readonly id: ActivityEventId;
  readonly actorId: ActorId;
  readonly eventType: ActivityEventType;
  readonly description: string;
  readonly projectId: ProjectId | null;
  readonly taskId: TaskId | null;
  readonly employeeId: EmployeeId | null;
  /** The meeting involved, if any (schema v3). */
  readonly meetingId: MeetingId | null;
  readonly timestamp: string;
}
