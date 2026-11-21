import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectId } from '@/domain/ids';
import { USER_ACTOR, type TaskStatus } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, unwrap, type Harness } from '@/test/harness';
import {
  selectCurrentProjects,
  selectDashboardMetrics,
  selectDepartmentOverview,
  selectDepartments,
  selectDependents,
  selectEmployeeStatus,
  selectEmployeeSummaries,
  selectEmployees,
  selectNotifications,
  selectProjectProgress,
  selectOpenTaskCounts,
  selectProjectActivity,
  selectProjects,
  selectProjectSummaries,
  selectRecentActivity,
  selectTaskActivity,
  selectTasksByAssignee,
  selectTasksByProject,
  selectUnreadNotificationCount,
} from './selectors';

let h: Harness;
let projectId: ProjectId;

beforeEach(() => {
  h = createHarness();
  projectId = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' })).id;
});

const design = (title: string, extra: object = {}) =>
  unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.design,
      title,
      assigneeId: EMP.sarah,
      ...extra,
    }),
  );

describe('selectors', () => {
  it('lists departments and employees in seed order', () => {
    expect(selectDepartments(h.state()).map((item) => item.id)).toEqual(Object.values(DEPT));
    expect(selectEmployees(h.state()).map((item) => item.id)).toEqual(Object.values(EMP));
  });

  it('lists projects oldest first', () => {
    unwrap(h.commands.createProject(USER_ACTOR, { name: 'Second' }));
    expect(selectProjects(h.state()).map((item) => item.name)).toEqual(['Website', 'Second']);
  });

  it('lists only the tasks of the requested project, oldest first', () => {
    const other = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Other' }));
    const a = design('A');
    unwrap(
      h.commands.createTask(USER_ACTOR, { projectId: other.id, departmentId: DEPT.qa, title: 'X' }),
    );
    const b = design('B');
    expect(selectTasksByProject(h.state(), projectId).map((item) => item.id)).toEqual([a.id, b.id]);
    expect(selectTasksByProject(h.state(), 'prj_missing')).toEqual([]);
  });

  it("lists an employee's tasks most urgent first", () => {
    design('Low', { priority: 'low' });
    design('Critical', { priority: 'critical' });
    design('Medium A');
    design('Medium B');
    expect(selectTasksByAssignee(h.state(), EMP.sarah).map((item) => item.title)).toEqual([
      'Critical',
      'Medium A',
      'Medium B',
      'Low',
    ]);
    expect(selectTasksByAssignee(h.state(), EMP.ryan)).toEqual([]);
  });

  it('derives progress and status from the canonical state', () => {
    const task = design('A');
    design('B');
    expect(selectProjectProgress(h.state(), projectId).percent).toBe(0);
    expect(selectEmployeeStatus(h.state(), EMP.sarah)).toBe('idle');

    for (const status of ['in_progress', 'in_review', 'done'] as const) {
      unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status }));
    }
    expect(selectProjectProgress(h.state(), projectId).percent).toBe(50);
    expect(selectProjectProgress(h.state(), 'prj_missing').percent).toBe(0);
  });

  it('summarises each employee with department, status and current task', () => {
    const task = design('A');
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }));

    const summaries = selectEmployeeSummaries(h.state());
    expect(summaries).toHaveLength(5);
    const sarah = summaries.find((item) => item.employee.id === EMP.sarah);
    expect(sarah).toMatchObject({
      status: 'working',
      department: { id: DEPT.design },
      currentTask: { id: task.id, status: 'in_progress' },
    });
    const ryan = summaries.find((item) => item.employee.id === EMP.ryan);
    expect(ryan).toMatchObject({ status: 'idle', currentTask: null });
  });

  it('shows blocked status when the only assigned work is blocked', () => {
    const task = design('A');
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'blocked' }));
    expect(selectEmployeeStatus(h.state(), EMP.sarah)).toBe('blocked');
  });

  it('lists notifications newest first and counts unread ones', () => {
    design('A');
    expect(selectNotifications(h.state()).map((item) => item.title)).toEqual([
      'Task assigned',
      'Project created',
    ]);
    expect(selectUnreadNotificationCount(h.state())).toBe(2);

    unwrap(h.commands.markNotificationRead(USER_ACTOR, { notificationId: 'ntf_0001' }));
    expect(selectUnreadNotificationCount(h.state())).toBe(1);
  });
});

describe('dashboard selectors', () => {
  it('derive counts, current projects, recent activity and departments', () => {
    const h = createHarness();
    const web = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Web' }));
    unwrap(
      h.commands.updateProject(USER_ACTOR, { projectId: web.id, patch: { status: 'active' } }),
    );
    const done = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Old' }));
    unwrap(
      h.commands.updateProject(USER_ACTOR, { projectId: done.id, patch: { status: 'active' } }),
    );
    unwrap(
      h.commands.updateProject(USER_ACTOR, { projectId: done.id, patch: { status: 'completed' } }),
    );
    const later = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Later' }));

    const task = (title: string, departmentId: string, assigneeId: string) =>
      unwrap(
        h.commands.createTask(USER_ACTOR, {
          projectId: web.id,
          departmentId: departmentId as never,
          title,
          assigneeId: assigneeId as never,
        }),
      );
    const a = task('A', DEPT.design, EMP.sarah);
    const b = task('B', DEPT.qa, EMP.emma);
    const c = task('C', DEPT.backend, EMP.daniel);
    const d = task('D', DEPT.frontend, EMP.ryan);
    const move = (id: typeof a.id, ...statuses: TaskStatus[]) => {
      for (const status of statuses)
        unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: id, status }));
    };
    move(a.id, 'in_progress', 'in_review', 'done');
    move(b.id, 'blocked');
    move(c.id, 'in_progress');
    move(d.id, 'cancelled');

    expect(selectDashboardMetrics(h.state(), '2026-12-01')).toEqual({
      peopleWorking: 1,
      peopleAvailable: 3,
      tasksOverdue: 0,
      tasksUnassigned: 0,
      meetingsOpen: 0,
      employees: 5,
      projects: 3,
      activeProjects: 1,
      tasks: 4,
      tasksInProgress: 1,
      tasksInReview: 0,
      tasksBlocked: 1,
      tasksDone: 1,
      tasksCancelled: 1,
    });

    const current = selectCurrentProjects(h.state());
    expect(current.map(({ project }) => project.name)).toEqual(['Web', 'Later']);
    expect(current[0]?.progress).toMatchObject({ done: 1, counted: 3, percent: 33 });
    expect(current.some(({ project }) => project.id === later.id)).toBe(true);

    const recent = selectRecentActivity(h.state(), 2);
    expect(recent).toHaveLength(2);
    expect(recent[0]).toBe(h.state().activity.at(-1));

    const departments = selectDepartmentOverview(h.state());
    expect(departments.find((entry) => entry.department.id === DEPT.qa)).toMatchObject({
      employees: 1,
      openTasks: 1,
    });
    expect(departments.find((entry) => entry.department.id === DEPT.frontend)?.openTasks).toBe(0);
  });
});

describe('project and task selectors', () => {
  it('summarise projects and collect per-project and per-task history', () => {
    const h = createHarness();
    const web = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Web' }));
    const empty = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Empty' }));
    const design = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: web.id,
        departmentId: DEPT.design,
        title: 'Design',
        assigneeId: EMP.sarah,
      }),
    );
    const build = unwrap(
      h.commands.createTask(USER_ACTOR, {
        projectId: web.id,
        departmentId: DEPT.frontend,
        title: 'Build',
        assigneeId: EMP.ryan,
        dependencies: [design.id],
      }),
    );
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: design.id, status: 'in_progress' }));

    const [webSummary, emptySummary] = selectProjectSummaries(h.state());
    expect(webSummary?.assignees.map((employee) => employee.id)).toEqual([EMP.sarah, EMP.ryan]);
    expect(webSummary?.departments.map((department) => department.id)).toEqual([
      DEPT.design,
      DEPT.frontend,
    ]);
    expect(webSummary?.progress).toMatchObject({ total: 2, done: 0 });
    expect(emptySummary).toMatchObject({ assignees: [], departments: [], project: empty });

    const projectEvents = selectProjectActivity(h.state(), web.id, 3);
    expect(projectEvents).toHaveLength(3);
    expect(projectEvents[0]?.eventType).toBe('task.status_changed');

    expect(selectTaskActivity(h.state(), design.id).map((event) => event.eventType)).toEqual([
      'task.created',
      'task.assigned',
      'task.status_changed',
    ]);
    expect(selectDependents(h.state(), design.id).map((task) => task.id)).toEqual([build.id]);
    expect(selectOpenTaskCounts(h.state())).toEqual({ [EMP.sarah]: 1, [EMP.ryan]: 1 });
  });
});
