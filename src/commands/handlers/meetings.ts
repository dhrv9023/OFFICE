import { conflict, notFound, validationError } from '@/domain/errors';
import type { EmployeeId, MeetingId, ProjectId, RoomId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import {
  checkMeetingParticipants,
  checkMeetingTransition,
  clashError,
  findMeetingClash,
  validateMeetingDuration,
  validateMeetingStart,
} from '@/domain/rules/meetings';
import { validateLongText, validateMeetingTitle } from '@/domain/rules/validation';
import { OFFICE_LAYOUT } from '@/domain/seed/officeLayout';
import type { ActivityEventType, Meeting, MeetingStatus, WorkspaceState } from '@/domain/types';
import { activityEvent, checkActor, commit } from '../support';
import type { CommandContext, CommandHandler } from '../types';

export interface ScheduleMeetingInput {
  readonly title: string;
  readonly agenda?: string | undefined;
  readonly participantIds: readonly EmployeeId[];
  /** Where it takes place. Must be a meeting room. */
  readonly roomId: RoomId;
  /** Local wall-clock start, `YYYY-MM-DDTHH:mm`. */
  readonly startsAt: string;
  /** Length in minutes (15–480, 5-minute steps). */
  readonly durationMinutes: number;
  /** The project it is about, if any. */
  readonly projectId?: ProjectId | null | undefined;
}

export interface MeetingRefInput {
  readonly meetingId: MeetingId;
}

export interface CompleteMeetingInput extends MeetingRefInput {
  /** What was discussed or decided, written by the founder. Optional. */
  readonly notes?: string | undefined;
}

export interface UpdateMeetingInput extends MeetingRefInput {
  /** Only the fields present change. A meeting can be edited while scheduled. */
  readonly patch: {
    readonly title?: string | undefined;
    readonly agenda?: string | undefined;
    readonly participantIds?: readonly EmployeeId[] | undefined;
    readonly startsAt?: string | undefined;
    readonly durationMinutes?: number | undefined;
    readonly projectId?: ProjectId | null | undefined;
  };
}

export type StartMeetingInput = MeetingRefInput;
export type CancelMeetingInput = MeetingRefInput;

function names(state: WorkspaceState, ids: readonly EmployeeId[]): string {
  const list = ids.map((id) => state.employees[id]?.name ?? 'a former employee');
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1] ?? ''}`;
}

/**
 * Schedules a meeting in a meeting room. Rejects a time at which the room is
 * booked or any invitee is already in another scheduled or running meeting.
 */
export const scheduleMeeting: CommandHandler<ScheduleMeetingInput, Meeting> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const room = OFFICE_LAYOUT.rooms.find((candidate) => candidate.id === input.roomId);
  if (!room) return err(notFound('room', input.roomId));
  if (room.kind !== 'meeting') {
    return err(validationError('roomId', `${room.name} is not a meeting room.`));
  }

  const title = validateMeetingTitle(input.title);
  if (!title.ok) return title;
  const agenda = validateLongText('agenda', 'Agenda', input.agenda ?? '');
  if (!agenda.ok) return agenda;
  const startsAt = validateMeetingStart(input.startsAt);
  if (!startsAt.ok) return startsAt;
  const duration = validateMeetingDuration(input.durationMinutes);
  if (!duration.ok) return duration;
  const participants = checkMeetingParticipants(input.participantIds, state.employees);
  if (!participants.ok) return participants;

  const projectId = input.projectId ?? null;
  if (projectId !== null) {
    const project = state.projects[projectId];
    if (!project) return err(notFound('project', projectId));
    if (project.status === 'archived') {
      return err(validationError('projectId', `"${project.name}" is archived.`));
    }
  }

  const draft = {
    roomId: room.id,
    participantIds: participants.value,
    startsAt: startsAt.value,
    durationMinutes: duration.value,
  };
  const clash = findMeetingClash(draft, Object.values(state.meetings));
  if (clash) return err(clashError(clash, state.employees));

  const now = context.clock.now();
  const meeting: Meeting = {
    id: context.ids.next('meeting'),
    title: title.value,
    agenda: agenda.value,
    ...draft,
    projectId,
    status: 'scheduled',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
  return ok({
    value: meeting,
    state: commit(
      state,
      { meetings: { ...state.meetings, [meeting.id]: meeting } },
      [
        activityEvent(context, now, {
          eventType: 'meeting.scheduled',
          description: `Meeting "${meeting.title}" was scheduled in ${room.name} with ${names(state, meeting.participantIds)}.`,
          projectId,
          meetingId: meeting.id,
        }),
      ],
      [],
    ),
  });
};

/**
 * Edits a scheduled meeting. The same rules as scheduling apply (times,
 * participants, project, clashes with other meetings); running, held and
 * cancelled meetings are not edited.
 */
export const updateMeeting: CommandHandler<UpdateMeetingInput, Meeting> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;
  const current = state.meetings[input.meetingId];
  if (!current) return err(notFound('meeting', input.meetingId));
  if (current.status !== 'scheduled') {
    return err(
      conflict(
        'meeting_closed',
        `"${current.title}" is ${current.status === 'in_progress' ? 'in progress' : current.status === 'completed' ? 'already held' : 'cancelled'} and can no longer be edited.`,
      ),
    );
  }
  const patch = input.patch;
  const title = patch.title === undefined ? ok(current.title) : validateMeetingTitle(patch.title);
  if (!title.ok) return title;
  const agenda =
    patch.agenda === undefined
      ? ok(current.agenda)
      : validateLongText('agenda', 'Agenda', patch.agenda);
  if (!agenda.ok) return agenda;
  const startsAt =
    patch.startsAt === undefined
      ? ok(current.startsAt ?? '')
      : validateMeetingStart(patch.startsAt);
  if (!startsAt.ok) return startsAt;
  const duration =
    patch.durationMinutes === undefined
      ? ok(current.durationMinutes ?? 0)
      : validateMeetingDuration(patch.durationMinutes);
  if (!duration.ok) return duration;
  // A meeting from before times existed must be given both to be edited.
  const timed = validateMeetingStart(startsAt.value);
  if (!timed.ok) return timed;
  const lasting = validateMeetingDuration(duration.value);
  if (!lasting.ok) return lasting;
  const participants =
    patch.participantIds === undefined
      ? ok(current.participantIds)
      : checkMeetingParticipants(patch.participantIds, state.employees);
  if (!participants.ok) return participants;
  const projectId = patch.projectId === undefined ? current.projectId : patch.projectId;
  if (projectId !== null && projectId !== current.projectId) {
    const project = state.projects[projectId];
    if (!project) return err(notFound('project', projectId));
    if (project.status === 'archived') {
      return err(validationError('projectId', `"${project.name}" is archived.`));
    }
  }

  const next: Meeting = {
    ...current,
    title: title.value,
    agenda: agenda.value,
    participantIds: participants.value,
    startsAt: timed.value,
    durationMinutes: lasting.value,
    projectId,
  };
  const changed: string[] = (
    ['title', 'agenda', 'startsAt', 'durationMinutes', 'projectId'] as const
  ).filter((key) => next[key] !== current[key]);
  if (next.participantIds.join() !== current.participantIds.join()) changed.push('participantIds');
  if (changed.length === 0) {
    return err(conflict('no_change', 'Nothing to update: the meeting already has these details.'));
  }
  const clash = findMeetingClash(next, Object.values(state.meetings));
  if (clash) return err(clashError(clash, state.employees));

  const now = context.clock.now();
  const meeting: Meeting = { ...next, updatedAt: now };
  const labels: Record<string, string> = {
    title: 'title',
    agenda: 'agenda',
    startsAt: 'time',
    durationMinutes: 'duration',
    projectId: 'project',
    participantIds: 'participants',
  };
  return ok({
    value: meeting,
    state: commit(
      state,
      { meetings: { ...state.meetings, [meeting.id]: meeting } },
      [
        activityEvent(context, now, {
          eventType: 'meeting.updated',
          description: `Meeting "${meeting.title}" was updated (${changed.map((key) => labels[key]).join(', ')}).`,
          projectId: meeting.projectId,
          meetingId: meeting.id,
        }),
      ],
      [],
    ),
  });
};

function change(
  state: WorkspaceState,
  context: CommandContext,
  meetingId: MeetingId,
  to: MeetingStatus,
  eventType: ActivityEventType,
  describe: (meeting: Meeting) => string,
  extra: Partial<Meeting> = {},
) {
  const meeting = state.meetings[meetingId];
  if (!meeting) return err(notFound('meeting', meetingId));
  const allowed = checkMeetingTransition(meeting, to);
  if (!allowed.ok) return allowed;

  const now = context.clock.now();
  const next: Meeting = { ...meeting, ...extra, status: to, updatedAt: now };
  return ok({
    value: next,
    state: commit(
      state,
      { meetings: { ...state.meetings, [meeting.id]: next } },
      [
        activityEvent(context, now, {
          eventType,
          description: describe(meeting),
          projectId: meeting.projectId,
          meetingId: meeting.id,
        }),
      ],
      [],
    ),
  });
}

/**
 * The founder starts a scheduled meeting. Its participants are then "in the
 * meeting" (their presence) until it is marked as held. Nobody can be in two
 * running meetings at once.
 */
export const startMeeting: CommandHandler<StartMeetingInput, Meeting> = (state, input, context) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;
  const meeting = state.meetings[input.meetingId];
  if (meeting) {
    const busy = Object.values(state.meetings).find(
      (other) =>
        other.id !== meeting.id &&
        other.status === 'in_progress' &&
        other.participantIds.some((id) => meeting.participantIds.includes(id)),
    );
    if (busy) {
      const who = meeting.participantIds.filter((id) => busy.participantIds.includes(id));
      return err(
        validationError(
          'participantIds',
          `${names(state, who)} ${who.length === 1 ? 'is' : 'are'} still in "${busy.title}". Mark it as held first.`,
        ),
      );
    }
  }
  return change(
    state,
    context,
    input.meetingId,
    'in_progress',
    'meeting.started',
    (m) => `Meeting "${m.title}" started with ${names(state, m.participantIds)}.`,
  );
};

/** Records that a meeting took place (from scheduled or in progress), with the founder's notes. */
export const completeMeeting: CommandHandler<CompleteMeetingInput, Meeting> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;
  const notes = validateLongText('notes', 'Notes', input.notes ?? '');
  if (!notes.ok) return notes;
  return change(
    state,
    context,
    input.meetingId,
    'completed',
    'meeting.completed',
    (m) =>
      `Meeting "${m.title}" was held with ${names(state, m.participantIds)}.${notes.value ? ' Notes were recorded.' : ''}`,
    { notes: notes.value },
  );
};

/** Cancels a scheduled meeting. The record is kept; its people and time are released. */
export const cancelMeeting: CommandHandler<CancelMeetingInput, Meeting> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;
  return change(
    state,
    context,
    input.meetingId,
    'cancelled',
    'meeting.cancelled',
    (m) => `Meeting "${m.title}" was cancelled.`,
  );
};
