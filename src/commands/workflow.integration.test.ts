import { describe, expect, it } from 'vitest';
import { USER_ACTOR } from '@/domain/types';
import { selectEmployeeStatus, selectProjectProgress } from '@/stores/selectors';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, expectError, unwrap } from '@/test/harness';

describe('complete workflow: one design task from creation to done', () => {
  it('keeps project progress, employee status, activity and notifications in step', () => {
    const h = createHarness();
    const { commands } = h;
    const status = () => selectEmployeeStatus(h.state(), EMP.sarah);

    // 1. Create a project.
    const project = unwrap(
      commands.createProject(USER_ACTOR, {
        name: 'Company website',
        category: 'website',
        objectives: ['Launch a marketing site'],
        priority: 'high',
      }),
    );
    expect(selectProjectProgress(h.state(), project.id).percent).toBe(0);
    expect(status()).toBe('idle');
    h.expectConsistent();

    // 2. Create a design task.
    const task = unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design the homepage',
      }),
    );
    expect(task.status).toBe('todo');
    h.expectConsistent();

    // 3. Assign it to Sarah.
    unwrap(commands.assignTask(USER_ACTOR, { taskId: task.id, assigneeId: EMP.sarah }));
    expect(h.state().tasks[task.id]?.assigneeId).toBe(EMP.sarah);
    expect(status()).toBe('idle'); // assigned but not started
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBeNull();
    h.expectConsistent();

    // 4. Move it to in_progress.
    unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }));
    expect(status()).toBe('working');
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBe(task.id);
    expect(selectProjectProgress(h.state(), project.id).percent).toBe(0);
    h.expectConsistent();

    // 5. Move it to in_review.
    unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_review' }));
    expect(status()).toBe('reviewing');
    expect(selectProjectProgress(h.state(), project.id).percent).toBe(0);
    h.expectConsistent();

    // 6. Complete the task.
    const done = unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'done' }));
    expect(done.status).toBe('done');
    h.expectConsistent();

    // 7. Project progress.
    expect(selectProjectProgress(h.state(), project.id)).toEqual({
      total: 1,
      done: 1,
      cancelled: 0,
      counted: 1,
      percent: 100,
    });

    // 8. Employee status.
    expect(status()).toBe('idle');
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBeNull();
    for (const id of [EMP.alex, EMP.ryan, EMP.daniel, EMP.emma]) {
      expect(selectEmployeeStatus(h.state(), id)).toBe('idle');
    }

    // 9. Activity history: one entry per step, in order, all by the user.
    expect(h.state().activity.map((event) => [event.eventType, event.description])).toEqual([
      ['project.created', 'Project "Company website" was created.'],
      ['task.created', 'Task "Design the homepage" was created in "Company website".'],
      ['task.assigned', 'Task "Design the homepage" was assigned to Sarah Chen.'],
      ['task.status_changed', 'Task "Design the homepage" moved from To do to In progress.'],
      ['task.status_changed', 'Task "Design the homepage" moved from In progress to In review.'],
      ['task.status_changed', 'Task "Design the homepage" moved from In review to Done.'],
    ]);
    expect(h.state().activity.every((event) => event.actorId === 'user')).toBe(true);
    expect(h.state().activity.every((event) => event.projectId === project.id)).toBe(true);
    const timestamps = h.state().activity.map((event) => event.timestamp);
    expect([...timestamps].sort()).toEqual(timestamps);
    expect(new Set(h.state().activity.map((event) => event.id)).size).toBe(6);

    // 10. Notifications.
    expect(
      h.state().notifications.map((item) => [item.type, item.title, item.relatedEntityId]),
    ).toEqual([
      ['success', 'Project created', project.id],
      ['info', 'Task assigned', task.id],
      ['info', 'Ready for review', task.id],
      ['success', 'Task completed', task.id],
      ['success', 'All tasks complete', project.id],
    ]);
    expect(h.state().notifications.every((item) => !item.isRead)).toBe(true);
    expect(unwrap(commands.markAllNotificationsRead(USER_ACTOR))).toEqual({ markedCount: 5 });

    // One commit per successful command.
    expect(h.commits()).toBe(7);
  });
});

describe('multi-department workflow with dependencies', () => {
  it('hands work from design to frontend to QA', () => {
    const h = createHarness();
    const { commands } = h;
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Website' }));
    const create = (
      title: string,
      departmentId: (typeof DEPT)[keyof typeof DEPT],
      assigneeId: (typeof EMP)[keyof typeof EMP],
      dependencies: string[] = [],
    ) =>
      unwrap(
        commands.createTask(USER_ACTOR, {
          projectId: project.id,
          departmentId,
          title,
          assigneeId,
          dependencies: dependencies as never,
        }),
      );
    const finish = (taskId: string): void => {
      for (const next of ['in_progress', 'in_review', 'done'] as const) {
        unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: taskId as never, status: next }));
      }
    };

    const design = create('Design', DEPT.design, EMP.sarah);
    const build = create('Build', DEPT.frontend, EMP.ryan, [design.id]);
    const test = create('Test', DEPT.qa, EMP.emma, [build.id]);
    const spike = create('Optional spike', DEPT.backend, EMP.daniel);

    // Nothing downstream can start early.
    expectError(
      commands.changeTaskStatus(USER_ACTOR, { taskId: build.id, status: 'in_progress' }),
      'dependencies_incomplete',
    );
    expectError(
      commands.changeTaskStatus(USER_ACTOR, { taskId: test.id, status: 'in_progress' }),
      'dependencies_incomplete',
    );

    finish(design.id);
    expect(selectProjectProgress(h.state(), project.id).percent).toBe(25);

    unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: build.id, status: 'in_progress' }));
    expect(selectEmployeeStatus(h.state(), EMP.ryan)).toBe('working');
    expect(selectEmployeeStatus(h.state(), EMP.emma)).toBe('idle');

    // The spike is called off: progress is now measured over three tasks.
    unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: spike.id, status: 'cancelled' }));
    expect(selectProjectProgress(h.state(), project.id)).toMatchObject({ counted: 3, percent: 33 });

    unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: build.id, status: 'in_review' }));
    unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: build.id, status: 'done' }));
    finish(test.id);

    expect(selectProjectProgress(h.state(), project.id).percent).toBe(100);
    expect(
      h.state().notifications.filter((item) => item.title === 'All tasks complete'),
    ).toHaveLength(1);
    for (const employee of Object.values(h.state().employees)) {
      expect(selectEmployeeStatus(h.state(), employee.id)).toBe('idle');
    }
    h.expectConsistent();
  });
});

describe('invalid workflows', () => {
  it('rejects each illegal step and leaves the workspace exactly as it was', () => {
    const h = createHarness();
    const { commands } = h;
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Website' }));
    const task = unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design the homepage',
      }),
    );
    const checkpoint = h.state();
    const commits = h.commits();

    // Starting work nobody is assigned to.
    expectError(
      commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }),
      'assignment_rejected',
    );
    // Jumping straight to done or review.
    expectError(
      commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'done' }),
      'invalid_transition',
    );
    expectError(
      commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_review' }),
      'invalid_transition',
    );
    // Giving a design task to the backend developer.
    expectError(
      commands.assignTask(USER_ACTOR, { taskId: task.id, assigneeId: EMP.daniel }),
      'assignment_rejected',
    );
    // Referring to things that do not exist.
    expectError(
      commands.assignTask(USER_ACTOR, { taskId: task.id, assigneeId: 'emp_nobody' }),
      'not_found',
    );
    expectError(
      commands.createTask(USER_ACTOR, {
        projectId: 'prj_nowhere',
        departmentId: DEPT.design,
        title: 'Lost',
      }),
      'not_found',
    );
    // Making the task depend on itself.
    expectError(
      commands.updateTask(USER_ACTOR, { taskId: task.id, patch: { dependencies: [task.id] } }),
      'validation',
    );

    expect(h.state()).toBe(checkpoint);
    expect(h.commits()).toBe(commits);
    h.expectConsistent();
  });

  it('does not let a finished task be reworked, reassigned or edited', () => {
    const h = createHarness();
    const { commands } = h;
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Website' }));
    const task = unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design the homepage',
        assigneeId: EMP.sarah,
      }),
    );
    for (const status of ['in_progress', 'in_review', 'done'] as const) {
      unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status }));
    }
    const checkpoint = h.state();

    expectError(
      commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }),
      'invalid_transition',
    );
    expectError(
      commands.assignTask(USER_ACTOR, {
        taskId: task.id,
        assigneeId: EMP.alex,
        allowCrossDepartment: true,
      }),
      'assignment_rejected',
    );
    expectError(
      commands.updateTask(USER_ACTOR, { taskId: task.id, patch: { title: 'Redo' } }),
      'conflict',
    );

    expect(h.state()).toBe(checkpoint);
    expect(selectProjectProgress(h.state(), project.id).percent).toBe(100);
  });
});
