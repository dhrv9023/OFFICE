import { describe, expect, it } from 'vitest';
import { makeTask } from '../../test/factories';
import type { TaskStatus } from '../types/task';
import { calculateProjectProgress } from './projectProgress';

const tasksWith = (...statuses: TaskStatus[]) => statuses.map((status) => makeTask({ status }));

describe('calculateProjectProgress', () => {
  it('is 0% for a project with no tasks (no division by zero)', () => {
    expect(calculateProjectProgress([])).toEqual({
      total: 0,
      done: 0,
      cancelled: 0,
      counted: 0,
      percent: 0,
    });
  });

  it('is 0% when nothing is done', () => {
    expect(calculateProjectProgress(tasksWith('todo', 'in_progress', 'blocked')).percent).toBe(0);
  });

  it('is done ÷ total × 100', () => {
    const progress = calculateProjectProgress(tasksWith('done', 'todo', 'in_review', 'done'));
    expect(progress).toMatchObject({ total: 4, done: 2, counted: 4, percent: 50 });
  });

  it('is 100% when everything is done', () => {
    expect(calculateProjectProgress(tasksWith('done', 'done')).percent).toBe(100);
  });

  it('rounds to a whole number', () => {
    expect(calculateProjectProgress(tasksWith('done', 'todo', 'todo')).percent).toBe(33);
    expect(calculateProjectProgress(tasksWith('done', 'done', 'todo')).percent).toBe(67);
  });

  it('only counts done — in review is not complete', () => {
    expect(calculateProjectProgress(tasksWith('in_review', 'in_review')).percent).toBe(0);
  });

  it('excludes cancelled tasks from both sides of the ratio', () => {
    const progress = calculateProjectProgress(tasksWith('done', 'todo', 'cancelled', 'cancelled'));
    expect(progress).toEqual({ total: 4, done: 1, cancelled: 2, counted: 2, percent: 50 });
  });

  it('reaches 100% when every remaining task is done', () => {
    expect(calculateProjectProgress(tasksWith('done', 'cancelled')).percent).toBe(100);
  });

  it('is 0% (not 100%, not NaN) when every task was cancelled', () => {
    const progress = calculateProjectProgress(tasksWith('cancelled', 'cancelled'));
    expect(progress).toMatchObject({ counted: 0, percent: 0 });
  });
});
