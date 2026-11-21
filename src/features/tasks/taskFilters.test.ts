import { describe, expect, it } from 'vitest';
import type { Project } from '@/domain/types';
import { DEPT, EMP, makeTask } from '@/test/factories';
import { filterTasks, hasTaskFilters, NO_TASK_FILTERS, readTaskFilters } from './taskFilters';

const TODAY = '2026-12-10';

describe('task filters', () => {
  const a = makeTask({
    title: 'Design homepage',
    departmentId: DEPT.design,
    assigneeId: EMP.sarah,
  });
  const b = makeTask({ title: 'Build API', departmentId: DEPT.backend, assigneeId: null });
  const c = makeTask({
    title: 'Test plan',
    description: 'covers checkout',
    departmentId: DEPT.qa,
    assigneeId: EMP.emma,
    projectId: 'prj_other',
  });
  const projects = {
    [a.projectId]: { name: 'Website' } as Project,
    prj_other: { name: 'Store' } as Project,
  };
  const all = [c, b, a];
  const titles = (list: readonly { title: string }[]) => list.map((task) => task.title);

  it('reads the URL and detects active filters', () => {
    expect(readTaskFilters(new URLSearchParams())).toEqual(NO_TASK_FILTERS);
    expect(hasTaskFilters(readTaskFilters(new URLSearchParams('assignee=unassigned')))).toBe(true);
  });

  it('matches title, description and project name', () => {
    expect(
      titles(filterTasks(all, { ...NO_TASK_FILTERS, query: 'checkout' }, projects, TODAY)),
    ).toEqual(['Test plan']);
    expect(
      titles(filterTasks(all, { ...NO_TASK_FILTERS, query: 'store' }, projects, TODAY)),
    ).toEqual(['Test plan']);
  });

  it('filters by project, department and assignee (including unassigned)', () => {
    const run = (extra: object) =>
      titles(filterTasks(all, { ...NO_TASK_FILTERS, ...extra }, projects, TODAY));
    expect(run({ projectId: 'prj_other' })).toEqual(['Test plan']);
    expect(run({ departmentId: DEPT.backend })).toEqual(['Build API']);
    expect(run({ assignee: 'unassigned' })).toEqual(['Build API']);
    expect(run({ assignee: EMP.sarah })).toEqual(['Design homepage']);
  });

  it('keeps tasks in creation order', () => {
    expect(titles(filterTasks(all, NO_TASK_FILTERS, projects, TODAY))).toEqual(
      titles(
        [a, b, c].sort(
          (x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id),
        ),
      ),
    );
  });
});

describe('status, priority and deadline filters (Phase 1.7)', () => {
  const overdue = makeTask({ title: 'Overdue', deadline: '2026-12-01', priority: 'high' });
  const today = makeTask({ title: 'Due today', deadline: TODAY, status: 'in_review' });
  const soon = makeTask({ title: 'Due soon', deadline: '2026-12-15', status: 'blocked' });
  const later = makeTask({ title: 'Later', deadline: '2027-02-01', priority: 'critical' });
  const doneLate = makeTask({ title: 'Done late', deadline: '2026-11-01', status: 'done' });
  const none = makeTask({ title: 'No date', status: 'cancelled' });
  const all = [overdue, today, soon, later, doneLate, none];
  const pick = (params: string) =>
    filterTasks(all, readTaskFilters(new URLSearchParams(params)), {}, TODAY).map(
      (task) => task.title,
    );

  it('filters by deadline: overdue excludes finished work and today', () => {
    expect(pick('due=overdue')).toEqual(['Overdue']);
    expect(pick('due=week')).toEqual(['Due today', 'Due soon']);
    expect(pick('due=none')).toEqual(['No date']);
  });

  it('filters by status, including all open work', () => {
    expect(pick('status=blocked')).toEqual(['Due soon']);
    expect(pick('status=open')).toEqual(['Overdue', 'Due today', 'Due soon', 'Later']);
  });

  it('filters by priority and composes with other filters', () => {
    expect(pick('priority=critical')).toEqual(['Later']);
    expect(pick('priority=high&due=overdue')).toEqual(['Overdue']);
    expect(pick('priority=high&due=week')).toEqual([]);
  });

  it('ignores malformed values instead of hiding everything', () => {
    expect(readTaskFilters(new URLSearchParams('status=nope&priority=x&due=soonish'))).toEqual(
      NO_TASK_FILTERS,
    );
  });
});
