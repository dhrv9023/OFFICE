import { describe, expect, it } from 'vitest';
import { DEPT, EMP, makeTask } from '../../test/factories';
import type { DomainError } from '../errors';
import { defaultAccessProfile } from './access';
import { defaultAgentConfig } from './agentConfig';
import { OFFICE_LAYOUT, SEED_DEPARTMENTS, SEED_EMPLOYEES } from '../seed';
import type { Employee } from '../types/employee';
import type { Meeting } from '../types/meeting';
import type { Notification } from '../types/notification';
import type { Project } from '../types/project';
import type { Task } from '../types/task';
import {
  buildWorkspace,
  findDuplicateIds,
  validateWorkspace,
  type WorkspaceRecords,
} from './workspaceIntegrity';

const project: Project = {
  id: 'prj_1',
  name: 'Website',
  description: '',
  category: 'website',
  objectives: [],
  requirements: [],
  priority: 'medium',
  status: 'active',
  deadline: null,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

function records(overrides: Partial<WorkspaceRecords> = {}): WorkspaceRecords {
  return {
    departments: SEED_DEPARTMENTS,
    employees: SEED_EMPLOYEES,
    projects: [project],
    tasks: [],
    meetings: [],
    activity: [],
    notifications: [],
    accessProfiles: SEED_EMPLOYEES.map((employee) =>
      defaultAccessProfile(employee, '2026-01-01T00:00:00.000Z'),
    ),
    approvals: [],
    executions: [],
    agentConfigs: SEED_EMPLOYEES.map((employee) =>
      defaultAgentConfig(employee, '2026-01-01T00:00:00.000Z'),
    ),
    messages: [],
    ...overrides,
  };
}

/** Builds and returns the errors (empty array when the workspace is valid). */
function errorsOf(overrides: Partial<WorkspaceRecords>): DomainError[] {
  const result = buildWorkspace(records(overrides), OFFICE_LAYOUT);
  return result.ok ? [] : result.error;
}

const withEmployee = (patch: Partial<Employee>): Employee[] =>
  SEED_EMPLOYEES.map((employee) =>
    employee.id === EMP.sarah ? { ...employee, ...patch } : employee,
  );

describe('findDuplicateIds', () => {
  it('reports each repeated ID once', () => {
    expect(findDuplicateIds([{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'a' }])).toEqual(['a']);
    expect(findDuplicateIds([{ id: 'a' }, { id: 'b' }])).toEqual([]);
  });
});

describe('buildWorkspace', () => {
  it('accepts consistent records and indexes them by ID', () => {
    const task = makeTask({ assigneeId: EMP.sarah });
    const result = buildWorkspace(records({ tasks: [task] }), OFFICE_LAYOUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tasks[task.id]).toBe(task);
      expect(Object.keys(result.value.employees)).toHaveLength(5);
    }
  });

  it.each([
    ['employee', { employees: [...SEED_EMPLOYEES, ...SEED_EMPLOYEES.slice(0, 1)] }],
    ['department', { departments: [...SEED_DEPARTMENTS, ...SEED_DEPARTMENTS.slice(0, 1)] }],
    ['project', { projects: [project, project] }],
    ['task', { tasks: [makeTask({ id: 'task_dup' }), makeTask({ id: 'task_dup' })] }],
  ] as const)('rejects a duplicate %s ID', (entity, overrides) => {
    expect(errorsOf(overrides)).toEqual([
      expect.objectContaining({ code: 'duplicate_id', entity }),
    ]);
  });

  it('rejects an employee in a department that does not exist', () => {
    expect(errorsOf({ employees: withEmployee({ departmentId: 'dept_ghost' }) })).toContainEqual(
      expect.objectContaining({
        code: 'invalid_reference',
        entity: 'department',
        id: 'dept_ghost',
      }),
    );
  });

  it('rejects an employee at a desk that does not exist', () => {
    expect(errorsOf({ employees: withEmployee({ deskId: 'desk_ghost' }) })).toContainEqual(
      expect.objectContaining({ code: 'invalid_reference', entity: 'desk' }),
    );
  });

  it("rejects an employee whose desk is in another department's room", () => {
    const errors = errorsOf({ employees: withEmployee({ deskId: 'desk_qa_1' }) });
    expect(errors).toContainEqual(
      expect.objectContaining({ code: 'invalid_reference', entity: 'desk' }),
    );
    // …and it is now shared with Emma.
    expect(errors).toContainEqual(expect.objectContaining({ field: 'employee.deskId' }));
  });

  it('rejects a department whose room does not exist or belongs to another department', () => {
    const [first, ...rest] = SEED_DEPARTMENTS;
    if (!first) throw new Error('seed has no departments');
    for (const roomId of ['room_ghost', 'room_qa'] as const) {
      expect(errorsOf({ departments: [{ ...first, roomId }, ...rest] })).toContainEqual(
        expect.objectContaining({ code: 'invalid_reference', entity: 'room' }),
      );
    }
  });

  it.each<[string, Partial<Task>, Partial<DomainError>]>([
    [
      'a missing project',
      { projectId: 'prj_ghost' },
      { code: 'invalid_reference', entity: 'project' },
    ],
    [
      'a missing department',
      { departmentId: 'dept_ghost' },
      { code: 'invalid_reference', entity: 'department' },
    ],
    [
      'a missing assignee',
      { assigneeId: 'emp_ghost' },
      { code: 'invalid_reference', entity: 'employee' },
    ],
    [
      'a missing dependency',
      { dependencies: ['task_ghost'] },
      { code: 'invalid_reference', entity: 'task' },
    ],
    ['a blank title', { title: '  ' }, { code: 'validation', field: 'title' }],
    [
      'an active status without an assignee',
      { status: 'in_progress' },
      { code: 'validation', field: 'task.assigneeId' },
    ],
  ])('rejects a task with %s', (_label, patch, expected) => {
    expect(errorsOf({ tasks: [makeTask(patch)] })).toContainEqual(
      expect.objectContaining(expected),
    );
  });

  it('rejects a dependency on a task in another project', () => {
    const other: Project = { ...project, id: 'prj_2' };
    const foreign = makeTask({ projectId: 'prj_2' });
    const task = makeTask({ dependencies: [foreign.id] });
    expect(errorsOf({ projects: [project, other], tasks: [foreign, task] })).toContainEqual(
      expect.objectContaining({ code: 'invalid_reference', entity: 'task' }),
    );
  });

  it('rejects circular dependencies in stored data', () => {
    const a = makeTask({ id: 'task_a', dependencies: ['task_b'] });
    const b = makeTask({ id: 'task_b', dependencies: ['task_a'] });
    expect(errorsOf({ tasks: [a, b] })).toContainEqual(
      expect.objectContaining({ code: 'dependency_cycle' }),
    );
  });

  it('rejects two active tasks for one employee', () => {
    const first = makeTask({ assigneeId: EMP.sarah, status: 'in_progress' });
    const second = makeTask({ assigneeId: EMP.sarah, status: 'in_review' });
    expect(
      errorsOf({ tasks: [first, second], employees: withEmployee({ currentTaskId: first.id }) }),
    ).toContainEqual(expect.objectContaining({ field: 'task.assigneeId' }));
  });

  it('rejects a currentTaskId that disagrees with task state', () => {
    const active = makeTask({ assigneeId: EMP.sarah, status: 'in_progress' });
    // Pointer missing although a task is active…
    expect(errorsOf({ tasks: [active] })).toContainEqual(
      expect.objectContaining({ field: 'employee.currentTaskId' }),
    );
    // …and pointer set although nothing is active.
    expect(errorsOf({ employees: withEmployee({ currentTaskId: 'task_ghost' }) })).toContainEqual(
      expect.objectContaining({ field: 'employee.currentTaskId' }),
    );
    // Correct pointer is accepted.
    expect(
      errorsOf({ tasks: [active], employees: withEmployee({ currentTaskId: active.id }) }),
    ).toEqual([]);
  });

  it('rejects a notification that points at nothing', () => {
    const notification: Notification = {
      id: 'ntf_1',
      title: 'Task assigned',
      message: '',
      type: 'info',
      relatedEntityId: 'task_ghost',
      isRead: false,
      createdAt: '2026-01-02T00:00:00.000Z',
    };
    expect(errorsOf({ notifications: [notification] })).toContainEqual(
      expect.objectContaining({ field: 'notification.relatedEntityId' }),
    );
    expect(errorsOf({ notifications: [{ ...notification, relatedEntityId: null }] })).toEqual([]);
    expect(errorsOf({ notifications: [{ ...notification, relatedEntityId: EMP.sarah }] })).toEqual(
      [],
    );
  });

  it('reports every problem, not just the first', () => {
    const errors = errorsOf({
      tasks: [makeTask({ projectId: 'prj_ghost', departmentId: 'dept_ghost' })],
    });
    expect(errors).toHaveLength(2);
  });
});

describe('validateWorkspace', () => {
  it('detects an entity stored under the wrong key', () => {
    const built = buildWorkspace(records(), OFFICE_LAYOUT);
    if (!built.ok) throw new Error('fixture should be valid');
    const corrupted = { ...built.value, projects: { prj_wrong: project } };
    expect(validateWorkspace(corrupted, OFFICE_LAYOUT)).toContainEqual(
      expect.objectContaining({ code: 'validation', field: 'id' }),
    );
  });

  it('accepts a cross-department assignment (it is allowed when made explicitly)', () => {
    const task = makeTask({ departmentId: DEPT.frontend, assigneeId: EMP.sarah });
    expect(errorsOf({ tasks: [task] })).toEqual([]);
  });
});

describe('Phase 1.6 invariants', () => {
  const meeting = (patch: Partial<Meeting> = {}): Meeting => ({
    id: 'mtg_1',
    title: 'Review',
    agenda: '',
    roomId: 'room_meeting',
    participantIds: [EMP.sarah],
    startsAt: '2026-12-01T10:00',
    durationMinutes: 60,
    projectId: null,
    status: 'scheduled',
    notes: '',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...patch,
  });

  it('accepts a valid meeting', () => {
    expect(errorsOf({ meetings: [meeting()] })).toEqual([]);
  });

  it('rejects a meeting with an unknown participant or none at all', () => {
    expect(errorsOf({ meetings: [meeting({ participantIds: ['emp_gone'] })] })).toHaveLength(1);
    expect(errorsOf({ meetings: [meeting({ participantIds: [] })] })).toHaveLength(1);
  });

  it('rejects a meeting outside a meeting room', () => {
    expect(errorsOf({ meetings: [meeting({ roomId: 'room_design' })] })).toHaveLength(1);
  });

  it('rejects a stored employee name that is blank or untrimmed', () => {
    expect(errorsOf({ employees: withEmployee({ name: '   ' }) })).toHaveLength(1);
    expect(errorsOf({ employees: withEmployee({ name: ' Sarah ' }) })).toHaveLength(1);
  });
});
