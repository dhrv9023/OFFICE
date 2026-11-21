import type { EmployeeId, TaskId } from '../ids';
import type { Employee, EmployeeWorkStatus } from '../types/employee';
import { isActiveStatus, type Task } from '../types/task';
import type { WorkspaceState } from '../types/workspace';

/**
 * Rule: an employee has AT MOST ONE active task (in progress or in review).
 * They may hold any number of queued (`todo`) and `blocked` tasks alongside it.
 *
 * If corrupted data ever contains two active tasks for one person, pick one
 * deterministically (in progress before in review, then oldest, then lowest ID)
 * so derived values stay stable; `validateWorkspace` reports the violation.
 */
function preferActive(a: Task, b: Task): Task {
  if (a.status !== b.status) return a.status === 'in_progress' ? a : b;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? a : b;
  return a.id < b.id ? a : b;
}

/** The task the employee is occupied with right now, if any. */
export function findActiveTask(employeeId: EmployeeId, tasks: readonly Task[]): Task | null {
  let active: Task | null = null;
  for (const task of tasks) {
    if (task.assigneeId !== employeeId || !isActiveStatus(task.status)) continue;
    active = active ? preferActive(active, task) : task;
  }
  return active;
}

/**
 * Work status derived from assigned tasks:
 *  - active task in progress        → working
 *  - active task in review          → reviewing
 *  - no active task, ≥1 blocked     → blocked  (stuck with nothing else under way)
 *  - otherwise                      → idle     (includes "only queued todo tasks")
 */
export function deriveEmployeeStatus(
  employeeId: EmployeeId,
  tasks: readonly Task[],
): EmployeeWorkStatus {
  const active = findActiveTask(employeeId, tasks);
  if (active) return active.status === 'in_progress' ? 'working' : 'reviewing';

  const hasBlocked = tasks.some(
    (task) => task.assigneeId === employeeId && task.status === 'blocked',
  );
  return hasBlocked ? 'blocked' : 'idle';
}

/**
 * Recomputes every employee's `currentTaskId` from the tasks. This is the ONLY place
 * that field is written, so it can never drift from task state. Employees whose
 * pointer is already right keep their object identity.
 */
export function syncCurrentTasks(
  employees: WorkspaceState['employees'],
  tasks: WorkspaceState['tasks'],
): WorkspaceState['employees'] {
  const taskList = Object.values(tasks);
  let changed = false;
  const next: Record<EmployeeId, Employee> = {};

  for (const employee of Object.values(employees)) {
    const currentTaskId: TaskId | null = findActiveTask(employee.id, taskList)?.id ?? null;
    if (currentTaskId === employee.currentTaskId) {
      next[employee.id] = employee;
    } else {
      next[employee.id] = { ...employee, currentTaskId };
      changed = true;
    }
  }

  return changed ? next : employees;
}
