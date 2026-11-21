import { describe, expect, it } from 'vitest';
import { createSeedWorkspace, OFFICE_LAYOUT } from '@/domain/seed';
import { USER_ACTOR } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, unwrap } from '@/test/harness';
import { buildInteractables } from '@/game/world/interaction';
import { createEventBus } from './eventBus';
import { targetKey, type GameEvents } from './gameEvents';
import { buildOfficeViewModel, meetingSeats, sameOfficeViewModel } from './officeViewModel';

describe('office view model', () => {
  it('places every employee at their desk seat with their department colour and derived status', () => {
    const view = buildOfficeViewModel(createSeedWorkspace(), OFFICE_LAYOUT, EMP.sarah);
    expect(view.selectedEmployeeId).toBe(EMP.sarah);
    expect(view.employees).toHaveLength(5);
    expect(view.employees.find((employee) => employee.id === EMP.sarah)).toMatchObject({
      name: 'Sarah Chen',
      color: '#e879f9',
      status: 'idle',
      seat: { col: 9, row: 3 },
      facing: 'north',
    });
  });

  it('reflects work status changes, and compares cheaply', () => {
    const h = createHarness();
    const before = buildOfficeViewModel(h.state(), OFFICE_LAYOUT, null);
    const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Web' }));
    // A change the office does not show keeps the view model equal.
    expect(sameOfficeViewModel(before, buildOfficeViewModel(h.state(), OFFICE_LAYOUT, null))).toBe(
      true,
    );

    const task = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design',
        assigneeId: EMP.sarah,
      }),
    );
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }));
    const after = buildOfficeViewModel(h.state(), OFFICE_LAYOUT, null);
    expect(after.employees.find((employee) => employee.id === EMP.sarah)?.status).toBe('working');
    expect(sameOfficeViewModel(before, after)).toBe(false);
    expect(
      sameOfficeViewModel(after, buildOfficeViewModel(h.state(), OFFICE_LAYOUT, EMP.ryan)),
    ).toBe(false);
  });
});

describe('renaming reaches the office (Phase 1.6)', () => {
  it('sends the new name to the scene, keeping the same ID, seat and appearance key', () => {
    const h = createHarness();
    const before = buildOfficeViewModel(h.state(), OFFICE_LAYOUT, EMP.sarah);
    unwrap(h.commands.renameEmployee(USER_ACTOR, { employeeId: EMP.sarah, name: 'Sarah Lee' }));
    const after = buildOfficeViewModel(h.state(), OFFICE_LAYOUT, EMP.sarah);

    // A rename is a visible change, so the scene receives a new view model.
    expect(sameOfficeViewModel(before, after)).toBe(false);
    const was = before.employees.find((employee) => employee.id === EMP.sarah);
    const now = after.employees.find((employee) => employee.id === EMP.sarah);
    expect(now).toEqual({ ...was, name: 'Sarah Lee' });
    expect(now?.avatarId).toBe('avatar_sarah_chen');
  });

  it('labels the interaction prompt with the new name', () => {
    const h = createHarness();
    unwrap(h.commands.renameEmployee(USER_ACTOR, { employeeId: EMP.sarah, name: 'Sarah Lee' }));
    const view = buildOfficeViewModel(h.state(), OFFICE_LAYOUT, null);
    const prompt = buildInteractables(OFFICE_LAYOUT, view).find(
      (item) => item.target.kind === 'employee' && item.target.employeeId === EMP.sarah,
    );
    expect(prompt?.label).toBe('Sarah Lee');
  });
});

describe('presence in the office (Phase 1.7)', () => {
  it('seats people in the meeting room only while their meeting is running', () => {
    const h = createHarness();
    const meeting = unwrap(
      h.commands.scheduleMeeting(USER_ACTOR, {
        title: 'Kick-off',
        participantIds: [EMP.sarah, EMP.ryan],
        roomId: 'room_meeting',
        startsAt: '2026-12-01T10:00',
        durationMinutes: 30,
      }),
    );
    const sarah = () =>
      buildOfficeViewModel(h.state(), OFFICE_LAYOUT, null).employees.find(
        (employee) => employee.id === EMP.sarah,
      );
    // Scheduled is not "in the meeting": nothing moves on a timer.
    expect(sarah()).toMatchObject({ presence: 'at_desk', seat: { col: 9, row: 3 } });

    unwrap(h.commands.startMeeting(USER_ACTOR, { meetingId: meeting.id }));
    const chairs = OFFICE_LAYOUT.furniture
      .filter((item) => item.roomId === 'room_meeting' && item.kind === 'chair')
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(sarah()).toMatchObject({
      presence: 'in_meeting',
      seat: chairs[0]?.tile,
      facing: chairs[0]?.facing,
    });
    const ryan = buildOfficeViewModel(h.state(), OFFICE_LAYOUT, null).employees.find(
      (employee) => employee.id === EMP.ryan,
    );
    expect(ryan?.seat).toEqual(chairs[1]?.tile);

    unwrap(h.commands.completeMeeting(USER_ACTOR, { meetingId: meeting.id }));
    expect(sarah()).toMatchObject({ presence: 'at_desk', seat: { col: 9, row: 3 } });
  });

  it('keeps people beyond the chairs at their desks, still marked as in the meeting', () => {
    const h = createHarness();
    const everyone = [EMP.alex, EMP.sarah, EMP.ryan, EMP.daniel, EMP.emma];
    const meeting = unwrap(
      h.commands.scheduleMeeting(USER_ACTOR, {
        title: 'All hands',
        participantIds: everyone,
        roomId: 'room_meeting',
        startsAt: '2026-12-01T10:00',
        durationMinutes: 30,
      }),
    );
    unwrap(h.commands.startMeeting(USER_ACTOR, { meetingId: meeting.id }));
    const seats = meetingSeats(Object.values(h.state().meetings), OFFICE_LAYOUT);
    expect(seats.size).toBe(5);
    const view = buildOfficeViewModel(h.state(), OFFICE_LAYOUT, null);
    expect(view.employees.every((employee) => employee.presence === 'in_meeting')).toBe(true);
  });
});

describe('game event contract', () => {
  it('carries typed interaction events from the game to listeners', () => {
    const bus = createEventBus<GameEvents>();
    const received: string[] = [];
    bus.on('interaction.activate', ({ target, label, source }) => {
      received.push(`${targetKey(target)} ${label} ${source}`);
    });
    bus.on('player.moved', ({ tile, roomId }) => {
      received.push(`${tile.col},${tile.row} ${roomId ?? 'outside'}`);
    });
    bus.emit('player.moved', { tile: { col: 9, row: 4 }, roomId: 'room_design' });
    bus.emit('interaction.activate', {
      target: { kind: 'employee', employeeId: EMP.sarah },
      label: 'Sarah Chen',
      source: 'keyboard',
    });
    expect(received).toEqual(['9,4 room_design', 'employee:emp_sarah_chen Sarah Chen keyboard']);
  });

  it('gives every kind of target a stable, distinct key', () => {
    expect([
      targetKey({ kind: 'employee', employeeId: EMP.sarah }),
      targetKey({ kind: 'desk', deskId: 'desk_design_1', employeeId: null }),
      targetKey({ kind: 'room_entrance', roomId: 'room_meeting', doorId: 'door_meeting' }),
      targetKey({
        kind: 'object',
        objectId: 'mgmt_board',
        objectKind: 'project_board',
        roomId: 'room_management',
      }),
    ]).toEqual([
      'employee:emp_sarah_chen',
      'desk:desk_design_1',
      'door:door_meeting',
      'object:mgmt_board',
    ]);
  });
});
