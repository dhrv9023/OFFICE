import { invalidReference, type DomainResult } from '@/domain/errors';
import type { EmployeeId, MeetingId, ProjectId, TaskId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import { authorizeRead } from '@/domain/rules/access';
import type {
  AccessStatus,
  Employee,
  GrantScope,
  Meeting,
  Permission,
  Project,
  Task,
  WorkspaceState,
} from '@/domain/types';

/*
 * The scoped read API for AI employees (Phase 2.0). Each read:
 *   - is bound to one employee (identity fixed by the application),
 *   - requires an explicit read permission whose scope covers the resource
 *     (writing never implies reading),
 *   - returns a purpose-built, deep-frozen view with only what that read needs:
 *     no store, no persistence metadata, no access settings of others.
 * Refusals are structured DomainErrors (`permission_denied`, `invalid_actor`,
 * `invalid_reference`).
 */

export interface EmployeeView {
  readonly id: EmployeeId;
  readonly name: string;
  readonly role: string;
  readonly department: string;
  readonly description: string;
  readonly skills: readonly string[];
}

export interface OwnProfileView extends EmployeeView {
  /** What they may do, so a runner can plan within it. */
  readonly access: { readonly status: AccessStatus; readonly permissions: readonly string[] };
}

export interface TaskView {
  readonly id: TaskId;
  readonly title: string;
  readonly description: string;
  readonly status: Task['status'];
  readonly priority: Task['priority'];
  readonly deadline: string | null;
  readonly blockedReason: string | null;
  readonly projectId: ProjectId;
  readonly department: string;
  readonly assigneeId: EmployeeId | null;
  readonly dependencyIds: readonly TaskId[];
}

/** A dependency: its status always (to know what blocks you); its title only if readable. */
export interface DependencyView {
  readonly id: TaskId;
  readonly status: Task['status'];
  readonly title: string | null;
}

export interface ProjectView {
  readonly id: ProjectId;
  readonly name: string;
  readonly description: string;
  readonly status: Project['status'];
  readonly priority: Project['priority'];
  readonly deadline: string | null;
  readonly objectives: readonly string[];
  readonly requirements: readonly string[];
}

export interface MeetingView {
  readonly id: MeetingId;
  readonly title: string;
  readonly agenda: string;
  readonly status: Meeting['status'];
  readonly startsAt: string | null;
  readonly durationMinutes: number | null;
  readonly participants: readonly string[];
  readonly notes: string;
}

export interface MessageView {
  readonly from: 'founder' | 'me';
  readonly body: string;
  readonly sentAt: string;
}

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function employeeView(state: WorkspaceState, employee: Employee): EmployeeView {
  return {
    id: employee.id,
    name: employee.name,
    role: employee.role,
    department: state.departments[employee.departmentId]?.name ?? '',
    description: employee.description,
    skills: [...employee.skills],
  };
}

function taskView(state: WorkspaceState, task: Task): TaskView {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    deadline: task.deadline,
    blockedReason: task.blockedReason,
    projectId: task.projectId,
    department: state.departments[task.departmentId]?.name ?? '',
    assigneeId: task.assigneeId,
    dependencyIds: [...task.dependencies],
  };
}

const taskScope = (task: Task) => (scope: GrantScope, employee: Employee) =>
  scope === 'any' ||
  (scope === 'department' && task.departmentId === employee.departmentId) ||
  (scope === 'own' && task.assigneeId === employee.id);

const projectScope =
  (state: WorkspaceState, project: Project) => (scope: GrantScope, employee: Employee) => {
    if (scope === 'any') return true;
    const tasks = Object.values(state.tasks).filter((task) => task.projectId === project.id);
    return scope === 'own'
      ? tasks.some((task) => task.assigneeId === employee.id)
      : tasks.some((task) => task.departmentId === employee.departmentId);
  };

/** Reads for one employee over `getState()`. */
export function createReader(getState: () => WorkspaceState, employeeId: EmployeeId) {
  const can = (
    state: WorkspaceState,
    permission: Permission,
    label: string,
    inScope: (scope: GrantScope, employee: Employee) => boolean,
  ) => authorizeRead(state, employeeId, permission, label, inScope);

  const read = <T>(produce: (state: WorkspaceState) => DomainResult<T>): DomainResult<T> => {
    const result = produce(getState());
    return result.ok ? ok(freeze(result.value)) : result;
  };

  return Object.freeze({
    employeeId,

    /** Their own profile and what they may do. Needs `employee.read`. */
    profile: (): DomainResult<OwnProfileView> =>
      read((state) => {
        const me = can(state, 'employee.read', 'their own profile', () => true);
        if (!me.ok) return me;
        const profile = state.accessProfiles[employeeId];
        return ok({
          ...employeeView(state, me.value),
          access: {
            status: profile?.status ?? 'disabled',
            permissions: (profile?.grants ?? []).map(
              (grant) => `${grant.permission}:${grant.scope}`,
            ),
          },
        });
      }),

    /** Another employee's public profile, within scope. Needs `employee.read`. */
    employee: (id: EmployeeId): DomainResult<EmployeeView> =>
      read((state) => {
        const other = state.employees[id];
        if (!other) return err(invalidReference('employee', id, 'employeeId'));
        const allowed = can(
          state,
          'employee.read',
          other.name,
          (scope, me) =>
            scope === 'any' ||
            (scope === 'department' && other.departmentId === me.departmentId) ||
            other.id === me.id,
        );
        return allowed.ok ? ok(employeeView(state, other)) : allowed;
      }),

    /** Tasks assigned to them (open and finished). Needs `task.read`. */
    myTasks: (): DomainResult<readonly TaskView[]> =>
      read((state) => {
        const allowed = can(state, 'task.read', 'their own tasks', () => true);
        if (!allowed.ok) return allowed;
        return ok(
          Object.values(state.tasks)
            .filter((task) => task.assigneeId === employeeId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map((task) => taskView(state, task)),
        );
      }),

    /** One task, within scope. Needs `task.read`. */
    task: (id: TaskId): DomainResult<TaskView> =>
      read((state) => {
        const task = state.tasks[id];
        if (!task) return err(invalidReference('task', id, 'taskId'));
        const allowed = can(state, 'task.read', task.title, taskScope(task));
        return allowed.ok ? ok(taskView(state, task)) : allowed;
      }),

    /**
     * What a readable task depends on: every dependency's status (to know what
     * blocks it), and its title only where the employee may read that task.
     */
    dependencies: (id: TaskId): DomainResult<readonly DependencyView[]> =>
      read((state) => {
        const task = state.tasks[id];
        if (!task) return err(invalidReference('task', id, 'taskId'));
        const allowed = can(state, 'task.read', task.title, taskScope(task));
        if (!allowed.ok) return allowed;
        return ok(
          task.dependencies.flatMap((dependencyId) => {
            const dependency = state.tasks[dependencyId];
            if (!dependency) return [];
            const readable = can(state, 'task.read', dependency.title, taskScope(dependency)).ok;
            return [
              {
                id: dependency.id,
                status: dependency.status,
                title: readable ? dependency.title : null,
              },
            ];
          }),
        );
      }),

    /** A project's brief, within scope (own: has a task in it). Needs `project.read`. */
    project: (id: ProjectId): DomainResult<ProjectView> =>
      read((state) => {
        const project = state.projects[id];
        if (!project) return err(invalidReference('project', id, 'projectId'));
        const allowed = can(state, 'project.read', project.name, projectScope(state, project));
        if (!allowed.ok) return allowed;
        return ok({
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          priority: project.priority,
          deadline: project.deadline,
          objectives: [...project.objectives],
          requirements: [...project.requirements],
        });
      }),

    /** Meetings they are invited to (own) or all (any). Needs `meeting.read`. */
    meetings: (): DomainResult<readonly MeetingView[]> =>
      read((state) => {
        const allowed = can(state, 'meeting.read', 'meetings', () => true);
        if (!allowed.ok) return allowed;
        const profile = state.accessProfiles[employeeId];
        const seesAll =
          profile?.grants.some(
            (grant) => grant.permission === 'meeting.read' && grant.scope === 'any',
          ) ?? false;
        return ok(
          Object.values(state.meetings)
            .filter((meeting) => seesAll || meeting.participantIds.includes(employeeId))
            .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))
            .map((meeting) => ({
              id: meeting.id,
              title: meeting.title,
              agenda: meeting.agenda,
              status: meeting.status,
              startsAt: meeting.startsAt,
              durationMinutes: meeting.durationMinutes,
              participants: meeting.participantIds.map(
                (pid) => state.employees[pid]?.name ?? 'A former employee',
              ),
              notes: meeting.notes,
            })),
        );
      }),

    /** Their conversation with the founder, oldest first. Needs `message.read`. */
    messages: (): DomainResult<readonly MessageView[]> =>
      read((state) => {
        const allowed = can(state, 'message.read', 'their messages', () => true);
        if (!allowed.ok) return allowed;
        return ok(
          state.messages
            .filter((message) => message.from === employeeId || message.to === employeeId)
            .map((message) => ({
              from: message.from === employeeId ? ('me' as const) : ('founder' as const),
              body: message.body,
              sentAt: message.createdAt,
            })),
        );
      }),
  });
}

export type Reader = ReturnType<typeof createReader>;
