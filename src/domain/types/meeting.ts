import type { EmployeeId, MeetingId, ProjectId, RoomId } from '../ids';

/**
 * A meeting is a record the founder keeps: who is invited, when, what it is about
 * and — once it has taken place — what was decided. It is not a simulation:
 * nobody moves, talks or decides anything on their own, and no meeting starts or
 * ends by itself when its time comes. The founder starts it, and records the
 * outcome. (Agents attending meetings is a later phase.)
 *
 *  scheduled ──start──▶ in_progress ──complete──▶ completed
 *      │                                            ▲
 *      ├──────────────── complete (afterwards) ─────┘
 *      └──cancel──▶ cancelled
 */
export const MEETING_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_STATUS_LABELS: Readonly<Record<MeetingStatus, string>> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Held',
  cancelled: 'Cancelled',
};

/** Legal status changes. Held and cancelled meetings are closed records. */
export const MEETING_TRANSITIONS: Readonly<Record<MeetingStatus, readonly MeetingStatus[]>> = {
  scheduled: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
};

/** Scheduled or in progress: the meeting still claims its people and its room. */
export function isOpenMeeting(status: MeetingStatus): boolean {
  return status === 'scheduled' || status === 'in_progress';
}

export interface Meeting {
  readonly id: MeetingId;
  readonly title: string;
  /** What the meeting is for. Optional. */
  readonly agenda: string;
  /** The room it takes place in (the meeting room in Phase 1). */
  readonly roomId: RoomId;
  /** Who is invited. At least one employee; the founder is always implied. */
  readonly participantIds: readonly EmployeeId[];
  /**
   * Local wall-clock start, `YYYY-MM-DDTHH:mm` (the office's own time; no time
   * zone). Null only for meetings created before times existed (schema v2).
   */
  readonly startsAt: string | null;
  /** Length in minutes (15–480, in 5-minute steps). Null alongside a null start. */
  readonly durationMinutes: number | null;
  /** The project it is about, if any. */
  readonly projectId: ProjectId | null;
  readonly status: MeetingStatus;
  /** Outcome written by the founder when the meeting is marked as held. */
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
