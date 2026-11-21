// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { commands } from '@/commands';
import { USER_ACTOR, type Task } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { unwrap } from '@/test/harness';
import { freshWorkspace, renderApp } from '@/test/render';

/** The number shown in the metric tile labelled `label`. */
function metric(label: string): string | null | undefined {
  return screen.getByText(label, { selector: 'dt span' }).closest('div')?.querySelector('dd')
    ?.textContent;
}

function card(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

beforeEach(async () => {
  await freshWorkspace();
});

describe('dashboard', () => {
  it('shows real counts for a fresh workspace', () => {
    renderApp('/');
    expect(metric('Working')).toBe('0');
    expect(metric('Available')).toBe('5');
    expect(metric('Active projects')).toBe('0');
    expect(metric('In progress')).toBe('0');
    expect(metric('Awaiting review')).toBe('0');
    expect(metric('Blocked')).toBe('0');
    expect(metric('Completed')).toBe('0');
    expect(metric('Overdue')).toBe('0');
    expect(metric('Unassigned')).toBe('0');
    expect(metric('Meetings')).toBe('0');
  });

  it('shows empty states when there are no projects, activity or notifications', () => {
    renderApp('/');
    expect(within(card('Current projects')).getByText('No projects yet')).toBeInTheDocument();
    expect(within(card('Recent activity')).getByText('No activity yet')).toBeInTheDocument();
    expect(within(card('Notifications')).getByText('No notifications')).toBeInTheDocument();
  });

  it('lists the seed team and every department', () => {
    renderApp('/');
    const team = card('Team');
    for (const name of ['Alex Morgan', 'Sarah Chen', 'Ryan Miller', 'Daniel Kim', 'Emma Wilson']) {
      expect(within(team).getByText(name)).toBeInTheDocument();
    }
    expect(within(team).getAllByText('Available')).toHaveLength(5);
    const departments = screen.getByRole('region', { name: 'Departments' });
    expect(within(departments).getAllByRole('listitem')).toHaveLength(5);
    expect(within(departments).getByRole('link', { name: /UI\/UX Design/ })).toHaveAttribute(
      'href',
      '/employees#dept_design',
    );
  });

  it('updates live as commands change the workspace', () => {
    renderApp('/');

    // React 19's act() does not return the callback's value, so capture it.
    let designId = '' as Task['id'];
    act(() => {
      const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Website relaunch' }));
      designId = unwrap(
        commands.createTask(USER_ACTOR, {
          projectId: project.id,
          departmentId: DEPT.design,
          title: 'Design homepage',
          assigneeId: EMP.sarah,
        }),
      ).id;
      unwrap(
        commands.createTask(USER_ACTOR, {
          projectId: project.id,
          departmentId: DEPT.qa,
          title: 'Test plan',
          assigneeId: EMP.emma,
        }),
      );
      unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: designId, status: 'in_progress' }));
    });

    expect(metric('Active projects')).toBe('0');
    expect(metric('In progress')).toBe('1');
    expect(metric('Working')).toBe('1');
    expect(within(card('Team')).getByText('Working')).toBeInTheDocument();
    expect(within(card('Current projects')).getByText('Website relaunch')).toBeInTheDocument();
    expect(
      within(card('Recent activity')).getByText(/moved from To do to In progress/),
    ).toBeInTheDocument();

    act(() => {
      unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: designId, status: 'in_review' }));
    });
    expect(metric('In progress')).toBe('0');
    expect(metric('Awaiting review')).toBe('1');

    act(() => {
      unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: designId, status: 'done' }));
    });
    expect(metric('Completed')).toBe('1');
    expect(
      within(card('Current projects')).getByRole('progressbar', {
        name: 'Website relaunch progress',
      }),
    ).toHaveAttribute('aria-valuenow', '50');
  });

  it('counts blocked work and active projects', () => {
    renderApp('/');
    act(() => {
      const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Portal' }));
      unwrap(
        commands.updateProject(USER_ACTOR, { projectId: project.id, patch: { status: 'active' } }),
      );
      const task = unwrap(
        commands.createTask(USER_ACTOR, {
          projectId: project.id,
          departmentId: DEPT.backend,
          title: 'Accounts API',
          assigneeId: EMP.daniel,
        }),
      );
      unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'blocked' }));
    });
    expect(metric('Active projects')).toBe('1');
    expect(metric('Blocked')).toBe('1');
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
  });

  it('marks all notifications read from the top bar', () => {
    renderApp('/');
    act(() => {
      const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Portal' }));
      unwrap(
        commands.createTask(USER_ACTOR, {
          projectId: project.id,
          departmentId: DEPT.qa,
          title: 'Test plan',
          assigneeId: EMP.emma,
        }),
      );
    });
    const bell = screen.getByRole('button', { name: /^Notifications, \d+ unread$/ });
    fireEvent.click(bell);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('You are all caught up')).toBeInTheDocument();
  });
});

describe('attention metrics (Phase 1.7)', () => {
  it('counts overdue and unassigned work and links each figure to its filtered view', () => {
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Website' }));
    unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Late and unowned',
        deadline: '2020-01-01',
      }),
    );
    renderApp('/');
    expect(metric('Overdue')).toBe('1');
    expect(metric('Unassigned')).toBe('1');
    expect(screen.getByRole('link', { name: /^Overdue: 1\./ })).toHaveAttribute(
      'href',
      '/tasks?due=overdue',
    );
    expect(screen.getByRole('link', { name: /^Unassigned: 1\./ })).toHaveAttribute(
      'href',
      '/tasks?assignee=unassigned&status=open',
    );
    expect(screen.getByRole('link', { name: /^Blocked: 0\./ })).toHaveAttribute(
      'href',
      '/tasks?status=blocked',
    );
  });
});
