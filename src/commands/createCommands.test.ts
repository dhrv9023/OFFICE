import { describe, expect, it } from 'vitest';
import { createSequentialIdGenerator } from '@/domain/ids';
import type { EmployeeId } from '@/domain/ids';
import { SYSTEM_ACTOR, USER_ACTOR, type Actor } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, createTestClock, expectError, unwrap } from '@/test/harness';
import { MAX_ACTIVITY_EVENTS, MAX_NOTIFICATIONS } from './support';
import { createCommands } from './createCommands';

const SARAH_AGENT: Actor = { kind: 'agent', employeeId: EMP.sarah };

describe('command execution', () => {
  it('commits exactly once per successful command and never on rejection', () => {
    const h = createHarness();
    unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    expect(h.commits()).toBe(1);

    expectError(h.commands.createProject(USER_ACTOR, { name: '' }), 'validation');
    expect(h.commits()).toBe(1);
  });

  it('applies entity, employee, activity and notification changes in one commit', () => {
    const h = createHarness();
    const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    const task = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design',
        assigneeId: EMP.sarah,
      }),
    );
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }));
    const before = h.state();
    const commitsBefore = h.commits();

    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_review' }));
    const after = h.state();

    expect(h.commits()).toBe(commitsBefore + 1);
    expect(after.tasks).not.toBe(before.tasks);
    expect(after.activity).toHaveLength(before.activity.length + 1);
    expect(after.notifications).toHaveLength(before.notifications.length + 1);
    // Untouched slices are shared, not copied.
    expect(after.projects).toBe(before.projects);
    expect(after.departments).toBe(before.departments);
    expect(after.employees).toBe(before.employees);
  });

  it('never mutates the previous state (state is deep-frozen in the harness)', () => {
    const h = createHarness();
    const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    const snapshot = JSON.stringify(h.state());
    const previous = h.state();

    unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design',
      }),
    );

    expect(JSON.stringify(previous)).toBe(snapshot);
  });

  it('produces identical results for identical inputs (deterministic)', () => {
    const run = () => {
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
      return h.state();
    };
    expect(run()).toEqual(run());
  });
});

/** Enables an AI employee with its default grants (the founder's decision). */
function enable(h: ReturnType<typeof createHarness>, employeeId: EmployeeId) {
  unwrap(h.commands.updateAccessProfile(USER_ACTOR, { employeeId, status: 'active' }));
}

describe('actors', () => {
  it('records which actor made each change; system processes take no business actions', () => {
    const h = createHarness();
    enable(h, EMP.alex);
    const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'By user' }));
    expect(
      expectError(
        h.commands.createProject(SYSTEM_ACTOR, { name: 'By system' }),
        'permission_denied',
      ).message,
    ).toContain('System processes do not perform business actions');
    unwrap(
      h.commands.updateProject(
        { kind: 'agent', employeeId: EMP.alex },
        {
          projectId: project.id,
          patch: { description: 'Edited by the PM' },
        },
      ),
    );

    expect(h.state().activity.map((event) => event.actorId)).toEqual(['user', 'user', EMP.alex]);
  });

  it('lets an enabled agent use the same commands, under the same rules', () => {
    const h = createHarness();
    enable(h, EMP.sarah);
    const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    const task = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design',
        assigneeId: EMP.sarah,
      }),
    );

    // The agent cannot skip review any more than the user can.
    unwrap(h.commands.changeTaskStatus(SARAH_AGENT, { taskId: task.id, status: 'in_progress' }));
    expectError(
      h.commands.changeTaskStatus(SARAH_AGENT, { taskId: task.id, status: 'done' }),
      'invalid_transition',
    );
    expect(h.state().activity.at(-1)).toMatchObject({
      actorId: EMP.sarah,
      eventType: 'task.status_changed',
    });
    h.expectConsistent();
  });

  it('rejects an agent that is not an employee, for every command, before looking at anything', () => {
    const h = createHarness();
    const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    const task = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design',
      }),
    );
    const before = h.state();
    const ghost: Actor = { kind: 'agent', employeeId: 'emp_ghost' };
    const { commands } = h;

    const results = [
      commands.createProject(ghost, { name: 'X' }),
      commands.updateProject(ghost, { projectId: project.id, patch: { name: 'X' } }),
      commands.deleteProject(ghost, { projectId: project.id }),
      commands.createTask(ghost, { projectId: project.id, departmentId: DEPT.design, title: 'X' }),
      commands.updateTask(ghost, { taskId: task.id, patch: { title: 'X' } }),
      commands.assignTask(ghost, { taskId: task.id, assigneeId: EMP.sarah }),
      commands.changeTaskStatus(ghost, { taskId: task.id, status: 'blocked' }),
      commands.deleteTask(ghost, { taskId: task.id }),
      commands.markNotificationRead(ghost, { notificationId: 'ntf_0001' }),
      commands.markAllNotificationsRead(ghost),
      commands.renameEmployee(ghost, { employeeId: EMP.sarah, name: 'X' }),
      commands.scheduleMeeting(ghost, {
        title: 'X',
        participantIds: [EMP.sarah],
        roomId: 'room_meeting',
        startsAt: '2026-12-01T10:00',
        durationMinutes: 60,
      }),
      commands.updateMeeting(ghost, { meetingId: 'mtg_0001', patch: { title: 'X' } }),
      commands.startMeeting(ghost, { meetingId: 'mtg_0001' }),
      commands.completeMeeting(ghost, { meetingId: 'mtg_0001' }),
      commands.cancelMeeting(ghost, { meetingId: 'mtg_0001' }),
      commands.updateAccessProfile(ghost, { employeeId: EMP.sarah, status: 'active' }),
      commands.approveRequest(ghost, { approvalId: 'apr_0001' }),
      commands.rejectRequest(ghost, { approvalId: 'apr_0001' }),
      commands.cancelRequest(ghost, { approvalId: 'apr_0001' }),
      commands.sendMessage(ghost, { to: 'user', body: 'Hello' }),
      commands.updateAgentConfig(ghost, { employeeId: EMP.sarah, patch: { model: 'x' } }),
    ];

    expect(results).toHaveLength(Object.keys(commands).length);
    for (const result of results) expectError(result, 'invalid_actor');
    expect(h.state()).toBe(before);
  });
});

describe('history limits', () => {
  // Re-created in Phase 1.8 after it was accidentally removed during an edit.
  it('keeps the newest activity and notifications up to their limits, dropping the oldest', () => {
    const h = createHarness();
    const total = MAX_ACTIVITY_EVENTS + 5;
    for (let index = 0; index < total; index++) {
      unwrap(h.commands.createProject(USER_ACTOR, { name: `Project ${String(index)}` }));
    }
    const { activity, notifications } = h.state();
    expect(activity).toHaveLength(MAX_ACTIVITY_EVENTS);
    expect(notifications).toHaveLength(MAX_NOTIFICATIONS);
    // The newest are kept, in order.
    expect(activity.at(-1)?.description).toBe(
      `Project "Project ${String(total - 1)}" was created.`,
    );
    expect(activity[0]?.description).toBe('Project "Project 5" was created.');
  });
});

describe('createCommands', () => {
  it('reads the latest state from the store on every call', () => {
    const h = createHarness();
    let state = h.state();
    const commands = createCommands({
      store: {
        getState: () => state,
        setState: (next) => {
          state = next;
        },
      },
      clock: createTestClock(),
      ids: createSequentialIdGenerator(),
    }).commands;

    const first = unwrap(commands.createProject(USER_ACTOR, { name: 'One' }));
    const second = unwrap(commands.createProject(USER_ACTOR, { name: 'Two' }));
    expect(Object.keys(state.projects)).toEqual([first.id, second.id]);
  });
});
