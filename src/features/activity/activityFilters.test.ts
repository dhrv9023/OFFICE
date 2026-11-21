import { describe, expect, it } from 'vitest';
import { USER_ACTOR } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, unwrap } from '@/test/harness';
import { filterActivity, readActivityFilters } from './activityFilters';

function history() {
  const h = createHarness();
  const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
  unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId: project.id,
      departmentId: DEPT.design,
      title: 'Design',
      assigneeId: EMP.sarah,
    }),
  );
  unwrap(
    h.commands.scheduleMeeting(USER_ACTOR, {
      title: 'Kick-off',
      participantIds: [EMP.sarah, EMP.ryan],
      roomId: 'room_meeting',
      startsAt: '2026-12-01T10:00',
      durationMinutes: 30,
    }),
  );
  unwrap(h.commands.renameEmployee(USER_ACTOR, { employeeId: EMP.ryan, name: 'Ryan Park' }));
  return { state: h.state(), projectId: project.id };
}

const pick = (params: string) => {
  const { state } = history();
  return filterActivity(
    state.activity,
    readActivityFilters(new URLSearchParams(params)),
    state.meetings,
  ).map((event) => event.eventType);
};

describe('activity filters', () => {
  it('shows everything by default', () => {
    expect(pick('')).toEqual([
      'project.created',
      'task.created',
      'task.assigned',
      'meeting.scheduled',
      'employee.renamed',
    ]);
  });

  it('filters by kind', () => {
    expect(pick('kind=task')).toEqual(['task.created', 'task.assigned']);
    expect(pick('kind=meeting')).toEqual(['meeting.scheduled']);
    expect(pick('kind=employee')).toEqual(['employee.renamed']);
  });

  it('finds a person through their own events and the meetings they were invited to', () => {
    expect(pick(`employee=${EMP.sarah}`)).toEqual(['task.assigned', 'meeting.scheduled']);
    // Renamed, but found by ID: history stays attached to the person.
    expect(pick(`employee=${EMP.ryan}`)).toEqual(['meeting.scheduled', 'employee.renamed']);
  });

  it('filters by project and composes', () => {
    const { state, projectId } = history();
    const events = filterActivity(
      state.activity,
      readActivityFilters(new URLSearchParams(`project=${projectId}&kind=task`)),
      state.meetings,
    );
    expect(events.map((event) => event.eventType)).toEqual(['task.created', 'task.assigned']);
  });

  it('ignores an unknown kind', () => {
    expect(readActivityFilters(new URLSearchParams('kind=gossip')).kind).toBe('all');
  });
});
