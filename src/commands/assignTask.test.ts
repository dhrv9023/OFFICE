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

const task = (departmentId: (typeof DEPT)[keyof typeof DEPT], title: string, extra: object = {}) =>
  unwrap(h.commands.createTask(USER_ACTOR, { projectId, departmentId, title, ...extra }));

describe('assignTask', () => {
  it('assigns an unassigned task', () => {
    const created = task(DEPT.design, 'Design homepage');
    const assigned = unwrap(
      h.commands.assignTask(USER_ACTOR, { taskId: created.id, assigneeId: EMP.sarah }),
    );

    expect(assigned).toEqual({
      ...created,
      assigneeId: EMP.sarah,
      updatedAt: '2026-02-01T09:02:00.000Z',
    });
    expect(h.state().tasks[created.id]).toEqual(assigned);
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'task.assigned',
      employeeId: EMP.sarah,
      taskId: created.id,
      description: 'Task "Design homepage" was assigned to Sarah Chen.',
    });
    expect(h.state().notifications.at(-1)).toMatchObject({
      title: 'Task assigned',
      relatedEntityId: created.id,
    });
  });

  it('reassigns to a colleague, with a distinct event', () => {
    const created = task(DEPT.design, 'Review flows', { assigneeId: EMP.sarah });
    const reassigned = unwrap(
      h.commands.assignTask(USER_ACTOR, {
        taskId: created.id,
        assigneeId: EMP.alex,
        allowCrossDepartment: true,
      }),
    );

    expect(reassigned.assigneeId).toBe(EMP.alex);
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'task.reassigned',
      employeeId: EMP.alex,
      description: 'Task "Review flows" was reassigned from Sarah Chen to Alex Morgan.',
    });
    expect(h.state().notifications.at(-1)).toMatchObject({ title: 'Task reassigned' });
  });

  it('moves the current-task pointer when an active task is handed over', () => {
    const created = task(DEPT.design, 'Design homepage', { assigneeId: EMP.sarah });
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: created.id, status: 'in_progress' }));
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBe(created.id);

    unwrap(
      h.commands.assignTask(USER_ACTOR, {
        taskId: created.id,
        assigneeId: EMP.ryan,
        allowCrossDepartment: true,
      }),
    );

    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBeNull();
    expect(h.state().employees[EMP.ryan]?.currentTaskId).toBe(created.id);
  });

  it('refuses to hand an active task to someone who is busy', () => {
    const sarahs = task(DEPT.design, 'Design homepage', { assigneeId: EMP.sarah });
    const ryans = task(DEPT.frontend, 'Build header', { assigneeId: EMP.ryan });
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: sarahs.id, status: 'in_progress' }));
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: ryans.id, status: 'in_progress' }));
    const before = h.state();

    const error = expectError(
      h.commands.assignTask(USER_ACTOR, {
        taskId: sarahs.id,
        assigneeId: EMP.ryan,
        allowCrossDepartment: true,
      }),
      'assignment_rejected',
    );
    expect(error.reason).toBe('employee_busy');
    expect(h.state()).toBe(before);
  });

  it('lets a busy employee be given more queued work', () => {
    const first = task(DEPT.design, 'Design homepage', { assigneeId: EMP.sarah });
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: first.id, status: 'in_progress' }));
    const second = task(DEPT.design, 'Design pricing page');

    unwrap(h.commands.assignTask(USER_ACTOR, { taskId: second.id, assigneeId: EMP.sarah }));
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBe(first.id);
  });

  it('unassigns a queued task without a notification', () => {
    const created = task(DEPT.design, 'Design homepage', { assigneeId: EMP.sarah });
    const notificationsBefore = h.state().notifications.length;

    const unassigned = unwrap(
      h.commands.assignTask(USER_ACTOR, { taskId: created.id, assigneeId: null }),
    );

    expect(unassigned.assigneeId).toBeNull();
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'task.unassigned',
      employeeId: EMP.sarah,
      description: 'Task "Design homepage" was unassigned from Sarah Chen.',
    });
    expect(h.state().notifications).toHaveLength(notificationsBefore);
  });

  it('refuses to unassign a task that is in progress', () => {
    const created = task(DEPT.design, 'Design homepage', { assigneeId: EMP.sarah });
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: created.id, status: 'in_progress' }));

    const error = expectError(
      h.commands.assignTask(USER_ACTOR, { taskId: created.id, assigneeId: null }),
      'assignment_rejected',
    );
    expect(error.reason).toBe('assignee_required');
  });

  it('rejects an employee from an incompatible department unless explicitly allowed', () => {
    const created = task(DEPT.backend, 'Design API');
    const before = h.state();

    const error = expectError(
      h.commands.assignTask(USER_ACTOR, { taskId: created.id, assigneeId: EMP.sarah }),
      'assignment_rejected',
    );
    expect(error.reason).toBe('department_mismatch');
    expect(h.state()).toBe(before);

    unwrap(
      h.commands.assignTask(USER_ACTOR, {
        taskId: created.id,
        assigneeId: EMP.sarah,
        allowCrossDepartment: true,
      }),
    );
    expect(h.state().tasks[created.id]?.assigneeId).toBe(EMP.sarah);
  });

  it('rejects unknown tasks and employees, closed tasks and no-op assignments', () => {
    const created = task(DEPT.design, 'Design homepage', { assigneeId: EMP.sarah });

    expectError(
      h.commands.assignTask(USER_ACTOR, { taskId: 'task_missing', assigneeId: EMP.sarah }),
      'not_found',
    );
    expect(
      expectError(
        h.commands.assignTask(USER_ACTOR, { taskId: created.id, assigneeId: 'emp_missing' }),
        'not_found',
      ).entity,
    ).toBe('employee');
    expect(
      expectError(
        h.commands.assignTask(USER_ACTOR, { taskId: created.id, assigneeId: EMP.sarah }),
        'conflict',
      ).reason,
    ).toBe('no_change');

    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: created.id, status: 'cancelled' }));
    expect(
      expectError(
        h.commands.assignTask(USER_ACTOR, { taskId: created.id, assigneeId: null }),
        'assignment_rejected',
      ).reason,
    ).toBe('task_closed');
  });
});
