import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectId } from '@/domain/ids';
import { USER_ACTOR } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, expectError, unwrap, type Harness } from '@/test/harness';

let h: Harness;
let projectId: ProjectId;

beforeEach(() => {
  h = createHarness();
  projectId = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' })).id;
});
afterEach(() => {
  h.expectConsistent();
});

const design = (title: string, extra: object = {}) =>
  unwrap(
    h.commands.createTask(USER_ACTOR, { projectId, departmentId: DEPT.design, title, ...extra }),
  );

describe('deleteTask', () => {
  it('removes the task and logs it', () => {
    const task = design('Design homepage');
    const result = unwrap(h.commands.deleteTask(USER_ACTOR, { taskId: task.id }));

    expect(result).toEqual({ taskId: task.id, updatedDependentIds: [] });
    expect(h.state().tasks).toEqual({});
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'task.deleted',
      taskId: task.id,
      projectId,
      description: 'Task "Design homepage" was deleted.',
    });
  });

  it('frees the employee who was working on it', () => {
    const task = design('Design homepage', { assigneeId: EMP.sarah });
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }));
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBe(task.id);

    unwrap(h.commands.deleteTask(USER_ACTOR, { taskId: task.id }));
    expect(h.state().employees[EMP.sarah]?.currentTaskId).toBeNull();
  });

  it('removes the task from the dependencies of other tasks', () => {
    const a = design('A');
    const b = design('B', { dependencies: [a.id] });
    const c = design('C', { dependencies: [a.id, b.id] });
    const unrelated = design('Unrelated');

    const result = unwrap(h.commands.deleteTask(USER_ACTOR, { taskId: a.id }));

    expect(result.updatedDependentIds).toEqual([b.id, c.id]);
    expect(h.state().tasks[b.id]?.dependencies).toEqual([]);
    expect(h.state().tasks[c.id]?.dependencies).toEqual([b.id]);
    // Untouched tasks keep their identity.
    expect(h.state().tasks[unrelated.id]).toBe(unrelated);
  });

  it('detaches notifications that pointed at the task but keeps them', () => {
    const task = design('Design homepage', { assigneeId: EMP.sarah });
    const about = (): unknown[] =>
      h.state().notifications.filter((item) => item.relatedEntityId === task.id);
    expect(about()).toHaveLength(1);
    const total = h.state().notifications.length;

    unwrap(h.commands.deleteTask(USER_ACTOR, { taskId: task.id }));

    expect(about()).toHaveLength(0);
    expect(h.state().notifications).toHaveLength(total);
  });

  it('keeps earlier activity history about the deleted task', () => {
    const task = design('Design homepage');
    unwrap(h.commands.deleteTask(USER_ACTOR, { taskId: task.id }));
    expect(h.state().activity.filter((event) => event.taskId === task.id)).toHaveLength(2);
  });

  it('can delete closed tasks and tasks in archived projects', () => {
    const done = design('Old work');
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: done.id, status: 'cancelled' }));
    unwrap(h.commands.updateProject(USER_ACTOR, { projectId, patch: { status: 'archived' } }));
    unwrap(h.commands.deleteTask(USER_ACTOR, { taskId: done.id }));
    expect(h.state().tasks).toEqual({});
  });

  it('rejects an unknown task and a second delete', () => {
    const task = design('Design homepage');
    expectError(h.commands.deleteTask(USER_ACTOR, { taskId: 'task_missing' }), 'not_found');
    unwrap(h.commands.deleteTask(USER_ACTOR, { taskId: task.id }));
    expectError(h.commands.deleteTask(USER_ACTOR, { taskId: task.id }), 'not_found');
  });
});

describe('deleteProject', () => {
  it('removes the project with all of its tasks, and nothing else', () => {
    const other = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Other' }));
    const kept = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: other.id,
        departmentId: DEPT.qa,
        title: 'Keep me',
      }),
    );
    const a = design('A');
    const b = design('B', { dependencies: [a.id] });

    const result = unwrap(h.commands.deleteProject(USER_ACTOR, { projectId }));

    expect(result).toEqual({ projectId, deletedTaskIds: [a.id, b.id] });
    expect(Object.keys(h.state().projects)).toEqual([other.id]);
    expect(Object.keys(h.state().tasks)).toEqual([kept.id]);
  });

  it('frees every employee who was working in the project', () => {
    const sarahs = design('Design', { assigneeId: EMP.sarah });
    const ryans = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId,
        departmentId: DEPT.frontend,
        title: 'Build',
        assigneeId: EMP.ryan,
      }),
    );
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: sarahs.id, status: 'in_progress' }));
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: ryans.id, status: 'in_progress' }));

    unwrap(h.commands.deleteProject(USER_ACTOR, { projectId }));

    for (const employee of Object.values(h.state().employees)) {
      expect(employee.currentTaskId).toBeNull();
    }
  });

  it('logs the deletion, notifies, and detaches older notifications', () => {
    design('A', { assigneeId: EMP.sarah });
    unwrap(h.commands.deleteProject(USER_ACTOR, { projectId }));

    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'project.deleted',
      projectId,
      description: 'Project "Website" was deleted along with 1 task.',
    });
    expect(h.state().notifications.at(-1)).toMatchObject({
      type: 'warning',
      title: 'Project deleted',
      relatedEntityId: null,
    });
    expect(h.state().notifications.every((item) => item.relatedEntityId === null)).toBe(true);
    // History survives.
    expect(h.state().activity.some((event) => event.eventType === 'project.created')).toBe(true);
  });

  it('deletes an empty project', () => {
    unwrap(h.commands.deleteProject(USER_ACTOR, { projectId }));
    expect(h.state().projects).toEqual({});
    expect(h.state().activity.at(-1)?.description).toBe('Project "Website" was deleted.');
  });

  it('rejects an unknown project', () => {
    const before = h.state();
    expectError(h.commands.deleteProject(USER_ACTOR, { projectId: 'prj_missing' }), 'not_found');
    expect(h.state()).toBe(before);
  });
});
