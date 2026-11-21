import { describe, expect, it } from 'vitest';
import { DEPT, EMP, makeEmployee, makeTask } from '../../test/factories';
import { expectError } from '../../test/harness';
import { checkAssignment, checkUnassignment } from './assignment';

const sarah = makeEmployee();
const ryan = makeEmployee({ id: EMP.ryan, name: 'Ryan Miller', departmentId: DEPT.frontend });

describe('checkAssignment', () => {
  it('accepts an employee from the task’s department', () => {
    const task = makeTask({ departmentId: DEPT.design });
    expect(checkAssignment(task, sarah, [task])).toEqual({ ok: true, value: sarah });
  });

  it('rejects an employee from another department', () => {
    const task = makeTask({ departmentId: DEPT.design });
    const error = expectError(checkAssignment(task, ryan, [task]), 'assignment_rejected');
    expect(error.reason).toBe('department_mismatch');
  });

  it('accepts another department only when explicitly allowed', () => {
    const task = makeTask({ departmentId: DEPT.design });
    expect(checkAssignment(task, ryan, [task], { allowCrossDepartment: true }).ok).toBe(true);
    expect(checkAssignment(task, ryan, [task], { allowCrossDepartment: false }).ok).toBe(false);
  });

  it.each(['done', 'cancelled'] as const)('rejects assigning a %s task', (status) => {
    const task = makeTask({ status });
    expect(expectError(checkAssignment(task, sarah, [task]), 'assignment_rejected').reason).toBe(
      'task_closed',
    );
  });

  it('lets a busy employee queue another todo task', () => {
    const active = makeTask({ assigneeId: EMP.sarah, status: 'in_progress' });
    const queued = makeTask();
    expect(checkAssignment(queued, sarah, [active, queued]).ok).toBe(true);
  });

  it('rejects handing an active task to someone who is already busy', () => {
    const sarahsWork = makeTask({ assigneeId: EMP.sarah, status: 'in_progress' });
    const handover = makeTask({ assigneeId: EMP.ryan, status: 'in_review' });
    const error = expectError(
      checkAssignment(handover, sarah, [sarahsWork, handover], { allowCrossDepartment: true }),
      'assignment_rejected',
    );
    expect(error.reason).toBe('employee_busy');
  });

  it('allows handing an active task to someone who is free', () => {
    const handover = makeTask({ assigneeId: EMP.ryan, status: 'in_progress' });
    expect(checkAssignment(handover, sarah, [handover]).ok).toBe(true);
  });
});

describe('checkUnassignment', () => {
  it.each(['todo', 'blocked'] as const)('allows unassigning a %s task', (status) => {
    expect(checkUnassignment(makeTask({ status, assigneeId: EMP.sarah })).ok).toBe(true);
  });

  it.each(['in_progress', 'in_review'] as const)('rejects unassigning a %s task', (status) => {
    const error = expectError(
      checkUnassignment(makeTask({ status, assigneeId: EMP.sarah })),
      'assignment_rejected',
    );
    expect(error.reason).toBe('assignee_required');
  });

  it.each(['done', 'cancelled'] as const)('rejects unassigning a %s task', (status) => {
    const error = expectError(
      checkUnassignment(makeTask({ status, assigneeId: EMP.sarah })),
      'assignment_rejected',
    );
    expect(error.reason).toBe('task_closed');
  });
});
