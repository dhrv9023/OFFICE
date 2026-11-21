import { describe, expect, it } from 'vitest';
import { EMP, makeTask, taskMap } from '../../test/factories';
import { expectError } from '../../test/harness';
import { TASK_STATUSES, type TaskStatus } from '../types/task';
import {
  canTransition,
  checkStatusChange,
  checkTransition,
  TASK_TRANSITIONS,
} from './taskTransitions';

/** Written out independently of the implementation's table. */
const ALLOWED: readonly (readonly [TaskStatus, TaskStatus])[] = [
  ['todo', 'in_progress'],
  ['todo', 'blocked'],
  ['todo', 'cancelled'],
  ['in_progress', 'in_review'],
  ['in_progress', 'blocked'],
  ['in_progress', 'todo'],
  ['in_progress', 'cancelled'],
  ['in_review', 'done'],
  ['in_review', 'in_progress'],
  ['in_review', 'blocked'],
  ['in_review', 'cancelled'],
  ['blocked', 'todo'],
  ['blocked', 'in_progress'],
  ['blocked', 'cancelled'],
];
const isAllowed = (from: TaskStatus, to: TaskStatus): boolean =>
  ALLOWED.some(([a, b]) => a === from && b === to);

const ALL_PAIRS = TASK_STATUSES.flatMap((from) => TASK_STATUSES.map((to) => [from, to] as const));

describe('task transition table', () => {
  it('defines an entry for every status', () => {
    expect(Object.keys(TASK_TRANSITIONS).sort()).toEqual([...TASK_STATUSES].sort());
  });

  it.each(ALLOWED)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(checkTransition(from, to)).toEqual({ ok: true, value: to });
  });

  it.each(ALL_PAIRS.filter(([from, to]) => !isAllowed(from, to)))('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    const error = expectError(checkTransition(from, to), 'invalid_transition');
    expect(error.from).toBe(from);
    expect(error.to).toBe(to);
  });

  it.each(['done', 'cancelled'] as const)('never lets a %s task be reopened', (terminal) => {
    expect(TASK_TRANSITIONS[terminal]).toEqual([]);
    for (const to of TASK_STATUSES) expect(canTransition(terminal, to)).toBe(false);
  });

  it('requires review before done', () => {
    expect(canTransition('in_progress', 'done')).toBe(false);
    expect(canTransition('todo', 'done')).toBe(false);
    expect(canTransition('todo', 'in_review')).toBe(false);
  });

  it('explains a no-op transition differently from an illegal one', () => {
    expect(expectError(checkTransition('todo', 'todo'), 'invalid_transition').message).toMatch(
      /already/,
    );
  });
});

describe('checkStatusChange preconditions', () => {
  it('refuses to start a task nobody is assigned to', () => {
    const task = makeTask();
    const error = expectError(
      checkStatusChange(task, 'in_progress', taskMap(task)),
      'assignment_rejected',
    );
    expect(error.reason).toBe('assignee_required');
  });

  it('lets an unassigned task be blocked or cancelled', () => {
    const task = makeTask();
    expect(checkStatusChange(task, 'blocked', taskMap(task)).ok).toBe(true);
    expect(checkStatusChange(task, 'cancelled', taskMap(task)).ok).toBe(true);
  });

  it('refuses to start a second task for a busy employee', () => {
    const current = makeTask({ assigneeId: EMP.sarah, status: 'in_review' });
    const next = makeTask({ assigneeId: EMP.sarah });
    const error = expectError(
      checkStatusChange(next, 'in_progress', taskMap(current, next)),
      'assignment_rejected',
    );
    expect(error.reason).toBe('employee_busy');
  });

  it("ignores other employees' active tasks", () => {
    const other = makeTask({ assigneeId: EMP.ryan, status: 'in_progress' });
    const mine = makeTask({ assigneeId: EMP.sarah });
    expect(checkStatusChange(mine, 'in_progress', taskMap(other, mine)).ok).toBe(true);
  });

  it('lets a blocked task resume only when the assignee is free', () => {
    const blocked = makeTask({ assigneeId: EMP.sarah, status: 'blocked' });
    expect(checkStatusChange(blocked, 'in_progress', taskMap(blocked)).ok).toBe(true);

    const busyWith = makeTask({ assigneeId: EMP.sarah, status: 'in_progress' });
    expectError(
      checkStatusChange(blocked, 'in_progress', taskMap(blocked, busyWith)),
      'assignment_rejected',
    );
  });

  it('does not treat the task itself as a competing active task', () => {
    const task = makeTask({ assigneeId: EMP.sarah, status: 'in_review' });
    expect(checkStatusChange(task, 'in_progress', taskMap(task)).ok).toBe(true);
    expect(checkStatusChange(task, 'done', taskMap(task)).ok).toBe(true);
  });

  it('refuses to start a task whose dependencies are unfinished', () => {
    const dependency = makeTask({ status: 'in_progress', assigneeId: EMP.ryan });
    const task = makeTask({ assigneeId: EMP.sarah, dependencies: [dependency.id] });
    const error = expectError(
      checkStatusChange(task, 'in_progress', taskMap(dependency, task)),
      'dependencies_incomplete',
    );
    expect(error.blockedBy).toEqual([dependency.id]);
  });

  it('treats a done dependency as resolved', () => {
    const dependency = makeTask({ status: 'done' });
    const task = makeTask({ assigneeId: EMP.sarah, dependencies: [dependency.id] });
    expect(checkStatusChange(task, 'in_progress', taskMap(dependency, task)).ok).toBe(true);
  });

  it('keeps a cancelled dependency blocking and explains the waiver', () => {
    const dependency = makeTask({ status: 'cancelled' });
    const task = makeTask({ assigneeId: EMP.sarah, dependencies: [dependency.id] });
    const error = expectError(
      checkStatusChange(task, 'in_progress', taskMap(dependency, task)),
      'dependencies_incomplete',
    );
    expect(error).toMatchObject({ blockedBy: [dependency.id], cancelled: [dependency.id] });
    expect(error.message).toMatch(/cancelled: remove or replace that dependency/);
  });

  it('checks the table before anything else', () => {
    const task = makeTask({ status: 'done', assigneeId: EMP.sarah });
    expectError(checkStatusChange(task, 'in_progress', taskMap(task)), 'invalid_transition');
  });
});
