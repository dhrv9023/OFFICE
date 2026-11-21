// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildOfficeViewModel } from '@/bridge/officeViewModel';
import type { EmployeeId } from '@/domain/ids';
import { commands } from '@/commands';
import { OFFICE_LAYOUT } from '@/domain/seed';
import { USER_ACTOR } from '@/domain/types';
import { getWorkspace } from '@/stores/workspace';
import { EMP } from '@/test/factories';
import { unwrap } from '@/test/harness';
import { freshWorkspace, renderApp } from '@/test/render';
import { filterMeetings, readMeetingFilters } from './meetingFilters';

beforeEach(async () => {
  await freshWorkspace();
});

const schedule = (
  title: string,
  startsAt: string,
  participantIds: readonly EmployeeId[] = [EMP.sarah],
) =>
  unwrap(
    commands.scheduleMeeting(USER_ACTOR, {
      title,
      participantIds,
      roomId: 'room_meeting',
      startsAt,
      durationMinutes: 30,
    }),
  );

describe('meetings page (Phase 1.8)', () => {
  it('lists upcoming, held and cancelled meetings in their own tabs', () => {
    schedule('Kick-off', '2099-03-02T10:00');
    const held = schedule('Retro', '2099-03-01T10:00', [EMP.ryan]);
    unwrap(commands.completeMeeting(USER_ACTOR, { meetingId: held.id, notes: 'Ship Friday.' }));
    const cancelled = schedule('Offsite', '2099-03-03T10:00', [EMP.emma]);
    unwrap(commands.cancelMeeting(USER_ACTOR, { meetingId: cancelled.id }));

    renderApp('/meetings');
    expect(screen.getByRole('tab', { name: 'Upcoming · 1' })).toBeInTheDocument();
    expect(screen.getByText('Kick-off')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Held · 1' }));
    expect(screen.getByText('Retro')).toBeInTheDocument();
    expect(screen.getByText('Ship Friday.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Cancelled · 1' }));
    expect(screen.getByText('Offsite')).toBeInTheDocument();
  });

  it('edits, starts and holds a meeting with the same commands the office uses', () => {
    const meeting = schedule('Kick-off', '2099-03-02T10:00');
    renderApp('/meetings');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('dialog', { name: 'Edit meeting' });
    fireEvent.change(within(form).getByLabelText('Title'), {
      target: { value: 'Relaunch kick-off' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(getWorkspace().meetings[meeting.id]?.title).toBe('Relaunch kick-off');

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    // The office sees the same state: Sarah is now in the meeting room.
    const sarah = buildOfficeViewModel(getWorkspace(), OFFICE_LAYOUT, null).employees.find(
      (employee) => employee.id === EMP.sarah,
    );
    expect(sarah?.presence).toBe('in_meeting');

    fireEvent.click(screen.getByRole('button', { name: 'Mark as held' }));
    const held = screen.getByRole('dialog', { name: 'Mark as held' });
    fireEvent.change(within(held).getByLabelText('Notes'), { target: { value: 'Go.' } });
    fireEvent.click(within(held).getByRole('button', { name: 'Mark as held' }));
    expect(getWorkspace().meetings[meeting.id]).toMatchObject({
      status: 'completed',
      notes: 'Go.',
    });
  });

  it('shows details with the meeting’s own history', () => {
    const meeting = schedule('Kick-off', '2099-03-02T10:00');
    unwrap(
      commands.updateMeeting(USER_ACTOR, { meetingId: meeting.id, patch: { durationMinutes: 45 } }),
    );
    renderApp('/meetings');
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const dialog = screen.getByRole('dialog', { name: 'Kick-off' });
    expect(
      within(dialog).getByText('Meeting "Kick-off" was updated (duration).'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/was scheduled in Meeting Room/)).toBeInTheDocument();
  });

  it('cancels after confirmation', () => {
    const meeting = schedule('Kick-off', '2099-03-02T10:00');
    renderApp('/meetings');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel meeting' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel meeting' }),
    );
    expect(getWorkspace().meetings[meeting.id]?.status).toBe('cancelled');
  });
});

describe('meeting filters', () => {
  it('search text, people and project, and filter by date range', () => {
    schedule('Design review', '2099-03-02T10:00', [EMP.sarah]);
    schedule('Build sync', '2099-03-05T10:00', [EMP.ryan]);
    const state = getWorkspace();
    const all = Object.values(state.meetings);
    const pick = (params: string) =>
      filterMeetings(all, readMeetingFilters(new URLSearchParams(params)), state).map(
        (m) => m.title,
      );
    expect(pick('')).toEqual(['Design review', 'Build sync']);
    expect(pick('q=ryan')).toEqual(['Build sync']);
    expect(pick('from=2099-03-03')).toEqual(['Build sync']);
    expect(pick('to=2099-03-02')).toEqual(['Design review']);
    expect(pick('from=2099-03-06')).toEqual([]);
    expect(readMeetingFilters(new URLSearchParams('tab=nope&from=yesterday'))).toMatchObject({
      tab: 'upcoming',
      from: '',
    });
  });
});
