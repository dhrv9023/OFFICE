import type { DepartmentId, DeskId, EmployeeId, TaskId } from '../ids';

export interface Employee {
  readonly id: EmployeeId;
  readonly name: string;
  /** Job title, e.g. "Frontend Developer". */
  readonly role: string;
  readonly departmentId: DepartmentId;
  /** What this person does in the company. */
  readonly description: string;
  readonly skills: readonly string[];
  /**
   * The employee's single active task (in progress or in review), or null.
   * Never set by hand: it is recomputed from task state by `syncCurrentTasks`
   * on every command that touches tasks.
   */
  readonly currentTaskId: TaskId | null;
  /** The employee's desk in the office layout. */
  readonly deskId: DeskId;
  /** Key of the avatar art for this employee (resolved by the rendering layer). */
  readonly avatarId: string;
  readonly createdAt: string;
}

/**
 * What an employee is doing, derived purely from their assigned tasks.
 *
 * This is deliberately separate from *presence* (at desk, in a meeting, on a break),
 * which cannot be derived from tasks. Presence is not modelled in Phase 1.1; when it
 * arrives it will be its own explicit state alongside this one, never a replacement.
 */
export const EMPLOYEE_WORK_STATUSES = ['idle', 'working', 'reviewing', 'blocked'] as const;
export type EmployeeWorkStatus = (typeof EMPLOYEE_WORK_STATUSES)[number];
