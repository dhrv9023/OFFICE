import { assignmentRejected, type DomainResult } from '../errors';
import { err, ok } from '../result';
import type { Employee } from '../types/employee';
import { isActiveStatus, isTerminalStatus, type Task } from '../types/task';
import { findActiveTask } from './employeeStatus';

export interface AssignmentOptions {
  /**
   * Explicit opt-in for giving a task to someone outside its department
   * (e.g. a QA engineer helping on a frontend task). Off by default.
   */
  readonly allowCrossDepartment?: boolean | undefined;
}

/**
 * Can `employee` take `task`?
 *  - closed tasks cannot be (re)assigned;
 *  - the employee must belong to the task's department unless cross-department
 *    work is explicitly allowed;
 *  - handing over a task that is already active requires the new assignee to be free.
 */
export function checkAssignment(
  task: Task,
  employee: Employee,
  tasks: readonly Task[],
  options: AssignmentOptions = {},
): DomainResult<Employee> {
  if (isTerminalStatus(task.status)) {
    return err(
      assignmentRejected('task_closed', 'A finished or cancelled task cannot be assigned.'),
    );
  }

  if (employee.departmentId !== task.departmentId && options.allowCrossDepartment !== true) {
    return err(
      assignmentRejected(
        'department_mismatch',
        `${employee.name} is not in the department that owns this task.`,
      ),
    );
  }

  if (isActiveStatus(task.status)) {
    const current = findActiveTask(employee.id, tasks);
    if (current && current.id !== task.id) {
      return err(
        assignmentRejected(
          'employee_busy',
          `${employee.name} is already working on "${current.title}".`,
        ),
      );
    }
  }

  return ok(employee);
}

/** Can `task` be left without an assignee? Not while it is active or closed. */
export function checkUnassignment(task: Task): DomainResult<null> {
  if (isTerminalStatus(task.status)) {
    return err(
      assignmentRejected('task_closed', 'A finished or cancelled task cannot be changed.'),
    );
  }
  if (isActiveStatus(task.status)) {
    return err(
      assignmentRejected(
        'assignee_required',
        'A task that is in progress or in review must have an assignee. Move it back to "To do" first.',
      ),
    );
  }
  return ok(null);
}
