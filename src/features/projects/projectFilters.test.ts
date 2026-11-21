import { describe, expect, it } from 'vitest';
import { calculateProjectProgress } from '@/domain/rules/projectProgress';
import type { Priority, Project, ProjectStatus } from '@/domain/types';
import type { ProjectSummary } from '@/stores/selectors';
import { makeTask } from '@/test/factories';
import { filterProjects, hasProjectFilters, readProjectFilters } from './projectFilters';

function summary(
  name: string,
  extra: Partial<Project> & { done?: number; open?: number } = {},
): ProjectSummary {
  const { done = 0, open = 0, ...fields } = extra;
  const project: Project = {
    id: `prj_${name.toLowerCase().replace(/\W+/g, '_')}`,
    name,
    description: '',
    category: 'web_app',
    objectives: [],
    requirements: [],
    priority: 'medium',
    status: 'planning',
    deadline: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...fields,
  };
  const tasks = [
    ...Array.from({ length: done }, () => makeTask({ status: 'done' })),
    ...Array.from({ length: open }, () => makeTask()),
  ];
  return { project, progress: calculateProjectProgress(tasks), assignees: [], departments: [] };
}

const filters = (extra: Partial<ReturnType<typeof readProjectFilters>> = {}) => ({
  ...readProjectFilters(new URLSearchParams()),
  ...extra,
});

const names = (list: ProjectSummary[]) => list.map((item) => item.project.name);

describe('project filters', () => {
  const all = [
    summary('Website', {
      status: 'active' as ProjectStatus,
      priority: 'high' as Priority,
      description: 'Marketing site',
      deadline: '2026-06-01',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-05T00:00:00.000Z',
      done: 1,
      open: 1,
    }),
    summary('API', {
      priority: 'critical',
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-01-04T00:00:00.000Z',
      done: 3,
    }),
    summary('Archive me', {
      status: 'archived',
      priority: 'low',
      deadline: '2026-03-01',
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
  ];

  it('reads defaults and ignores an unknown sort', () => {
    expect(readProjectFilters(new URLSearchParams('sort=sideways'))).toEqual({
      query: '',
      status: 'all',
      priority: 'all',
      sort: 'updated',
    });
    expect(hasProjectFilters(filters())).toBe(false);
    expect(hasProjectFilters(filters({ query: ' x ' }))).toBe(true);
  });

  it('searches names and descriptions, case-insensitively', () => {
    expect(names(filterProjects(all, filters({ query: 'MARKETING' })))).toEqual(['Website']);
    expect(names(filterProjects(all, filters({ query: 'api' })))).toEqual(['API']);
  });

  it('filters by status and priority', () => {
    expect(names(filterProjects(all, filters({ status: 'archived' })))).toEqual(['Archive me']);
    expect(names(filterProjects(all, filters({ priority: 'critical' })))).toEqual(['API']);
    expect(filterProjects(all, filters({ status: 'active', priority: 'low' }))).toEqual([]);
  });

  it.each([
    ['updated', ['Website', 'API', 'Archive me']],
    ['created', ['API', 'Website', 'Archive me']],
    ['name', ['API', 'Archive me', 'Website']],
    ['deadline', ['Archive me', 'Website', 'API']],
    ['progress', ['API', 'Website', 'Archive me']],
    ['priority', ['API', 'Website', 'Archive me']],
  ] as const)('sorts by %s', (sort, expected) => {
    expect(names(filterProjects(all, filters({ sort })))).toEqual(expected);
  });
});
