import { beforeEach, describe, expect, it } from 'vitest';
import type { EmployeeId, ProjectId, TaskId } from '@/domain/ids';
import { defaultGrants } from '@/domain/rules/access';
import { USER_ACTOR, type Actor, type Grant, type WorkspaceState } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, expectError, unwrap, type Harness } from '@/test/harness';

/*
 * Authorization at the command layer (Phase 1.8). These tests call the raw
 * commands directly, exactly as a misbehaving caller could, and check that only
 * authorized changes ever reach the state.
 */

const agent = (employeeId: EmployeeId): Actor => ({ kind: 'agent', employeeId });
const RYAN = agent(EMP.ryan);
const ALEX = agent(EMP.alex);

/** Business data an unauthorized call must never change. */
const business = (state: WorkspaceState) => ({
  projects: state.projects,
  tasks: state.tasks,
  employees: state.employees,
  meetings: state.meetings,
  accessProfiles: state.accessProfiles,
});

let h: Harness;
let projectId: ProjectId;
let ryansTask: TaskId;
let sarahsTask: TaskId;

beforeEach(() => {
  h = createHarness();
  projectId = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' })).id;
  ryansTask = unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.frontend,
      title: 'Build header',
      assigneeId: EMP.ryan,
    }),
  ).id;
  sarahsTask = unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.design,
      title: 'Design header',
      assigneeId: EMP.sarah,
    }),
  ).id;
});

const enable = (employeeId: EmployeeId, grants?: readonly Grant[]) =>
  unwrap(
    h.commands.updateAccessProfile(USER_ACTOR, {
      employeeId,
      status: 'active',
      ...(grants ? { grants } : {}),
    }),
  );

describe('identity and standing', () => {
  it('gives the founder full authority, without approvals', () => {
    unwrap(h.commands.deleteTask(USER_ACTOR, { taskId: sarahsTask }));
    unwrap(h.commands.updateProject(USER_ACTOR, { projectId, patch: { status: 'archived' } }));
  });

  it('starts every AI employee disabled: nothing they try runs', () => {
    expect(Object.values(h.state().accessProfiles).every((p) => p.status === 'disabled')).toBe(
      true,
    );
    const before = h.state();
    const error = expectError(
      h.commands.changeTaskStatus(RYAN, { taskId: ryansTask, status: 'in_progress' }),
      'permission_denied',
    );
    expect(error.message).toBe('Ryan Miller is not enabled to act (AI access is disabled).');
    expect(h.state()).toBe(before);
  });

  it('refuses a suspended employee even with grants', () => {
    enable(EMP.ryan);
    unwrap(
      h.commands.updateAccessProfile(USER_ACTOR, { employeeId: EMP.ryan, status: 'suspended' }),
    );
    expectError(
      h.commands.changeTaskStatus(RYAN, { taskId: ryansTask, status: 'in_progress' }),
      'permission_denied',
    );
  });

  it('keeps identity and permissions through a rename', () => {
    enable(EMP.ryan);
    unwrap(h.commands.renameEmployee(USER_ACTOR, { employeeId: EMP.ryan, name: 'Ryan Park' }));
    unwrap(h.commands.changeTaskStatus(RYAN, { taskId: ryansTask, status: 'in_progress' }));
    expect(h.state().activity.at(-1)?.actorId).toBe(EMP.ryan);
  });
});

describe('permissions and scope', () => {
  beforeEach(() => {
    enable(EMP.ryan);
  });

  it('lets a specialist move their own task', () => {
    unwrap(h.commands.changeTaskStatus(RYAN, { taskId: ryansTask, status: 'in_progress' }));
    expect(h.state().tasks[ryansTask]?.status).toBe('in_progress');
  });

  it("refuses work outside the grant's scope, without changing anything", () => {
    const before = business(h.state());
    const error = expectError(
      h.commands.changeTaskStatus(RYAN, { taskId: sarahsTask, status: 'in_progress' }),
      'permission_denied',
    );
    expect(error.message).toContain('only for their own work');
    expect(business(h.state())).toEqual(before);
  });

  it('refuses actions with no grant at all', () => {
    const before = business(h.state());
    expect(
      expectError(
        h.commands.updateProject(RYAN, { projectId, patch: { status: 'archived' } }),
        'permission_denied',
      ).permission,
    ).toBe('project.change_status');
    expectError(h.commands.createProject(RYAN, { name: 'Side project' }), 'permission_denied');
    expect(business(h.state())).toEqual(before);
  });

  it('never lets an employee manage access, decide approvals or read the founder’s inbox', () => {
    const before = h.state();
    expectError(
      h.commands.updateAccessProfile(RYAN, {
        employeeId: EMP.ryan,
        grants: defaultGrants({ departmentId: DEPT.management }),
      }),
      'permission_denied',
    );
    expectError(h.commands.approveRequest(RYAN, { approvalId: 'apr_0001' }), 'permission_denied');
    expectError(h.commands.markAllNotificationsRead(RYAN), 'permission_denied');
    expect(h.state()).toBe(before);
  });

  it('refuses founder-only permissions in a profile, so they can never be granted', () => {
    const error = expectError(
      h.commands.updateAccessProfile(USER_ACTOR, {
        employeeId: EMP.ryan,
        grants: [{ permission: 'approval.decide', scope: 'any', requiresApproval: false }],
      }),
      'validation',
    );
    expect(error.message).toContain('reserved for the founder');
    expectError(
      h.commands.updateAccessProfile(USER_ACTOR, {
        employeeId: EMP.ryan,
        grants: [{ permission: 'project.delete', scope: 'own', requiresApproval: false }],
      }),
      'validation',
    );
  });

  it('applies permission changes immediately', () => {
    unwrap(h.commands.updateAccessProfile(USER_ACTOR, { employeeId: EMP.ryan, grants: [] }));
    expectError(
      h.commands.changeTaskStatus(RYAN, { taskId: ryansTask, status: 'in_progress' }),
      'permission_denied',
    );
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'access.changed',
      actorId: 'user',
      employeeId: EMP.ryan,
    });
  });

  it('cannot skip approval by calling the command directly', () => {
    enable(EMP.alex); // the project manager may assign anything
    const before = business(h.state());
    // Without a grant it is simply refused; with one, the policy still demands approval.
    const error = expectError(
      h.commands.deleteTask(ALEX, { taskId: sarahsTask }),
      'permission_denied',
    );
    expect(error.permission).toBe('task.delete');
    unwrap(
      h.commands.updateAccessProfile(USER_ACTOR, {
        employeeId: EMP.alex,
        grants: [
          ...defaultGrants({ departmentId: DEPT.management }),
          { permission: 'task.delete', scope: 'any', requiresApproval: false },
        ],
      }),
    );
    const blocked = expectError(
      h.commands.deleteTask(ALEX, { taskId: sarahsTask }),
      'approval_required',
    );
    expect(blocked.message).toContain('Deleting a task always needs the founder');
    expect(business(h.state()).tasks).toEqual(before.tasks);
  });

  it("needs approval to take over someone else's work, but not to pick up unowned work", () => {
    enable(EMP.alex);
    const unowned = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId,
        departmentId: DEPT.frontend,
        title: 'Footer',
      }),
    ).id;
    unwrap(h.commands.assignTask(ALEX, { taskId: unowned, assigneeId: EMP.ryan }));
    const error = expectError(
      h.commands.assignTask(ALEX, {
        taskId: sarahsTask,
        assigneeId: EMP.emma,
        allowCrossDepartment: true,
      }),
      'approval_required',
    );
    expect(error.message).toContain('belongs to Sarah Chen');
    expect(h.state().tasks[sarahsTask]?.assigneeId).toBe(EMP.sarah);
  });

  it('honours a grant that asks for approval on every use', () => {
    enable(EMP.alex);
    expectError(h.commands.createProject(ALEX, { name: 'New line' }), 'approval_required');
  });
});
