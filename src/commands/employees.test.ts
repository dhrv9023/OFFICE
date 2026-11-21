import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EmployeeId } from '@/domain/ids';
import { LIMITS } from '@/domain/rules/validation';
import { USER_ACTOR } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, expectError, unwrap, type Harness } from '@/test/harness';

let h: Harness;

beforeEach(() => {
  h = createHarness();
});
afterEach(() => {
  h.expectConsistent();
});

const rename = (name: string, employeeId: EmployeeId = EMP.sarah) =>
  h.commands.renameEmployee(USER_ACTOR, { employeeId, name });

describe('renameEmployee', () => {
  it('changes only the display name and keeps the ID and everything else', () => {
    const before = h.state().employees[EMP.sarah];
    const renamed = unwrap(rename('Sarah Lee'));

    expect(renamed).toEqual({ ...before, name: 'Sarah Lee' });
    expect(h.state().employees[EMP.sarah]).toEqual(renamed);
    expect(renamed.id).toBe(EMP.sarah);
    expect(renamed.avatarId).toBe(before?.avatarId);
  });

  it('trims leading and trailing whitespace', () => {
    expect(unwrap(rename('   Sarah   Lee  ')).name).toBe('Sarah   Lee');
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '    '],
    ['tabs and newlines only', '\t\n '],
  ])('rejects a %s name and changes nothing', (_label, name) => {
    const before = h.state();
    const error = expectError(rename(name), 'validation');
    expect(error.field).toBe('name');
    expect(error.message).toBe('Name is required.');
    expect(h.state()).toBe(before);
  });

  it('accepts exactly the maximum length and rejects one character more', () => {
    const longest = 'A'.repeat(LIMITS.employeeName);
    expect(unwrap(rename(longest)).name).toBe(longest);
    const error = expectError(rename(`${longest}B`), 'validation');
    expect(error.message).toBe(`Name must be ${String(LIMITS.employeeName)} characters or fewer.`);
  });

  it('rejects line breaks inside a name', () => {
    expect(expectError(rename('Sarah\nLee'), 'validation').message).toBe(
      'Name must be on a single line.',
    );
  });

  it.each(["Zoë O'Brien-Smith", 'José María', '李伟', 'Jean-Luc Picard', 'Dr. Ada K. Lovelace'])(
    'accepts the legitimate name %s',
    (name) => {
      expect(unwrap(rename(name)).name).toBe(name);
    },
  );

  it('rejects an unchanged name (after trimming) without committing', () => {
    const commits = h.commits();
    const error = expectError(rename('  Sarah Chen '), 'conflict');
    expect(error.reason).toBe('no_change');
    expect(h.commits()).toBe(commits);
  });

  it('rejects an unknown employee', () => {
    expectError(rename('Someone', 'emp_ghost'), 'not_found');
  });

  it('records the rename in the activity log', () => {
    unwrap(rename('Sarah Lee'));
    expect(h.state().activity.at(-1)).toMatchObject({
      eventType: 'employee.renamed',
      actorId: 'user',
      description: 'Sarah Chen was renamed to Sarah Lee.',
      employeeId: EMP.sarah,
      projectId: null,
      taskId: null,
    });
  });

  it('leaves earlier activity and notifications exactly as they were written', () => {
    const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design homepage',
        assigneeId: EMP.sarah,
      }),
    );
    const { activity, notifications } = h.state();
    unwrap(rename('Sarah Lee'));

    expect(h.state().activity.slice(0, activity.length)).toEqual(activity);
    expect(h.state().notifications).toEqual(notifications);
    expect(activity.some((event) => event.description.includes('Sarah Chen'))).toBe(true);
  });

  it('keeps task references, so the new name appears on their tasks and new events', () => {
    const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    const task = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design homepage',
        assigneeId: EMP.sarah,
      }),
    );
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }));
    unwrap(rename('Sarah Lee'));

    const state = h.state();
    expect(state.tasks[task.id]?.assigneeId).toBe(EMP.sarah);
    expect(state.employees[EMP.sarah]?.currentTaskId).toBe(task.id);

    const second = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design pricing',
        assigneeId: EMP.sarah,
      }),
    );
    expect(h.state().activity.at(-1)?.description).toBe(
      `Task "${second.title}" was assigned to Sarah Lee.`,
    );
  });
});
