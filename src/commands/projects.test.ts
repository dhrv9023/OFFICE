import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { USER_ACTOR, type Project, type ProjectStatus } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, expectError, unwrap, type Harness } from '@/test/harness';

let h: Harness;
beforeEach(() => {
  h = createHarness();
});
afterEach(() => {
  h.expectConsistent();
});

describe('createProject', () => {
  it('creates a planning project with defaults', () => {
    const project = unwrap(h.commands.createProject(USER_ACTOR, { name: '  Company website  ' }));

    expect(project).toEqual({
      id: 'prj_0001',
      name: 'Company website',
      description: '',
      category: 'other',
      objectives: [],
      requirements: [],
      priority: 'medium',
      status: 'planning',
      deadline: null,
      createdAt: '2026-02-01T09:00:00.000Z',
      updatedAt: '2026-02-01T09:00:00.000Z',
    });
    expect(h.state().projects[project.id]).toEqual(project);
  });

  it('stores every provided field, normalised', () => {
    const project = unwrap(
      h.commands.createProject(USER_ACTOR, {
        name: 'Mobile app',
        description: ' Booking app ',
        category: 'mobile_app',
        objectives: [' Ship MVP '],
        requirements: ['Offline mode'],
        priority: 'high',
        deadline: '2026-09-30',
      }),
    );
    expect(project).toMatchObject({
      description: 'Booking app',
      category: 'mobile_app',
      objectives: ['Ship MVP'],
      requirements: ['Offline mode'],
      priority: 'high',
      deadline: '2026-09-30',
    });
  });

  it('records one activity event and one notification', () => {
    const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));

    expect(h.state().activity).toEqual([
      {
        id: 'evt_0001',
        actorId: 'user',
        eventType: 'project.created',
        description: 'Project "Website" was created.',
        projectId: project.id,
        taskId: null,
        employeeId: null,
        meetingId: null,
        timestamp: project.createdAt,
      },
    ]);
    expect(h.state().notifications).toEqual([
      expect.objectContaining({
        type: 'success',
        title: 'Project created',
        relatedEntityId: project.id,
        isRead: false,
      }),
    ]);
  });

  it.each([
    ['a blank name', { name: '   ' }, 'name'],
    ['an over-long name', { name: 'x'.repeat(101) }, 'name'],
    ['an unknown category', { name: 'A', category: 'game' }, 'category'],
    ['an unknown priority', { name: 'A', priority: 'urgent' }, 'priority'],
    ['an impossible deadline', { name: 'A', deadline: '2026-02-30' }, 'deadline'],
    ['a blank objective', { name: 'A', objectives: [''] }, 'objectives'],
  ])('rejects %s and changes nothing', (_label, input, field) => {
    const before = h.state();
    // Deliberately bypass the compile-time types: agents and imports can send anything.
    const result = h.commands.createProject(USER_ACTOR, input as never);
    expect(expectError(result, 'validation').field).toBe(field);
    expect(h.state()).toBe(before);
    expect(h.commits()).toBe(0);
  });

  it('rejects a missing name', () => {
    expectError(h.commands.createProject(USER_ACTOR, {} as never), 'validation');
  });

  it('cannot be used to inject fields such as id or status', () => {
    const sneaky = { name: 'A', id: 'prj_evil', status: 'completed', createdAt: 'x' };
    const project = unwrap(h.commands.createProject(USER_ACTOR, sneaky as never));
    expect(project.id).toBe('prj_0001');
    expect(project.status).toBe('planning');
  });
});

describe('updateProject', () => {
  it('changes only the patched fields and bumps updatedAt', () => {
    const created = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    const updated = unwrap(
      h.commands.updateProject(USER_ACTOR, {
        projectId: created.id,
        patch: { name: 'Website v2', priority: 'critical' },
      }),
    );

    expect(updated).toEqual({
      ...created,
      name: 'Website v2',
      priority: 'critical',
      updatedAt: '2026-02-01T09:01:00.000Z',
    });
    expect(h.state().projects[created.id]).toEqual(updated);
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'project.updated',
      description: 'Project "Website v2" was updated (name, priority).',
    });
    // Detail edits are not noteworthy enough for a notification.
    expect(h.state().notifications).toHaveLength(1);
  });

  it('logs and notifies a status change', () => {
    const created = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    unwrap(
      h.commands.updateProject(USER_ACTOR, { projectId: created.id, patch: { status: 'on_hold' } }),
    );

    expect(h.state().projects[created.id]?.status).toBe('on_hold');
    expect(h.state().activity.at(-1)).toMatchObject({ eventType: 'project.status_changed' });
    expect(h.state().notifications.at(-1)).toMatchObject({
      type: 'warning',
      message: '"Website" was put on hold.',
    });
  });

  it('records two events when details and status change together', () => {
    const created = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    unwrap(
      h.commands.updateProject(USER_ACTOR, {
        projectId: created.id,
        patch: { description: 'New', status: 'active' },
      }),
    );
    expect(
      h
        .state()
        .activity.slice(-2)
        .map((event) => event.eventType),
    ).toEqual(['project.updated', 'project.status_changed']);
  });

  it('rejects an unknown project', () => {
    const error = expectError(
      h.commands.updateProject(USER_ACTOR, { projectId: 'prj_missing', patch: { name: 'X' } }),
      'not_found',
    );
    expect(error).toMatchObject({ entity: 'project', id: 'prj_missing' });
  });

  it('rejects invalid values without changing state', () => {
    const created = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    const before = h.state();
    expectError(
      h.commands.updateProject(USER_ACTOR, { projectId: created.id, patch: { name: ' ' } }),
      'validation',
    );
    expectError(
      h.commands.updateProject(USER_ACTOR, {
        projectId: created.id,
        patch: { status: 'paused' as never },
      }),
      'validation',
    );
    expect(h.state()).toBe(before);
  });

  it.each([
    ['an empty patch', {}],
    ['identical values', { name: 'Website', objectives: [] as string[] }],
  ])('rejects %s as no change', (_label, patch) => {
    const created = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    const before = h.state();
    const error = expectError(
      h.commands.updateProject(USER_ACTOR, { projectId: created.id, patch }),
      'conflict',
    );
    expect(error.reason).toBe('no_change');
    expect(h.state()).toBe(before);
  });
});

describe('project lifecycle', () => {
  const setStatus = (projectId: Project['id'], status: ProjectStatus) =>
    h.commands.updateProject(USER_ACTOR, { projectId, patch: { status } });

  it('activates a planning project, logging and notifying it', () => {
    const created = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Portal' }));
    expect(created.status).toBe('planning');
    const active = unwrap(setStatus(created.id, 'active'));
    expect(active.status).toBe('active');
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'project.status_changed',
      description: 'Project "Portal" is now active.',
    });
    expect(h.state().notifications.at(-1)).toMatchObject({ message: '"Portal" is now active.' });
  });

  it('rejects transitions outside the lifecycle and changes nothing', () => {
    const created = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Portal' }));
    const before = h.state();
    expectError(setStatus(created.id, 'completed'), 'invalid_project_transition');
    expect(h.state()).toBe(before);
  });

  it('completes only when every task is closed, and never automatically', () => {
    const created = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Portal' }));
    unwrap(setStatus(created.id, 'active'));
    const task = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: created.id,
        departmentId: DEPT.design,
        title: 'Design',
        assigneeId: EMP.sarah,
      }),
    );
    expectError(setStatus(created.id, 'completed'), 'conflict');

    for (const status of ['in_progress', 'in_review', 'done'] as const) {
      unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status }));
    }
    expect(h.state().projects[created.id]?.status).toBe('active');
    expect(unwrap(setStatus(created.id, 'completed')).status).toBe('completed');
  });

  it('takes no new tasks once completed, until reopened', () => {
    const created = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Portal' }));
    unwrap(setStatus(created.id, 'active'));
    unwrap(setStatus(created.id, 'completed'));
    const input = { projectId: created.id, departmentId: DEPT.qa, title: 'Late fix' };
    const error = expectError(h.commands.createTask(USER_ACTOR, input), 'conflict');
    expect(error).toMatchObject({ reason: 'project_completed' });

    unwrap(setStatus(created.id, 'active'));
    expect(h.commands.createTask(USER_ACTOR, input).ok).toBe(true);
  });

  it('restores an archived project', () => {
    const created = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Portal' }));
    unwrap(setStatus(created.id, 'archived'));
    expectError(setStatus(created.id, 'completed'), 'invalid_project_transition');
    expect(unwrap(setStatus(created.id, 'planning')).status).toBe('planning');
  });

  it('keeps an archived project read-only until it is restored', () => {
    const created = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Portal' }));
    unwrap(setStatus(created.id, 'archived'));
    const error = expectError(
      h.commands.updateProject(USER_ACTOR, { projectId: created.id, patch: { name: 'Renamed' } }),
      'conflict',
    );
    expect(error).toMatchObject({ reason: 'project_archived' });
    unwrap(setStatus(created.id, 'planning'));
    expect(
      unwrap(
        h.commands.updateProject(USER_ACTOR, { projectId: created.id, patch: { name: 'Renamed' } }),
      ).name,
    ).toBe('Renamed');
  });
});
