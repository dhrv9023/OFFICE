import type { EmployeeId, ProjectId, TaskId } from '@/domain/ids';
import { openDependents } from '@/domain/rules/dependencies';
import { isOverdue } from '@/domain/rules/deadlines';
import { deriveEmployeeStatus } from '@/domain/rules/employeeStatus';
import { calculateProjectProgress, type ProjectProgress } from '@/domain/rules/projectProgress';
import {
  isOpenMeeting,
  isTerminalStatus,
  PRIORITY_RANK,
  type ActivityEvent,
  type Department,
  type Employee,
  type EmployeeWorkStatus,
  type Notification,
  type Project,
  type Task,
  type WorkspaceState,
} from '@/domain/types';

/**
 * Pure read-side queries over WorkspaceState. Derived values (work status, progress,
 * unread count) are computed here from the canonical state and never stored.
 */
const byCreation = <T extends { createdAt: string; id: string }>(a: T, b: T): number =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export function selectDepartments(state: WorkspaceState): Department[] {
  return Object.values(state.departments);
}

export function selectEmployees(state: WorkspaceState): Employee[] {
  return Object.values(state.employees);
}

/** Oldest first. */
export function selectProjects(state: WorkspaceState): Project[] {
  return Object.values(state.projects).sort(byCreation);
}

/** Oldest first. */
export function selectTasksByProject(state: WorkspaceState, projectId: ProjectId): Task[] {
  return Object.values(state.tasks)
    .filter((task) => task.projectId === projectId)
    .sort(byCreation);
}

/** Everything assigned to an employee, most urgent first, then oldest. */
export function selectTasksByAssignee(state: WorkspaceState, employeeId: EmployeeId): Task[] {
  return Object.values(state.tasks)
    .filter((task) => task.assigneeId === employeeId)
    .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || byCreation(a, b));
}

export function selectProjectProgress(
  state: WorkspaceState,
  projectId: ProjectId,
): ProjectProgress {
  return calculateProjectProgress(selectTasksByProject(state, projectId));
}

export function selectEmployeeStatus(
  state: WorkspaceState,
  employeeId: EmployeeId,
): EmployeeWorkStatus {
  return deriveEmployeeStatus(employeeId, Object.values(state.tasks));
}

export interface EmployeeSummary {
  readonly employee: Employee;
  readonly department: Department | null;
  readonly status: EmployeeWorkStatus;
  readonly currentTask: Task | null;
}

export function selectEmployeeSummaries(state: WorkspaceState): EmployeeSummary[] {
  const tasks = Object.values(state.tasks);
  return Object.values(state.employees).map((employee) => ({
    employee,
    department: state.departments[employee.departmentId] ?? null,
    status: deriveEmployeeStatus(employee.id, tasks),
    currentTask: employee.currentTaskId ? (state.tasks[employee.currentTaskId] ?? null) : null,
  }));
}

/** Newest first. */
export function selectNotifications(state: WorkspaceState): Notification[] {
  return [...state.notifications].reverse();
}

export function selectUnreadNotificationCount(state: WorkspaceState): number {
  return state.notifications.filter((notification) => !notification.isRead).length;
}

export interface DashboardMetrics {
  readonly employees: number;
  readonly projects: number;
  readonly activeProjects: number;
  readonly tasks: number;
  readonly tasksInProgress: number;
  readonly tasksInReview: number;
  readonly tasksBlocked: number;
  readonly tasksDone: number;
  readonly tasksCancelled: number;
  /** People with active work (in progress) and with no open work at all. */
  readonly peopleWorking: number;
  readonly peopleAvailable: number;
  /** Open tasks past their deadline (as of `today`). */
  readonly tasksOverdue: number;
  /** Open tasks nobody owns. */
  readonly tasksUnassigned: number;
  /** Meetings scheduled or in progress. */
  readonly meetingsOpen: number;
}

/**
 * Headline counts for the dashboard, all derived from the canonical state.
 * `today` is the user's local calendar day (`YYYY-MM-DD`), for deadlines.
 */
export function selectDashboardMetrics(state: WorkspaceState, today: string): DashboardMetrics {
  const tasks = Object.values(state.tasks);
  const count = (status: Task['status']) => tasks.filter((task) => task.status === status).length;
  const projects = Object.values(state.projects);
  const statuses = Object.keys(state.employees).map((id) =>
    deriveEmployeeStatus(id as EmployeeId, tasks),
  );
  return {
    peopleWorking: statuses.filter((status) => status === 'working').length,
    peopleAvailable: statuses.filter((status) => status === 'idle').length,
    tasksOverdue: tasks.filter((task) => isOverdue(task, today)).length,
    tasksUnassigned: tasks.filter(
      (task) => task.assigneeId === null && !isTerminalStatus(task.status),
    ).length,
    meetingsOpen: Object.values(state.meetings).filter((meeting) => isOpenMeeting(meeting.status))
      .length,
    employees: Object.keys(state.employees).length,
    projects: projects.length,
    activeProjects: projects.filter((project) => project.status === 'active').length,
    tasks: tasks.length,
    tasksInProgress: count('in_progress'),
    tasksInReview: count('in_review'),
    tasksBlocked: count('blocked'),
    tasksDone: count('done'),
    tasksCancelled: count('cancelled'),
  };
}

export interface ProjectOverview {
  readonly project: Project;
  readonly progress: ProjectProgress;
}

const OPEN_PROJECT_STATUSES: readonly Project['status'][] = ['active', 'planning', 'on_hold'];

/** Projects still in play (not completed or archived): active first, then most recently updated. */
export function selectCurrentProjects(state: WorkspaceState): ProjectOverview[] {
  const tasks = Object.values(state.tasks);
  return Object.values(state.projects)
    .filter((project) => OPEN_PROJECT_STATUSES.includes(project.status))
    .sort(
      (a, b) =>
        OPEN_PROJECT_STATUSES.indexOf(a.status) - OPEN_PROJECT_STATUSES.indexOf(b.status) ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .map((project) => ({
      project,
      progress: calculateProjectProgress(tasks.filter((task) => task.projectId === project.id)),
    }));
}

/** Newest first. */
export function selectRecentActivity(state: WorkspaceState, limit: number): ActivityEvent[] {
  return state.activity.slice(-limit).reverse();
}

export interface DepartmentOverview {
  readonly department: Department;
  readonly employees: number;
  /** Tasks owned by the department that are not done or cancelled. */
  readonly openTasks: number;
}

export function selectDepartmentOverview(state: WorkspaceState): DepartmentOverview[] {
  const employees = Object.values(state.employees);
  const tasks = Object.values(state.tasks);
  return Object.values(state.departments).map((department) => ({
    department,
    employees: employees.filter((employee) => employee.departmentId === department.id).length,
    openTasks: tasks.filter(
      (task) => task.departmentId === department.id && !isTerminalStatus(task.status),
    ).length,
  }));
}

export interface ProjectSummary {
  readonly project: Project;
  readonly progress: ProjectProgress;
  /** Everyone assigned at least one task in the project, in roster order. */
  readonly assignees: readonly Employee[];
  /** Departments that own at least one task in the project. */
  readonly departments: readonly Department[];
}

/** Every project with its derived progress and people. Oldest first. */
export function selectProjectSummaries(state: WorkspaceState): ProjectSummary[] {
  const tasks = Object.values(state.tasks);
  return selectProjects(state).map((project) => {
    const own = tasks.filter((task) => task.projectId === project.id);
    const assigneeIds = new Set(own.map((task) => task.assigneeId));
    const departmentIds = new Set(own.map((task) => task.departmentId));
    return {
      project,
      progress: calculateProjectProgress(own),
      assignees: Object.values(state.employees).filter((employee) => assigneeIds.has(employee.id)),
      departments: Object.values(state.departments).filter((department) =>
        departmentIds.has(department.id),
      ),
    };
  });
}

/** Activity about one project (including its tasks), newest first. */
export function selectProjectActivity(
  state: WorkspaceState,
  projectId: ProjectId,
  limit: number,
): ActivityEvent[] {
  return state.activity
    .filter((event) => event.projectId === projectId)
    .slice(-limit)
    .reverse();
}

/** The history of one task, oldest first. */
export function selectTaskActivity(state: WorkspaceState, taskId: TaskId): ActivityEvent[] {
  return state.activity.filter((event) => event.taskId === taskId);
}

/** Open tasks that list `taskId` as a dependency. */
export function selectDependents(state: WorkspaceState, taskId: TaskId): Task[] {
  return openDependents(taskId, state.tasks);
}

/** How many open (not done / not cancelled) tasks each employee holds. */
export function selectOpenTaskCounts(state: WorkspaceState): Readonly<Record<EmployeeId, number>> {
  const counts: Record<EmployeeId, number> = {};
  for (const task of Object.values(state.tasks)) {
    if (task.assigneeId && !isTerminalStatus(task.status)) {
      counts[task.assigneeId] = (counts[task.assigneeId] ?? 0) + 1;
    }
  }
  return counts;
}
