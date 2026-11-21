import { invalidReference, validationError, type DomainError, type DomainResult } from '../errors';
import type { EmployeeId, MeetingId, RoomId } from '../ids';
import { err, ok } from '../result';
import type { Employee } from '../types/employee';
import {
  isOpenMeeting,
  MEETING_STATUS_LABELS,
  MEETING_TRANSITIONS,
  type Meeting,
  type MeetingStatus,
} from '../types/meeting';
import { LIMITS } from './validation';

/**
 * Who can be invited: at least one existing employee, each listed once, and no
 * more than the room could ever seat. Returns the list in the order given.
 */
export function checkMeetingParticipants(
  participantIds: readonly EmployeeId[],
  employees: Readonly<Record<EmployeeId, Employee>>,
): DomainResult<readonly EmployeeId[]> {
  if (participantIds.length === 0) {
    return err(validationError('participantIds', 'Invite at least one employee.'));
  }
  if (participantIds.length > LIMITS.meetingParticipants) {
    return err(
      validationError(
        'participantIds',
        `A meeting can have at most ${LIMITS.meetingParticipants} participants.`,
      ),
    );
  }
  if (new Set(participantIds).size !== participantIds.length) {
    return err(validationError('participantIds', 'Each participant can only be invited once.'));
  }
  for (const id of participantIds) {
    if (!employees[id]) return err(invalidReference('employee', id, 'meeting.participantIds'));
  }
  return ok(participantIds);
}

/* ───────────────────────── Time ───────────────────────── */

export const MEETING_DURATION = { min: 15, max: 480, step: 5 } as const;

const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Minutes since an arbitrary epoch for a local wall-clock time `YYYY-MM-DDTHH:mm`,
 * or null if it is not a real calendar time. Meeting times have no time zone: they
 * are compared with each other, never with the system clock.
 */
export function localTimeToMinutes(value: string): number | null {
  const match = LOCAL_TIME.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (hour > 23 || minute > 59) return null;
  const ms = Date.UTC(year, month - 1, day, hour, minute);
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return ms / 60_000;
}

export function validateMeetingStart(value: unknown): DomainResult<string> {
  if (typeof value !== 'string' || localTimeToMinutes(value) === null) {
    return err(validationError('startsAt', 'Choose a valid date and start time.'));
  }
  return ok(value);
}

export function validateMeetingDuration(value: unknown): DomainResult<number> {
  const { min, max, step } = MEETING_DURATION;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max ||
    value % step !== 0
  ) {
    return err(
      validationError(
        'durationMinutes',
        `Duration must be between ${String(min)} minutes and ${String(max / 60)} hours, in ${String(step)}-minute steps.`,
      ),
    );
  }
  return ok(value);
}

/** [start, end) in minutes, or null for a meeting without a time (created before v3). */
export function meetingWindow(
  meeting: Pick<Meeting, 'startsAt' | 'durationMinutes'>,
): { start: number; end: number } | null {
  if (meeting.startsAt === null || meeting.durationMinutes === null) return null;
  const start = localTimeToMinutes(meeting.startsAt);
  return start === null ? null : { start, end: start + meeting.durationMinutes };
}

/**
 * The first open meeting that would clash with `candidate`: same room or a shared
 * participant, at an overlapping time. Back-to-back meetings do not clash, and
 * held or cancelled meetings never do (cancelling releases everyone).
 */
export function findMeetingClash(
  candidate: Pick<Meeting, 'startsAt' | 'durationMinutes' | 'roomId' | 'participantIds'> & {
    readonly id?: MeetingId;
  },
  meetings: readonly Meeting[],
): { meeting: Meeting; people: readonly EmployeeId[]; room: boolean } | null {
  const window = meetingWindow(candidate);
  if (!window) return null;
  for (const other of meetings) {
    if (other.id === candidate.id || !isOpenMeeting(other.status)) continue;
    const span = meetingWindow(other);
    if (!span || span.start >= window.end || window.start >= span.end) continue;
    const people = candidate.participantIds.filter((id) => other.participantIds.includes(id));
    const room = other.roomId === candidate.roomId;
    if (people.length > 0 || room) return { meeting: other, people, room };
  }
  return null;
}

/** Explains a clash in one sentence. */
export function clashError(
  clash: NonNullable<ReturnType<typeof findMeetingClash>>,
  employees: Readonly<Record<EmployeeId, Employee>>,
): DomainError {
  const who = clash.people.map((id) => employees[id]?.name ?? 'someone');
  const subject =
    who.length > 0
      ? `${who.join(', ')} ${who.length === 1 ? 'is' : 'are'} already in`
      : 'The room is already booked for';
  return validationError(
    'startsAt',
    `${subject} "${clash.meeting.title}" at that time. Choose another time${who.length > 0 ? ' or other people' : ''}.`,
  );
}

export function checkMeetingTransition(meeting: Meeting, to: MeetingStatus): DomainResult<Meeting> {
  if (MEETING_TRANSITIONS[meeting.status].includes(to)) return ok(meeting);
  return err({
    code: 'conflict',
    reason: 'meeting_closed',
    message:
      meeting.status === 'completed' || meeting.status === 'cancelled'
        ? `"${meeting.title}" has already been ${meeting.status === 'completed' ? 'held' : 'cancelled'}.`
        : `A meeting that is ${MEETING_STATUS_LABELS[meeting.status].toLowerCase()} cannot be ${to === 'cancelled' ? 'cancelled' : `moved to ${MEETING_STATUS_LABELS[to].toLowerCase()}`}.`,
  });
}

/* ───────────────────────── Presence ───────────────────────── */

/**
 * Where an employee is, as far as the application knows. Derived only from
 * meetings the founder has started — never from the clock or from guesses.
 */
export type EmployeePresence =
  | { readonly kind: 'at_desk' }
  | { readonly kind: 'in_meeting'; readonly meetingId: MeetingId; readonly roomId: RoomId };

export function deriveEmployeePresence(
  employeeId: EmployeeId,
  meetings: readonly Meeting[],
): EmployeePresence {
  const meeting = meetings.find(
    (candidate) =>
      candidate.status === 'in_progress' && candidate.participantIds.includes(employeeId),
  );
  return meeting
    ? { kind: 'in_meeting', meetingId: meeting.id, roomId: meeting.roomId }
    : { kind: 'at_desk' };
}
