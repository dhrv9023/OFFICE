import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectId } from '@/domain/ids';
import { TASK_STATUSES, USER_ACTOR, type Task, type TaskStatus } from '@/domain/types';
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

const sarahTask = (title: string, extra: object = {}): Task =>
  unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.design,
      title,
      assigneeId: EMP.sarah,
      ...extra,
    }),
  );

const move = (task: Task, ...statuses: TaskStatus[]): void => {
  for (const status of statuses) {
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status }));
  }
};

describe('changeTaskStatus', () => {
  it('starts a task and occupies the assignee', () => {
    const task = sarahTask('Design homepage');
    const started = unwrap(
      h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }),
    );

    expect(started).toEqual({
      ...task,
      status: 'in_progress',
      updatedAt: '2026-02-01T09:02:00.000Z',
    });
    expect(h.state().tasks[task.id]).toEqual(started);
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBe(task.id);
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'task.status_changed',
      employeeId: EMP.sarah,
      description: 'Task "Design homepage" moved from To do to In progress.',
    });
  });

  it('frees the assignee when the task leaves the active statuses', () => {
    for (const exit of ['todo', 'blocked', 'cancelled'] as const) {
      const task = sarahTask(`Task leaving to ${exit}`);
      move(task, 'in_progress');
      expect(h.state().employees[EMP.sarah]?.currentTaskId).toBe(task.id);
      move(task, exit);
      expect(h.state().employees[EMP.sarah]?.currentTaskId).toBeNull();
      if (exit !== 'cancelled') move(task, 'cancelled');
    }
  });

  it('keeps the assignee occupied through review and frees them on done', () => {
    const task = sarahTask('Design homepage');
    move(task, 'in_progress', 'in_review');
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBe(task.id);
    move(task, 'done');
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBeNull();
  });

  it('notifies for review, blocked, done and cancelled — not for start', () => {
    const titles = (): string[] => h.state().notifications.map((item) => item.title);
    const a = sarahTask('A');
    const b = sarahTask('B');
    const baseline = titles().length;

    move(a, 'in_progress');
    expect(titles()).toHaveLength(baseline);

    move(a, 'in_review');
    move(a, 'blocked');
    move(a, 'cancelled');
    expect(titles().slice(baseline)).toEqual([
      'Ready for review',
      'Task blocked',
      'Task cancelled',
    ]);
    expect(h.state().notifications.at(-2)).toMatchObject({
      type: 'warning',
      relatedEntityId: a.id,
    });

    move(b, 'in_progress', 'in_review', 'done');
    expect(titles().slice(-3)).toEqual([
      'Ready for review',
      'Task completed',
      'All tasks complete',
    ]);
  });

  it('announces project completion only when the last counted task is done', () => {
    const a = sarahTask('A');
    const b = sarahTask('B');
    const completions = (): number =>
      h.state().notifications.filter((item) => item.title === 'All tasks complete').length;

    move(a, 'in_progress', 'in_review', 'done');
    expect(completions()).toBe(0);

    move(b, 'in_progress', 'in_review', 'done');
    expect(completions()).toBe(1);
    expect(h.state().notifications.at(-1)).toMatchObject({
      type: 'success',
      relatedEntityId: projectId,
      message: 'Every task in "Website" is done.',
    });
  });

  it('records the reason in the event and the notification', () => {
    const task = sarahTask('Design homepage');
    unwrap(
      h.commands.changeTaskStatus(USER_ACTOR, {
        taskId: task.id,
        status: 'blocked',
        reason: '  Waiting for brand colours ',
      }),
    );
    expect(h.state().activity.at(-1)?.description).toBe(
      'Task "Design homepage" moved from To do to Blocked. Reason: Waiting for brand colours',
    );
    expect(h.state().notifications.at(-1)?.message).toBe(
      '"Design homepage" is blocked. Reason: Waiting for brand colours',
    );
  });

  it('rejects every transition the table does not allow, leaving state untouched', () => {
    const task = sarahTask('Design homepage');
    const before = h.state();

    for (const status of ['in_review', 'done', 'todo'] as const) {
      const error = expectError(
        h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status }),
        'invalid_transition',
      );
      expect(error).toMatchObject({ from: 'todo', to: status });
    }
    expect(h.state()).toBe(before);
  });

  it.each(['done', 'cancelled'] as const)('never reopens a %s task', (terminal) => {
    const task = sarahTask('Design homepage');
    if (terminal === 'done') move(task, 'in_progress', 'in_review', 'done');
    else move(task, 'cancelled');
    const before = h.state();

    for (const status of TASK_STATUSES) {
      expectError(
        h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status }),
        'invalid_transition',
      );
    }
    expect(h.state()).toBe(before);
  });

  it('refuses to start an unassigned task', () => {
    const task = unwrap(
      h.commands.createTask(USER_ACTOR, { projectId, departmentId: DEPT.design, title: 'Orphan' }),
    );
    const error = expectError(
      h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }),
      'assignment_rejected',
    );
    expect(error.reason).toBe('assignee_required');
  });

  it('allows only one active task per employee', () => {
    const first = sarahTask('First');
    const second = sarahTask('Second');
    move(first, 'in_progress');

    const error = expectError(
      h.commands.changeTaskStatus(USER_ACTOR, { taskId: second.id, status: 'in_progress' }),
      'assignment_rejected',
    );
    expect(error.reason).toBe('employee_busy');
    expect(error.message).toContain('First');

    // Review still occupies her…
    move(first, 'in_review');
    expectError(
      h.commands.changeTaskStatus(USER_ACTOR, { taskId: second.id, status: 'in_progress' }),
      'assignment_rejected',
    );

    // …until the first task is finished.
    move(first, 'done');
    move(second, 'in_progress');
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBe(second.id);
  });

  it('lets a blocked task be parked while the employee works on something else', () => {
    const first = sarahTask('First');
    const second = sarahTask('Second');
    move(first, 'in_progress', 'blocked');
    move(second, 'in_progress');
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBe(second.id);

    // The blocked task cannot resume while she is busy.
    expectError(
      h.commands.changeTaskStatus(USER_ACTOR, { taskId: first.id, status: 'in_progress' }),
      'assignment_rejected',
    );
  });

  it('refuses to start a task before its dependencies are resolved', () => {
    const wireframes = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId,
        departmentId: DEPT.frontend,
        title: 'Wireframes',
        assigneeId: EMP.ryan,
      }),
    );
    const mockups = sarahTask('Mockups', { dependencies: [wireframes.id] });

    const error = expectError(
      h.commands.changeTaskStatus(USER_ACTOR, { taskId: mockups.id, status: 'in_progress' }),
      'dependencies_incomplete',
    );
    expect(error.blockedBy).toEqual([wireframes.id]);

    move(wireframes, 'in_progress', 'in_review', 'done');
    move(mockups, 'in_progress');
    expect(h.state().tasks[mockups.id]?.status).toBe('in_progress');
  });

  it('keeps a cancelled dependency blocking until the user removes it', () => {
    const optional = sarahTask('Optional research');
    const main = sarahTask('Main design', { dependencies: [optional.id] });
    move(optional, 'cancelled');

    const notice = h.state().notifications.at(-1);
    expect(notice?.type).toBe('warning');
    expect(notice?.message).toMatch(/1 task depends on it and cannot start/);

    const error = expectError(
      h.commands.changeTaskStatus(USER_ACTOR, { taskId: main.id, status: 'in_progress' }),
      'dependencies_incomplete',
    );
    expect(error.cancelled).toEqual([optional.id]);
    expect(h.state().tasks[main.id]?.status).toBe('todo');

    // The waiver is explicit: the user removes the cancelled prerequisite.
    unwrap(h.commands.updateTask(USER_ACTOR, { taskId: main.id, patch: { dependencies: [] } }));
    move(main, 'in_progress');
    expect(h.state().tasks[main.id]?.status).toBe('in_progress');
  });

  it('raises a plain notification when a cancelled task has no open dependents', () => {
    const task = sarahTask('Standalone');
    move(task, 'cancelled');
    expect(h.state().notifications.at(-1)?.type).not.toBe('warning');
  });

  it('rejects unknown tasks, unknown statuses and over-long reasons', () => {
    const task = sarahTask('Design homepage');
    expectError(
      h.commands.changeTaskStatus(USER_ACTOR, { taskId: 'task_missing', status: 'blocked' }),
      'not_found',
    );
    expectError(
      h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'archived' as never }),
      'validation',
    );
    expectError(
      h.commands.changeTaskStatus(USER_ACTOR, {
        taskId: task.id,
        status: 'blocked',
        reason: 'x'.repeat(501),
      }),
      'validation',
    );
  });
});
