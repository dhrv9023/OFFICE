import type { TaskId } from '@/domain/ids';
import type { Employee, Task, WorkspaceState } from '@/domain/types';

/** Stable IDs of the seed company, for readable tests. */
export const EMP = {
  alex: 'emp_alex_morgan',
  sarah: 'emp_sarah_chen',
  ryan: 'emp_ryan_miller',
  daniel: 'emp_daniel_kim',
  emma: 'emp_emma_wilson',
} as const;

export const DEPT = {
  management: 'dept_management',
  design: 'dept_design',
  frontend: 'dept_frontend',
  backend: 'dept_backend',
  qa: 'dept_qa',
} as const;

let taskCounter = 0;

/** A valid task with sensible defaults; override what the test cares about. */
export function makeTask(overrides: Partial<Task> = {}): Task {
  taskCounter += 1;
  const stamp = `2026-02-01T00:${String(taskCounter % 60).padStart(2, '0')}:00.000Z`;
  return {
    id: `task_f${taskCounter}`,
    projectId: 'prj_1',
    departmentId: DEPT.design,
    assigneeId: null,
    title: `Task ${taskCounter}`,
    description: '',
    priority: 'medium',
    status: 'todo',
    dependencies: [],
    deadline: null,
    blockedReason: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: EMP.sarah,
    name: 'Sarah Chen',
    role: 'UI/UX Designer',
    departmentId: DEPT.design,
    description: '',
    skills: [],
    currentTaskId: null,
    deskId: 'desk_design_1',
    avatarId: 'avatar_sarah_chen',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function taskMap(...tasks: Task[]): WorkspaceState['tasks'] {
  const map: Record<TaskId, Task> = {};
  for (const task of tasks) map[task.id] = task;
  return map;
}
