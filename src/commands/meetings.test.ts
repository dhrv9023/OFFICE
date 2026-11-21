import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EmployeeId, ProjectId } from '@/domain/ids';
import { deriveEmployeePresence, localTimeToMinutes } from '@/domain/rules/meetings';
import { USER_ACTOR } from '@/domain/types';
import { EMP } from '@/test/factories';
import { createHarness, expectError, unwrap, type Harness } from '@/test/harness';

let h: Harness;

beforeEach(() => {
  h = createHarness();
});
afterEach(() => {
  h.expectConsistent();
});

interface Extra {
  title?: string;
  agenda?: string;
  roomId?: `room_${string}`;
  startsAt?: string;
  durationMinutes?: number;
  projectId?: ProjectId | null;
}

const schedule = (
  participantIds: readonly EmployeeId[] = [EMP.sarah, EMP.ryan],
  extra: Extra = {},
) =>
  h.commands.scheduleMeeting(USER_ACTOR, {
    title: extra.title ?? ' Homepage review ',
    agenda: extra.agenda ?? 'Walk through the new design.',
    participantIds,
    roomId: extra.roomId ?? 'room_meeting',
    startsAt: extra.startsAt ?? '2026-12-01T10:00',
    durationMinutes: extra.durationMinutes ?? 60,
    projectId: extra.projectId,
  });

const meetings = () => Object.values(h.state().meetings);

describe('scheduleMeeting', () => {
  it('creates a scheduled meeting with its time and logs it with a meeting reference', () => {
    const meeting = unwrap(schedule());
    expect(meeting).toEqual({
      id: 'mtg_0001',
      title: 'Homepage review',
      agenda: 'Walk through the new design.',
      roomId: 'room_meeting',
      participantIds: [EMP.sarah, EMP.ryan],
      startsAt: '2026-12-01T10:00',
      durationMinutes: 60,
      projectId: null,
      status: 'scheduled',
      notes: '',
      createdAt: meeting.createdAt,
      updatedAt: meeting.createdAt,
    });
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'meeting.scheduled',
      meetingId: meeting.id,
      description:
        'Meeting "Homepage review" was scheduled in Meeting Room with Sarah Chen and Ryan Miller.',
    });
  });

  it('links an optional project, but not an archived or unknown one', () => {
    const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    const meeting = unwrap(schedule(undefined, { projectId: project.id }));
    expect(meeting.projectId).toBe(project.id);
    expect(h.state().activity.at(-1)?.projectId).toBe(project.id);

    expectError(schedule([EMP.emma], { projectId: 'prj_ghost' }), 'not_found');
    unwrap(
      h.commands.updateProject(USER_ACTOR, {
        projectId: project.id,
        patch: { status: 'archived' },
      }),
    );
    expect(
      expectError(
        schedule([EMP.emma], { projectId: project.id, startsAt: '2026-12-02T10:00' }),
        'validation',
      ).field,
    ).toBe('projectId');
  });

  it.each(['2026-02-30T10:00', '2026-12-01T24:00', '2026-12-01 10:00', '', '10:00'])(
    'rejects the impossible start time "%s"',
    (startsAt) => {
      expect(expectError(schedule(undefined, { startsAt }), 'validation').field).toBe('startsAt');
    },
  );

  it.each([0, 10, 17, 485, 60.5])('rejects a duration of %s minutes', (durationMinutes) => {
    expect(expectError(schedule(undefined, { durationMinutes }), 'validation').field).toBe(
      'durationMinutes',
    );
  });

  it('requires participants, a title and a meeting room', () => {
    expect(expectError(schedule([]), 'validation').message).toBe('Invite at least one employee.');
    expectError(schedule([EMP.sarah, EMP.sarah]), 'validation');
    expectError(schedule([EMP.sarah, 'emp_ghost']), 'invalid_reference');
    expect(expectError(schedule(undefined, { title: '  ' }), 'validation').field).toBe('title');
    expectError(schedule(undefined, { roomId: 'room_design' }), 'validation');
    expectError(schedule(undefined, { roomId: 'room_nowhere' }), 'not_found');
  });
});

describe('availability', () => {
  it('rejects a shared participant at an overlapping time, naming them and the meeting', () => {
    unwrap(schedule([EMP.sarah, EMP.ryan], { title: 'Design review' }));
    const before = h.state();
    const error = expectError(
      schedule([EMP.ryan, EMP.emma], { title: 'QA sync', startsAt: '2026-12-01T10:30' }),
      'validation',
    );
    // The room is also booked; the people clash is the one explained.
    expect(error.message).toBe(
      'Ryan Miller is already in "Design review" at that time. Choose another time or other people.',
    );
    expect(h.state()).toBe(before);
  });

  it('rejects a double-booked room even with different people', () => {
    unwrap(schedule([EMP.sarah]));
    const error = expectError(
      schedule([EMP.emma], { startsAt: '2026-12-01T10:45', durationMinutes: 15 }),
      'validation',
    );
    expect(error.message).toContain('The room is already booked for "Homepage review"');
  });

  it('allows back-to-back meetings', () => {
    unwrap(schedule([EMP.sarah]));
    unwrap(schedule([EMP.sarah], { title: 'Next', startsAt: '2026-12-01T11:00' }));
    expect(meetings()).toHaveLength(2);
  });

  it('releases people and the room when a meeting is cancelled', () => {
    const first = unwrap(schedule([EMP.sarah]));
    unwrap(h.commands.cancelMeeting(USER_ACTOR, { meetingId: first.id }));
    unwrap(schedule([EMP.sarah], { title: 'Rebooked' }));
  });

  it('keeps a held meeting in history without blocking its old time slot', () => {
    const first = unwrap(schedule([EMP.sarah]));
    unwrap(h.commands.completeMeeting(USER_ACTOR, { meetingId: first.id, notes: 'Done.' }));
    unwrap(schedule([EMP.sarah], { title: 'Follow-up' }));
    expect(h.state().meetings[first.id]).toMatchObject({ status: 'completed', notes: 'Done.' });
  });

  it('compares local times across days', () => {
    const late = localTimeToMinutes('2026-12-01T23:30');
    const midnight = localTimeToMinutes('2026-12-02T00:00');
    expect(late).not.toBeNull();
    expect((midnight ?? 0) - (late ?? 0)).toBe(30);
  });
});

describe('lifecycle', () => {
  it('starts, then records the outcome written by the founder', () => {
    const meeting = unwrap(schedule());
    const started = unwrap(h.commands.startMeeting(USER_ACTOR, { meetingId: meeting.id }));
    expect(started.status).toBe('in_progress');
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'meeting.started',
      meetingId: meeting.id,
    });

    const held = unwrap(
      h.commands.completeMeeting(USER_ACTOR, {
        meetingId: meeting.id,
        notes: '  Ship the hero section first. ',
      }),
    );
    expect(held).toMatchObject({ status: 'completed', notes: 'Ship the hero section first.' });
    expect(h.state().activity.at(-1)?.description).toBe(
      'Meeting "Homepage review" was held with Sarah Chen and Ryan Miller. Notes were recorded.',
    );
  });

  it('can be recorded as held without being started (afterwards)', () => {
    const meeting = unwrap(schedule());
    expect(unwrap(h.commands.completeMeeting(USER_ACTOR, { meetingId: meeting.id })).status).toBe(
      'completed',
    );
  });

  it('does not cancel a meeting that is in progress', () => {
    const meeting = unwrap(schedule());
    unwrap(h.commands.startMeeting(USER_ACTOR, { meetingId: meeting.id }));
    expect(
      expectError(h.commands.cancelMeeting(USER_ACTOR, { meetingId: meeting.id }), 'conflict')
        .message,
    ).toBe('A meeting that is in progress cannot be cancelled.');
  });

  it('treats held and cancelled meetings as closed', () => {
    const meeting = unwrap(schedule());
    unwrap(h.commands.cancelMeeting(USER_ACTOR, { meetingId: meeting.id }));
    for (const result of [
      h.commands.startMeeting(USER_ACTOR, { meetingId: meeting.id }),
      h.commands.completeMeeting(USER_ACTOR, { meetingId: meeting.id }),
      h.commands.cancelMeeting(USER_ACTOR, { meetingId: meeting.id }),
    ]) {
      expect(expectError(result, 'conflict').reason).toBe('meeting_closed');
    }
  });

  it('never lets one person be in two running meetings', () => {
    const first = unwrap(schedule([EMP.sarah]));
    const second = unwrap(
      schedule([EMP.sarah, EMP.emma], { title: 'Later', startsAt: '2026-12-01T15:00' }),
    );
    unwrap(h.commands.startMeeting(USER_ACTOR, { meetingId: first.id }));
    expect(
      expectError(h.commands.startMeeting(USER_ACTOR, { meetingId: second.id }), 'validation')
        .message,
    ).toBe('Sarah Chen is still in "Homepage review". Mark it as held first.');
  });

  it('rejects an unknown meeting', () => {
    expectError(h.commands.cancelMeeting(USER_ACTOR, { meetingId: 'mtg_ghost' }), 'not_found');
    expectError(h.commands.startMeeting(USER_ACTOR, { meetingId: 'mtg_ghost' }), 'not_found');
  });
});

describe('presence', () => {
  it('puts participants in the meeting only while it is running', () => {
    const meeting = unwrap(schedule([EMP.sarah]));
    const presence = () => deriveEmployeePresence(EMP.sarah, meetings());
    expect(presence()).toEqual({ kind: 'at_desk' });

    unwrap(h.commands.startMeeting(USER_ACTOR, { meetingId: meeting.id }));
    expect(presence()).toEqual({
      kind: 'in_meeting',
      meetingId: meeting.id,
      roomId: 'room_meeting',
    });
    expect(deriveEmployeePresence(EMP.emma, meetings())).toEqual({ kind: 'at_desk' });

    unwrap(h.commands.completeMeeting(USER_ACTOR, { meetingId: meeting.id }));
    expect(presence()).toEqual({ kind: 'at_desk' });
  });
});

describe('updateMeeting (Phase 1.8)', () => {
  it('edits a scheduled meeting under the same rules as scheduling', () => {
    const meeting = unwrap(schedule([EMP.sarah]));
    const edited = unwrap(
      h.commands.updateMeeting(USER_ACTOR, {
        meetingId: meeting.id,
        patch: {
          title: 'Design review',
          startsAt: '2026-12-01T14:00',
          participantIds: [EMP.sarah, EMP.emma],
        },
      }),
    );
    expect(edited).toMatchObject({
      title: 'Design review',
      startsAt: '2026-12-01T14:00',
      participantIds: [EMP.sarah, EMP.emma],
    });
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'meeting.updated',
      meetingId: meeting.id,
      description: 'Meeting "Design review" was updated (title, time, participants).',
    });
  });

  it('refuses a clash with another meeting, excluding itself', () => {
    unwrap(schedule([EMP.ryan], { title: 'Build sync', startsAt: '2026-12-01T15:00' }));
    const meeting = unwrap(schedule([EMP.sarah]));
    // Moving within its own slot is not a clash with itself.
    unwrap(
      h.commands.updateMeeting(USER_ACTOR, {
        meetingId: meeting.id,
        patch: { durationMinutes: 45 },
      }),
    );
    expect(
      expectError(
        h.commands.updateMeeting(USER_ACTOR, {
          meetingId: meeting.id,
          patch: { startsAt: '2026-12-01T15:15', participantIds: [EMP.sarah, EMP.ryan] },
        }),
        'validation',
      ).message,
    ).toContain('Ryan Miller is already in "Build sync"');
  });

  it('does not edit a meeting that is running, held or cancelled', () => {
    const meeting = unwrap(schedule([EMP.sarah]));
    unwrap(h.commands.startMeeting(USER_ACTOR, { meetingId: meeting.id }));
    expect(
      expectError(
        h.commands.updateMeeting(USER_ACTOR, { meetingId: meeting.id, patch: { title: 'X' } }),
        'conflict',
      ).reason,
    ).toBe('meeting_closed');
  });

  it('rejects an edit that changes nothing', () => {
    const meeting = unwrap(schedule([EMP.sarah]));
    expect(
      expectError(
        h.commands.updateMeeting(USER_ACTOR, {
          meetingId: meeting.id,
          patch: { title: 'Homepage review' },
        }),
        'conflict',
      ).reason,
    ).toBe('no_change');
  });
});
