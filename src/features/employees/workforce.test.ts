import { describe, expect, it } from 'vitest';
import { createSeedWorkspace } from '@/domain/seed';
import type { WorkspaceState } from '@/domain/types';
import { EMP, makeTask, taskMap } from '@/test/factories';
import { focusOf, statusBreakdown, workloadOf } from './workforce';

function withTasks(...tasks: ReturnType<typeof makeTask>[]): WorkspaceState {
  return { ...createSeedWorkspace(), tasks: taskMap(...tasks) };
}

describe('workloadOf', () => {
  it('lists assigned tasks active-first, ignoring cancelled work and other people', () => {
    const tasks = [
      makeTask({ assigneeId: EMP.ryan, status: 'done' }),
      makeTask({ assigneeId: EMP.ryan, status: 'todo' }),
      makeTask({ assigneeId: EMP.ryan, status: 'in_progress' }),
      makeTask({ assigneeId: EMP.ryan, status: 'cancelled' }),
      makeTask({ assigneeId: EMP.sarah, status: 'blocked' }),
    ];
    expect(workloadOf(tasks, EMP.ryan)).toEqual({
      segments: ['in_progress', 'todo', 'done'],
      open: 2,
      done: 1,
    });
    expect(workloadOf(tasks, EMP.alex)).toEqual({ segments: [], open: 0, done: 0 });
  });
});

describe('focusOf', () => {
  it('shows the current task while working or in review', () => {
    const active = makeTask({ assigneeId: EMP.ryan, status: 'in_progress', title: 'Build' });
    const state = withTasks(active);
    const ryan = state.employees[EMP.ryan];
    if (!ryan) throw new Error('seed changed');
    const withCurrent = {
      ...state,
      employees: { ...state.employees, [EMP.ryan]: { ...ryan, currentTaskId: active.id } },
    };
    expect(focusOf(withCurrent, EMP.ryan, 'working')).toMatchObject({
      kind: 'working',
      task: { title: 'Build' },
    });
  });

  it('names the most urgent blocked task, then the most urgent to-do', () => {
    const state = withTasks(
      makeTask({ assigneeId: EMP.emma, status: 'blocked', priority: 'low', title: 'Low' }),
      makeTask({ assigneeId: EMP.emma, status: 'blocked', priority: 'critical', title: 'Urgent' }),
      makeTask({ assigneeId: EMP.alex, status: 'todo', priority: 'medium', title: 'Later' }),
      makeTask({ assigneeId: EMP.alex, status: 'todo', priority: 'high', title: 'Sooner' }),
    );
    expect(focusOf(state, EMP.emma, 'blocked').task?.title).toBe('Urgent');
    expect(focusOf(state, EMP.alex, 'idle')).toMatchObject({
      kind: 'next',
      task: { title: 'Sooner' },
    });
  });

  it('says so when there is nothing to show', () => {
    expect(focusOf(withTasks(), EMP.daniel, 'idle')).toEqual({
      kind: 'none',
      task: null,
      project: null,
    });
  });
});

describe('statusBreakdown', () => {
  it('counts every status in a fixed order', () => {
    expect(statusBreakdown(['idle', 'working', 'working', 'blocked'])).toEqual([
      { status: 'working', count: 2 },
      { status: 'reviewing', count: 0 },
      { status: 'blocked', count: 1 },
      { status: 'idle', count: 1 },
    ]);
  });
});
