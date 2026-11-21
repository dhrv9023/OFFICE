import { describe, expect, it } from 'vitest';
import { makeTask, taskMap } from '../../test/factories';
import { expectError } from '../../test/harness';
import {
  cancelledDependencies,
  checkDependencies,
  findDependencyCycle,
  openDependents,
  unresolvedDependencies,
} from './dependencies';

describe('checkDependencies', () => {
  it('accepts existing tasks from the same project', () => {
    const a = makeTask();
    const b = makeTask();
    const c = makeTask();
    expect(checkDependencies(c, [a.id, b.id], taskMap(a, b, c))).toEqual({
      ok: true,
      value: [a.id, b.id],
    });
  });

  it('accepts an empty list', () => {
    const a = makeTask();
    expect(checkDependencies(a, [], taskMap(a))).toEqual({ ok: true, value: [] });
  });

  it('rejects a task depending on itself', () => {
    const a = makeTask();
    expectError(checkDependencies(a, [a.id], taskMap(a)), 'validation');
  });

  it('rejects the same dependency twice', () => {
    const a = makeTask();
    const b = makeTask();
    expectError(checkDependencies(b, [a.id, a.id], taskMap(a, b)), 'validation');
  });

  it('rejects a dependency that does not exist', () => {
    const a = makeTask();
    const error = expectError(
      checkDependencies(a, ['task_missing'], taskMap(a)),
      'invalid_reference',
    );
    expect(error).toMatchObject({ entity: 'task', id: 'task_missing', field: 'dependencies' });
  });

  it('rejects a dependency from another project', () => {
    const foreign = makeTask({ projectId: 'prj_other' });
    const a = makeTask();
    expectError(checkDependencies(a, [foreign.id], taskMap(foreign, a)), 'invalid_reference');
  });

  it.each([['not-a-list'], [[42]], [null]])('rejects malformed input %j', (value) => {
    const a = makeTask();
    expectError(checkDependencies(a, value, taskMap(a)), 'validation');
  });

  it('rejects a direct cycle (A → B, then B → A)', () => {
    const b = makeTask();
    const a = makeTask({ dependencies: [b.id] });
    const error = expectError(checkDependencies(b, [a.id], taskMap(a, b)), 'dependency_cycle');
    expect(error.cycle).toEqual([b.id, a.id, b.id]);
  });

  it('rejects a long cycle (A → B → C, then C → A)', () => {
    const c = makeTask();
    const b = makeTask({ dependencies: [c.id] });
    const a = makeTask({ dependencies: [b.id] });
    const error = expectError(checkDependencies(c, [a.id], taskMap(a, b, c)), 'dependency_cycle');
    expect(error.cycle).toEqual([c.id, a.id, b.id, c.id]);
  });

  it('accepts a diamond, which shares a dependency without looping', () => {
    const base = makeTask();
    const left = makeTask({ dependencies: [base.id] });
    const right = makeTask({ dependencies: [base.id] });
    const top = makeTask();
    expect(checkDependencies(top, [left.id, right.id], taskMap(base, left, right, top)).ok).toBe(
      true,
    );
  });

  it('validates a task that does not exist yet (creation)', () => {
    const a = makeTask();
    const draft = { id: 'task_new', projectId: a.projectId } as const;
    expect(checkDependencies(draft, [a.id], taskMap(a)).ok).toBe(true);
  });
});

describe('findDependencyCycle', () => {
  it('returns null when there is no loop', () => {
    const a = makeTask();
    const b = makeTask({ dependencies: [a.id] });
    expect(findDependencyCycle(b.id, b.dependencies, taskMap(a, b))).toBeNull();
  });

  it('terminates on a pre-existing loop that does not involve the task', () => {
    const x = makeTask({ id: 'task_x', dependencies: ['task_y'] });
    const y = makeTask({ id: 'task_y', dependencies: ['task_x'] });
    const a = makeTask();
    expect(findDependencyCycle(a.id, [x.id], taskMap(x, y, a))).toBeNull();
  });
});

describe('unresolvedDependencies', () => {
  it('lists every dependency that is not done, including cancelled and missing ones', () => {
    const open = makeTask({ status: 'in_review' });
    const done = makeTask({ status: 'done' });
    const cancelled = makeTask({ status: 'cancelled' });
    const task = makeTask({ dependencies: [open.id, done.id, cancelled.id, 'task_missing'] });
    const tasks = taskMap(open, done, cancelled, task);
    expect(unresolvedDependencies(task, tasks)).toEqual([open.id, cancelled.id, 'task_missing']);
    expect(cancelledDependencies(task, tasks)).toEqual([cancelled.id]);
  });

  it('finds open dependents of a task', () => {
    const base = makeTask({ status: 'cancelled' });
    const waiting = makeTask({ dependencies: [base.id] });
    const finished = makeTask({ status: 'done', dependencies: [base.id] });
    const unrelated = makeTask();
    const dependents = openDependents(base.id, taskMap(base, waiting, finished, unrelated));
    expect(dependents.map((t) => t.id)).toEqual([waiting.id]);
  });
});
