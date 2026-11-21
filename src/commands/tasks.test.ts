import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectId } from '@/domain/ids';
import { USER_ACTOR } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, expectError, unwrap, type Harness } from '@/test/harness';

let h: Harness;
let projectId: ProjectId;

beforeEach(() => {
  h = createHarness();
  projectId = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' })).id;
});
afterEach(() => {
  h.expectConsistent();
});

const design = (title: string, extra: object = {}) =>
  unwrap(
    h.commands.createTask(USER_ACTOR, { projectId, departmentId: DEPT.design, title, ...extra }),
  );

describe('createTask', () => {
  it('creates an unassigned todo task with defaults', () => {
    const task = design('  Design homepage ');

    expect(task).toEqual({
      id: 'task_0001',
      projectId,
      departmentId: DEPT.design,
      assigneeId: null,
      title: 'Design homepage',
      description: '',
      priority: 'medium',
      status: 'todo',
      dependencies: [],
      deadline: null,
      blockedReason: null,
      createdAt: '2026-02-01T09:01:00.000Z',
      updatedAt: '2026-02-01T09:01:00.000Z',
    });
    expect(h.state().tasks[task.id]).toEqual(task);
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'task.created',
      actorId: 'user',
      projectId,
      taskId: task.id,
      description: 'Task "Design homepage" was created in "Website".',
    });
    // No assignee, so nobody to notify (only the project-created notification exists).
    expect(h.state().notifications).toHaveLength(1);
  });

  it('can assign on creation, logging both events and notifying', () => {
    const task = design('Design homepage', { assigneeId: EMP.sarah, priority: 'high' });

    expect(task).toMatchObject({ assigneeId: EMP.sarah, priority: 'high', status: 'todo' });
    expect(
      h
        .state()
        .activity.slice(-2)
        .map((event) => event.eventType),
    ).toEqual(['task.created', 'task.assigned']);
    expect(h.state().notifications.at(-1)).toMatchObject({
      type: 'info',
      title: 'Task assigned',
      message: 'Sarah Chen was assigned "Design homepage".',
      relatedEntityId: task.id,
    });
    // Queued work does not occupy the employee.
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBeNull();
  });

  it('accepts dependencies on tasks in the same project', () => {
    const first = design('Wireframes');
    const second = design('Mockups', { dependencies: [first.id] });
    expect(second.dependencies).toEqual([first.id]);
  });

  it('rejects an unknown project or department', () => {
    expectError(
      h.commands.createTask(USER_ACTOR, {
        projectId: 'prj_missing',
        departmentId: DEPT.design,
        title: 'T',
      }),
      'not_found',
    );
    const error = expectError(
      h.commands.createTask(USER_ACTOR, { projectId, departmentId: 'dept_missing', title: 'T' }),
      'not_found',
    );
    expect(error.entity).toBe('department');
  });

  it.each([
    ['a blank title', { title: '  ' }, 'validation'],
    ['an over-long title', { title: 'x'.repeat(141) }, 'validation'],
    ['an unknown priority', { title: 'T', priority: 'urgent' }, 'validation'],
    ['an unknown assignee', { title: 'T', assigneeId: 'emp_missing' }, 'not_found'],
    [
      'an assignee from another department',
      { title: 'T', assigneeId: EMP.ryan },
      'assignment_rejected',
    ],
    ['a missing dependency', { title: 'T', dependencies: ['task_missing'] }, 'invalid_reference'],
    [
      'a duplicated dependency',
      { title: 'T', dependencies: ['task_x', 'task_x'] },
      'invalid_reference',
    ],
  ] as const)('rejects %s and changes nothing', (_label, extra, code) => {
    const before = h.state();
    const result = h.commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.design,
      ...extra,
    } as never);
    expectError(result, code);
    expect(h.state()).toBe(before);
  });

  it('allows a cross-department assignee only with the explicit flag', () => {
    const task = design('Review copy', { assigneeId: EMP.ryan, allowCrossDepartment: true });
    expect(task.assigneeId).toBe(EMP.ryan);
    expect(task.departmentId).toBe(DEPT.design);
  });

  it('rejects a dependency from another project', () => {
    const other = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Other' }));
    const foreign = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: other.id,
        departmentId: DEPT.design,
        title: 'Foreign',
      }),
    );
    expectError(
      h.commands.createTask(USER_ACTOR, {
        projectId,
        departmentId: DEPT.design,
        title: 'T',
        dependencies: [foreign.id],
      }),
      'invalid_reference',
    );
  });

  it('rejects tasks in an archived project', () => {
    unwrap(h.commands.updateProject(USER_ACTOR, { projectId, patch: { status: 'archived' } }));
    const error = expectError(
      h.commands.createTask(USER_ACTOR, { projectId, departmentId: DEPT.design, title: 'T' }),
      'conflict',
    );
    expect(error.reason).toBe('project_archived');
  });
});

describe('updateTask', () => {
  it('edits details and logs which fields changed', () => {
    const task = design('Design homepage');
    const updated = unwrap(
      h.commands.updateTask(USER_ACTOR, {
        taskId: task.id,
        patch: {
          title: 'Design landing page',
          description: 'Hero + pricing',
          priority: 'critical',
        },
      }),
    );

    expect(updated).toEqual({
      ...task,
      title: 'Design landing page',
      description: 'Hero + pricing',
      priority: 'critical',
      updatedAt: '2026-02-01T09:02:00.000Z',
    });
    expect(h.state().tasks[task.id]).toEqual(updated);
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'task.updated',
      description: 'Task "Design landing page" was updated (title, description, priority).',
    });
  });

  it('cannot change status, assignee or project through the patch', () => {
    const task = design('Design homepage');
    const patch = { title: 'New', status: 'done', assigneeId: EMP.sarah, projectId: 'prj_x' };
    const updated = unwrap(h.commands.updateTask(USER_ACTOR, { taskId: task.id, patch: patch }));
    expect(updated).toMatchObject({ status: 'todo', assigneeId: null, projectId });
  });

  it('moves an unassigned task to another department', () => {
    const task = design('Build header');
    const updated = unwrap(
      h.commands.updateTask(USER_ACTOR, {
        taskId: task.id,
        patch: { departmentId: DEPT.frontend },
      }),
    );
    expect(updated.departmentId).toBe(DEPT.frontend);
  });

  it('refuses to move an assigned task away from its assignee’s department', () => {
    const task = design('Design homepage', { assigneeId: EMP.sarah });
    const input = { taskId: task.id, patch: { departmentId: DEPT.frontend } };

    const error = expectError(h.commands.updateTask(USER_ACTOR, input), 'assignment_rejected');
    expect(error.reason).toBe('department_mismatch');

    const allowed = unwrap(
      h.commands.updateTask(USER_ACTOR, { ...input, allowCrossDepartment: true }),
    );
    expect(allowed).toMatchObject({ departmentId: DEPT.frontend, assigneeId: EMP.sarah });
  });

  it('updates dependencies and prevents circular chains', () => {
    const a = design('A');
    const b = design('B', { dependencies: [a.id] });
    const c = design('C', { dependencies: [b.id] });

    // A → C would close the loop A → C → B → A.
    const error = expectError(
      h.commands.updateTask(USER_ACTOR, { taskId: a.id, patch: { dependencies: [c.id] } }),
      'dependency_cycle',
    );
    expect(error.cycle).toEqual([a.id, c.id, b.id, a.id]);
    expect(h.state().tasks[a.id]?.dependencies).toEqual([]);

    // Self-dependency is rejected too.
    expectError(
      h.commands.updateTask(USER_ACTOR, { taskId: a.id, patch: { dependencies: [a.id] } }),
      'validation',
    );

    // A legal change is applied.
    unwrap(h.commands.updateTask(USER_ACTOR, { taskId: c.id, patch: { dependencies: [a.id] } }));
    expect(h.state().tasks[c.id]?.dependencies).toEqual([a.id]);
  });

  it('rejects unknown tasks, unknown departments, invalid values and no-op patches', () => {
    const task = design('Design homepage');
    const before = h.state();

    expectError(
      h.commands.updateTask(USER_ACTOR, { taskId: 'task_missing', patch: { title: 'X' } }),
      'not_found',
    );
    expectError(
      h.commands.updateTask(USER_ACTOR, {
        taskId: task.id,
        patch: { departmentId: 'dept_missing' },
      }),
      'not_found',
    );
    expectError(
      h.commands.updateTask(USER_ACTOR, { taskId: task.id, patch: { title: '' } }),
      'validation',
    );
    expect(
      expectError(
        h.commands.updateTask(USER_ACTOR, {
          taskId: task.id,
          patch: { title: 'Design homepage', dependencies: [] },
        }),
        'conflict',
      ).reason,
    ).toBe('no_change');
    expect(h.state()).toBe(before);
  });

  it('treats closed tasks as immutable', () => {
    const task = design('Design homepage');
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'cancelled' }));
    const error = expectError(
      h.commands.updateTask(USER_ACTOR, { taskId: task.id, patch: { title: 'Revived' } }),
      'conflict',
    );
    expect(error.reason).toBe('task_closed');
  });

  it('treats tasks in an archived project as read-only', () => {
    const task = design('Design homepage');
    unwrap(h.commands.updateProject(USER_ACTOR, { projectId, patch: { status: 'archived' } }));
    for (const result of [
      h.commands.updateTask(USER_ACTOR, { taskId: task.id, patch: { title: 'X' } }),
      h.commands.assignTask(USER_ACTOR, { taskId: task.id, assigneeId: EMP.sarah }),
      h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'blocked' }),
    ]) {
      expect(expectError(result, 'conflict').reason).toBe('project_archived');
    }
  });
});

describe('task deadlines (Phase 1.6)', () => {
  it('stores an optional due date and defaults to none', () => {
    expect(design('No date').deadline).toBeNull();
    expect(design('Dated', { deadline: '2026-12-18' }).deadline).toBe('2026-12-18');
  });

  it('rejects a date that is not a real calendar day', () => {
    for (const deadline of ['2026-02-30', '18/12/2026', 'soon']) {
      const result = h.commands.createTask(USER_ACTOR, {
        projectId,
        departmentId: DEPT.design,
        title: 'Bad date',
        deadline,
      });
      expect(expectError(result, 'validation').field).toBe('deadline');
    }
  });

  it('changes or clears the due date through updateTask', () => {
    const task = design('Dated', { deadline: '2026-12-18' });
    const moved = unwrap(
      h.commands.updateTask(USER_ACTOR, { taskId: task.id, patch: { deadline: '2027-01-05' } }),
    );
    expect(moved.deadline).toBe('2027-01-05');
    expect(h.state().activity.at(-1)?.description).toContain('(deadline)');
    const cleared = unwrap(
      h.commands.updateTask(USER_ACTOR, { taskId: task.id, patch: { deadline: null } }),
    );
    expect(cleared.deadline).toBeNull();
  });
});

describe('blocked reasons (Phase 1.7)', () => {
  it('keeps the reason while blocked and clears it when the task moves on', () => {
    const task = design('Needs credentials');
    const blocked = unwrap(
      h.commands.changeTaskStatus(USER_ACTOR, {
        taskId: task.id,
        status: 'blocked',
        reason: '  Waiting on staging access ',
      }),
    );
    expect(blocked.blockedReason).toBe('Waiting on staging access');
    const unblocked = unwrap(
      h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'todo' }),
    );
    expect(unblocked.blockedReason).toBeNull();
  });

  it('stores no reason when none is given', () => {
    const task = design('Mystery');
    expect(
      unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'blocked' }))
        .blockedReason,
    ).toBeNull();
  });
});
