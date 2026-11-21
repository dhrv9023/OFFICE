import { describe, expect, it } from 'vitest';
import { EMP, makeEmployee, makeTask, taskMap } from '../../test/factories';
import { deriveEmployeeStatus, findActiveTask, syncCurrentTasks } from './employeeStatus';

describe('deriveEmployeeStatus', () => {
  it('is idle with no tasks', () => {
    expect(deriveEmployeeStatus(EMP.sarah, [])).toBe('idle');
  });

  it('is idle with only queued tasks', () => {
    expect(deriveEmployeeStatus(EMP.sarah, [makeTask({ assigneeId: EMP.sarah })])).toBe('idle');
  });

  it('is working while a task is in progress', () => {
    const tasks = [makeTask({ assigneeId: EMP.sarah, status: 'in_progress' })];
    expect(deriveEmployeeStatus(EMP.sarah, tasks)).toBe('working');
  });

  it('is reviewing while a task is in review', () => {
    const tasks = [makeTask({ assigneeId: EMP.sarah, status: 'in_review' })];
    expect(deriveEmployeeStatus(EMP.sarah, tasks)).toBe('reviewing');
  });

  it('is blocked when a task is blocked and nothing else is under way', () => {
    const tasks = [
      makeTask({ assigneeId: EMP.sarah, status: 'blocked' }),
      makeTask({ assigneeId: EMP.sarah, status: 'todo' }),
    ];
    expect(deriveEmployeeStatus(EMP.sarah, tasks)).toBe('blocked');
  });

  it('prefers the active task over a blocked one', () => {
    const tasks = [
      makeTask({ assigneeId: EMP.sarah, status: 'blocked' }),
      makeTask({ assigneeId: EMP.sarah, status: 'in_progress' }),
    ];
    expect(deriveEmployeeStatus(EMP.sarah, tasks)).toBe('working');
  });

  it.each(['done', 'cancelled'] as const)('is idle once the only task is %s', (status) => {
    expect(deriveEmployeeStatus(EMP.sarah, [makeTask({ assigneeId: EMP.sarah, status })])).toBe(
      'idle',
    );
  });

  it("ignores other people's and unassigned tasks", () => {
    const tasks = [
      makeTask({ assigneeId: EMP.ryan, status: 'in_progress' }),
      makeTask({ assigneeId: null, status: 'blocked' }),
    ];
    expect(deriveEmployeeStatus(EMP.sarah, tasks)).toBe('idle');
    expect(deriveEmployeeStatus(EMP.ryan, tasks)).toBe('working');
  });
});

describe('findActiveTask', () => {
  it('returns null when nothing is active', () => {
    expect(findActiveTask(EMP.sarah, [makeTask({ assigneeId: EMP.sarah })])).toBeNull();
  });

  it('returns the active task', () => {
    const active = makeTask({ assigneeId: EMP.sarah, status: 'in_review' });
    expect(findActiveTask(EMP.sarah, [makeTask({ assigneeId: EMP.sarah }), active])).toBe(active);
  });

  it('chooses deterministically if corrupt data has two active tasks', () => {
    const review = makeTask({ assigneeId: EMP.sarah, status: 'in_review' });
    const older = makeTask({
      assigneeId: EMP.sarah,
      status: 'in_progress',
      createdAt: '2026-01-01',
    });
    const newer = makeTask({
      assigneeId: EMP.sarah,
      status: 'in_progress',
      createdAt: '2026-01-02',
    });
    expect(findActiveTask(EMP.sarah, [review, newer, older])).toBe(older);
    expect(findActiveTask(EMP.sarah, [older, newer, review])).toBe(older);
  });
});

describe('syncCurrentTasks', () => {
  const sarah = makeEmployee();
  const ryan = makeEmployee({ id: EMP.ryan, name: 'Ryan Miller' });
  const employees = { [sarah.id]: sarah, [ryan.id]: ryan };

  it('points each employee at their active task', () => {
    const active = makeTask({ assigneeId: EMP.sarah, status: 'in_progress' });
    const synced = syncCurrentTasks(employees, taskMap(active, makeTask({ assigneeId: EMP.ryan })));
    expect(synced[EMP.sarah]?.currentTaskId).toBe(active.id);
    expect(synced[EMP.ryan]?.currentTaskId).toBeNull();
  });

  it('clears the pointer when the task is no longer active', () => {
    const stale = { ...employees, [sarah.id]: { ...sarah, currentTaskId: 'task_gone' as const } };
    expect(syncCurrentTasks(stale, {})[EMP.sarah]?.currentTaskId).toBeNull();
  });

  it('returns the same objects when nothing changed', () => {
    const result = syncCurrentTasks(employees, taskMap(makeTask({ assigneeId: EMP.sarah })));
    expect(result).toBe(employees);
  });

  it('keeps identity for employees that did not change', () => {
    const active = makeTask({ assigneeId: EMP.sarah, status: 'in_progress' });
    const synced = syncCurrentTasks(employees, taskMap(active));
    expect(synced[EMP.ryan]).toBe(ryan);
    expect(synced[EMP.sarah]).not.toBe(sarah);
  });
});
