import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectId, TaskId } from '@/domain/ids';
import { createSnapshot, serializeExport, createExport } from '@/domain/snapshot/format';
import { USER_ACTOR, type Grant } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, expectError, unwrap, type Harness } from '@/test/harness';

/*
 * The scoped read API, messages and agent configuration (Phase 2.0).
 * Controlled test actors only.
 */

let h: Harness;
let projectId: ProjectId;
let otherProject: ProjectId;
let ryansTask: TaskId;
let sarahsTask: TaskId;
let backendTask: TaskId;

beforeEach(() => {
  h = createHarness();
  projectId = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' })).id;
  otherProject = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Billing' })).id;
  sarahsTask = unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.design,
      title: 'Design header',
      assigneeId: EMP.sarah,
    }),
  ).id;
  backendTask = unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId: otherProject,
      departmentId: DEPT.backend,
      title: 'Invoices API',
      assigneeId: EMP.daniel,
    }),
  ).id;
  ryansTask = unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.frontend,
      title: 'Build header',
      assigneeId: EMP.ryan,
      dependencies: [sarahsTask],
    }),
  ).id;
  unwrap(h.commands.updateAccessProfile(USER_ACTOR, { employeeId: EMP.ryan, status: 'active' }));
});

const ryan = () => h.readerFor(EMP.ryan);

describe('scoped reads', () => {
  it('reads their own profile, including what they may do', () => {
    const profile = unwrap(ryan().profile());
    expect(profile).toMatchObject({
      id: EMP.ryan,
      name: 'Ryan Miller',
      department: 'Frontend Development',
      access: { status: 'active' },
    });
    expect(profile.access.permissions).toContain('task.read:department');
  });

  it('reads their own tasks and tasks in their department, nothing else', () => {
    expect(unwrap(ryan().myTasks()).map((task) => task.title)).toEqual(['Build header']);
    expect(unwrap(ryan().task(ryansTask)).title).toBe('Build header');
    const refused = expectError(ryan().task(backendTask), 'permission_denied');
    expect(refused.permission).toBe('task.read');
    expect(refused.message).toContain('"Invoices API" is outside that');
  });

  it('reports a dependency’s status but withholds its title when it is not readable', () => {
    expect(unwrap(ryan().dependencies(ryansTask))).toEqual([
      { id: sarahsTask, status: 'todo', title: null },
    ]);
  });

  it('reads projects it works on, not others', () => {
    expect(unwrap(ryan().project(projectId)).name).toBe('Website');
    expectError(ryan().project(otherProject), 'permission_denied');
  });

  it('sees only meetings it attends', () => {
    unwrap(
      h.commands.scheduleMeeting(USER_ACTOR, {
        title: 'Design review',
        participantIds: [EMP.sarah],
        roomId: 'room_meeting',
        startsAt: '2099-03-01T10:00',
        durationMinutes: 30,
      }),
    );
    unwrap(
      h.commands.scheduleMeeting(USER_ACTOR, {
        title: 'Build sync',
        participantIds: [EMP.ryan],
        roomId: 'room_meeting',
        startsAt: '2099-03-02T10:00',
        durationMinutes: 30,
      }),
    );
    expect(unwrap(ryan().meetings()).map((meeting) => meeting.title)).toEqual(['Build sync']);
  });

  it('refuses every read when the permission is missing — writing never implies reading', () => {
    const writeOnly: Grant[] = [
      { permission: 'task.change_status', scope: 'own', requiresApproval: false },
    ];
    unwrap(h.commands.updateAccessProfile(USER_ACTOR, { employeeId: EMP.ryan, grants: writeOnly }));
    expect(expectError(ryan().task(ryansTask), 'permission_denied').permission).toBe('task.read');
    expectError(ryan().myTasks(), 'permission_denied');
    expectError(ryan().profile(), 'permission_denied');
  });

  it('refuses a disabled employee, and an unknown one', () => {
    expectError(h.readerFor(EMP.sarah).myTasks(), 'permission_denied');
    expectError(h.readerFor('emp_ghost').profile(), 'invalid_actor');
  });

  it('returns frozen views with no way back to the store', () => {
    const tasks = unwrap(ryan().myTasks());
    expect(Object.isFrozen(tasks)).toBe(true);
    expect(Object.isFrozen(tasks[0])).toBe(true);
    expect(Object.keys(ryan())).toEqual([
      'employeeId',
      'profile',
      'employee',
      'myTasks',
      'task',
      'dependencies',
      'project',
      'meetings',
      'messages',
    ]);
    // Views carry no persistence metadata.
    expect(Object.keys(tasks[0] ?? {})).not.toContain('updatedAt');
  });

  it('reflects permission changes immediately', () => {
    unwrap(
      h.commands.updateAccessProfile(USER_ACTOR, { employeeId: EMP.ryan, status: 'suspended' }),
    );
    expectError(ryan().myTasks(), 'permission_denied');
  });
});

describe('messages', () => {
  it('lets the founder write to an employee and the employee read it', () => {
    unwrap(
      h.commands.sendMessage(USER_ACTOR, { to: EMP.ryan, body: '  Please start on the header. ' }),
    );
    expect(unwrap(ryan().messages())).toEqual([
      {
        from: 'founder',
        body: 'Please start on the header.',
        sentAt: expect.any(String) as unknown,
      },
    ]);
  });

  it('lets an employee write only to the founder, who is notified', () => {
    const agent = { kind: 'agent' as const, employeeId: EMP.ryan };
    unwrap(h.commands.sendMessage(agent, { to: 'user', body: 'Header is in progress.' }));
    expect(h.state().notifications.at(-1)).toMatchObject({
      title: 'Message from Ryan Miller',
      message: 'Header is in progress.',
    });
    expectError(h.commands.sendMessage(agent, { to: EMP.sarah, body: 'Hi' }), 'permission_denied');
    expectError(
      h.commands.sendMessage({ kind: 'agent', employeeId: EMP.sarah }, { to: 'user', body: 'Hi' }),
      'permission_denied',
    );
  });

  it('rejects empty messages and unknown recipients', () => {
    expectError(h.commands.sendMessage(USER_ACTOR, { to: EMP.ryan, body: '   ' }), 'validation');
    expectError(h.commands.sendMessage(USER_ACTOR, { to: 'emp_ghost', body: 'Hi' }), 'not_found');
  });
});

describe('agent configuration', () => {
  it('is founder-only and validated', () => {
    const config = unwrap(
      h.commands.updateAgentConfig(USER_ACTOR, {
        employeeId: EMP.ryan,
        patch: { provider: 'test-provider', model: 'model-1', timeoutMs: 60_000, maxIterations: 4 },
      }),
    );
    expect(config).toMatchObject({ provider: 'test-provider', model: 'model-1', maxIterations: 4 });
    expect(h.state().activity.at(-1)?.eventType).toBe('agent.configured');

    expectError(
      h.commands.updateAgentConfig(
        { kind: 'agent', employeeId: EMP.ryan },
        { employeeId: EMP.ryan, patch: { maxIterations: 50 } },
      ),
      'permission_denied',
    );
    expectError(
      h.commands.updateAgentConfig(USER_ACTOR, {
        employeeId: EMP.ryan,
        patch: { maxIterations: 0 },
      }),
      'validation',
    );
    expectError(
      h.commands.updateAgentConfig(USER_ACTOR, {
        employeeId: EMP.ryan,
        patch: { provider: 'x', model: '' },
      }),
      'validation',
    );
  });

  it('refuses credentials outright, so they can never reach exports or backups', () => {
    const error = expectError(
      h.commands.updateAgentConfig(USER_ACTOR, {
        employeeId: EMP.ryan,
        patch: { apiKey: 'sk-live-123' } as never,
      }),
      'validation',
    );
    expect(error.message).toContain('Credentials are never stored in the workspace');
    const exported = serializeExport(createExport(h.state(), '2026-03-01T00:00:00.000Z'));
    expect(exported).not.toContain('sk-live-123');
    expect(JSON.stringify(createSnapshot(h.state(), 'now'))).not.toMatch(/apiKey|secret|password/i);
  });
});

describe('gateway lookups (Phase 2.0)', () => {
  it('report only the employee’s own executions', () => {
    unwrap(h.commands.updateAccessProfile(USER_ACTOR, { employeeId: EMP.sarah, status: 'active' }));
    // A task of Ryan's with no dependencies, so it can start.
    const free = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId,
        departmentId: DEPT.frontend,
        title: 'Footer',
        assigneeId: EMP.ryan,
      }),
    ).id;
    const ryan = h.gatewayFor(EMP.ryan);
    const mine = unwrap(
      ryan.request(
        { type: 'changeTaskStatus', input: { taskId: free, status: 'in_progress' } },
        { requestId: 'r1' },
      ),
    ).execution;
    expect(ryan.statusOf(mine.id)).toEqual({ status: 'succeeded', error: null });
    expect(h.gatewayFor(EMP.sarah).statusOf(mine.id)).toBeNull();
    expect(h.gatewayFor(EMP.sarah).approvalFor(mine.id)).toBeNull();
  });
});
