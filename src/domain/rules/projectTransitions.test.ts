import { describe, expect, it } from 'vitest';
import { makeTask } from '../../test/factories';
import { expectError } from '../../test/harness';
import { PROJECT_STATUSES, type Project, type ProjectStatus } from '../types/project';
import {
  canChangeProjectStatus,
  checkProjectState,
  checkProjectStatusChange,
} from './projectTransitions';

/** Written out independently of the implementation's table. */
const ALLOWED: readonly (readonly [ProjectStatus, ProjectStatus])[] = [
  ['planning', 'active'],
  ['planning', 'on_hold'],
  ['planning', 'archived'],
  ['active', 'on_hold'],
  ['active', 'completed'],
  ['active', 'archived'],
  ['on_hold', 'active'],
  ['on_hold', 'planning'],
  ['on_hold', 'archived'],
  ['completed', 'active'],
  ['completed', 'archived'],
  ['archived', 'planning'],
  ['archived', 'active'],
];

const project = (status: ProjectStatus): Project => ({
  id: 'prj_test',
  name: 'Website',
  description: '',
  category: 'website',
  objectives: [],
  requirements: [],
  priority: 'medium',
  status,
  deadline: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('project transitions', () => {
  const pairs = PROJECT_STATUSES.flatMap((from) =>
    PROJECT_STATUSES.map((to) => [from, to] as const),
  );

  it.each(pairs)('%s → %s matches the independent list', (from, to) => {
    const expected = ALLOWED.some(([a, b]) => a === from && b === to);
    expect(canChangeProjectStatus(from, to)).toBe(expected);
  });

  it('rejects skipping straight from planning to completed', () => {
    const error = expectError(
      checkProjectStatusChange(project('planning'), 'completed', []),
      'invalid_project_transition',
    );
    expect(error.message).toBe('A project cannot move from "Planning" to "Completed".');
  });

  it('only completes a project whose tasks are all done or cancelled', () => {
    const open = makeTask({ status: 'in_review' });
    const error = expectError(
      checkProjectStatusChange(project('active'), 'completed', [
        makeTask({ status: 'done' }),
        open,
      ]),
      'conflict',
    );
    expect(error).toMatchObject({ reason: 'project_open_tasks' });
    expect(error.message).toMatch(/still has 1 open task/);

    const closed = [makeTask({ status: 'done' }), makeTask({ status: 'cancelled' })];
    expect(checkProjectStatusChange(project('active'), 'completed', closed).ok).toBe(true);
  });
});

describe('project state at rest (checkProjectState)', () => {
  it('rejects a completed project that still has open tasks', () => {
    const error = expectError(
      checkProjectState(project('completed'), [makeTask({ status: 'done' }), makeTask()]),
      'conflict',
    );
    expect(error).toMatchObject({ reason: 'project_open_tasks' });
    expect(error.message).toBe('Project "Website" is marked completed but still has 1 open task.');
  });

  it.each([
    ['completed with only closed tasks', 'completed', ['done', 'cancelled']],
    ['completed with no tasks', 'completed', []],
    ['archived with open work', 'archived', ['in_progress', 'todo']],
    ['planning with finished work', 'planning', ['done']],
    ['on hold with blocked work', 'on_hold', ['blocked']],
  ] as const)('accepts %s', (_label, status, taskStatuses) => {
    const tasks = taskStatuses.map((taskStatus) => makeTask({ status: taskStatus }));
    expect(checkProjectState(project(status), tasks).ok).toBe(true);
  });
});
