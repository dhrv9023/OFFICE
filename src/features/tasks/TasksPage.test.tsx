// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { commands } from '@/commands';
import type { ProjectId, TaskId } from '@/domain/ids';
import { USER_ACTOR, type Task, type TaskStatus } from '@/domain/types';
import { getWorkspace } from '@/stores/workspace';
import { DEPT, EMP } from '@/test/factories';
import { unwrap } from '@/test/harness';
import { freshWorkspace, renderApp } from '@/test/render';

let projectId: ProjectId;

beforeEach(async () => {
  await freshWorkspace();
  projectId = unwrap(commands.createProject(USER_ACTOR, { name: 'Website' })).id;
  unwrap(commands.updateProject(USER_ACTOR, { projectId, patch: { status: 'active' } }));
});

function task(title: string, extra: Partial<Parameters<typeof commands.createTask>[1]> = {}): Task {
  return unwrap(
    commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.design,
      title,
      assigneeId: EMP.sarah,
      ...extra,
    }),
  );
}

function move(taskId: TaskId, ...statuses: TaskStatus[]) {
  for (const status of statuses) unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId, status }));
}

const statusOf = (taskId: TaskId) => getWorkspace().tasks[taskId]?.status;

function column(label: string): HTMLElement {
  return screen.getByRole('region', { name: label });
}

function cardIn(columnLabel: string, title: string): HTMLElement {
  return within(column(columnLabel)).getByRole('article', { name: title });
}

/** Simulates an HTML5 drag of a card onto a column. */
function drag(title: string, from: string, to: string) {
  const card = cardIn(from, title);
  const data = new Map<string, string>();
  const dataTransfer = {
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
    effectAllowed: 'all',
    dropEffect: 'none',
  };
  fireEvent.dragStart(card, { dataTransfer });
  const target = column(to);
  fireEvent.dragOver(target, { dataTransfer });
  const state = target.dataset.dropState;
  fireEvent.drop(target, { dataTransfer });
  fireEvent.dragEnd(card, { dataTransfer });
  return state;
}

function openStatusMenu(title: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`Change status of "${title}"`) }));
  return screen.getByRole('menu');
}

describe('task board', () => {
  it('shows a column for every status with the task details on each card', () => {
    const design = task('Design homepage', { priority: 'high' });
    task('Build homepage', {
      departmentId: DEPT.frontend,
      assigneeId: EMP.ryan,
      dependencies: [design.id],
    });
    renderApp('/tasks');

    for (const label of ['To do', 'In progress', 'In review', 'Blocked', 'Done', 'Cancelled']) {
      expect(column(label)).toBeInTheDocument();
    }
    const card = cardIn('To do', 'Build homepage');
    expect(card).toHaveTextContent('Website');
    expect(card).toHaveTextContent('Frontend Development');
    expect(card).toHaveTextContent('Ryan Miller');
    expect(card).toHaveTextContent('Medium');
    expect(within(card).getByText('Waiting on 1 of 1 dependencies')).toBeInTheDocument();
    expect(cardIn('To do', 'Design homepage')).toHaveTextContent('High');
  });

  it('moves a card by drag and drop through the valid workflow', () => {
    const design = task('Design homepage');
    renderApp('/tasks');

    expect(drag('Design homepage', 'To do', 'In progress')).toBe('allowed');
    expect(statusOf(design.id)).toBe('in_progress');
    expect(cardIn('In progress', 'Design homepage')).toBeInTheDocument();
    expect(screen.getByText('Moved "Design homepage" to In progress.')).toBeInTheDocument();

    drag('Design homepage', 'In progress', 'In review');
    drag('Design homepage', 'In review', 'Done');
    expect(statusOf(design.id)).toBe('done');
    expect(cardIn('Done', 'Design homepage')).toBeInTheDocument();
  });

  it('refuses an invalid drop, leaves the card where it was and explains why', () => {
    const design = task('Design homepage');
    move(design.id, 'in_progress');
    renderApp('/tasks');

    expect(drag('Design homepage', 'In progress', 'Done')).toBe('blocked');
    expect(statusOf(design.id)).toBe('in_progress');
    expect(cardIn('In progress', 'Design homepage')).toBeInTheDocument();
    expect(screen.getByText('Couldn\'t move "Design homepage" to Done')).toBeInTheDocument();
    expect(screen.getByText(/A task cannot move from "In progress" to "Done"/)).toBeInTheDocument();
  });

  it('keeps closed tasks fixed: done and cancelled cards cannot be dragged', () => {
    const design = task('Design homepage');
    move(design.id, 'cancelled');
    renderApp('/tasks');
    expect(cardIn('Cancelled', 'Design homepage')).toHaveAttribute('draggable', 'false');
  });

  it('blocks starting a task whose dependencies are unfinished, including cancelled ones', () => {
    const design = task('Design homepage');
    const build = task('Build homepage', {
      departmentId: DEPT.frontend,
      assigneeId: EMP.ryan,
      dependencies: [design.id],
    });
    move(design.id, 'cancelled');
    renderApp('/tasks');

    const menu = openStatusMenu('Build homepage');
    const start = within(menu).getByRole('menuitem', { name: /Move to In progress/ });
    expect(start).toHaveAttribute('aria-disabled', 'true');
    expect(start).toHaveTextContent(/1 of them was cancelled: remove or replace that dependency/);
    fireEvent.click(start);
    expect(statusOf(build.id)).toBe('todo');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(drag('Build homepage', 'To do', 'In progress')).toBe('blocked');
    expect(statusOf(build.id)).toBe('todo');
    expect(screen.getByText(/Waiting on other tasks/)).toBeInTheDocument();
  });

  it('enforces one active task per employee', () => {
    const first = task('First');
    task('Second');
    move(first.id, 'in_progress');
    renderApp('/tasks');

    const menu = openStatusMenu('Second');
    expect(within(menu).getByRole('menuitem', { name: /Move to In progress/ })).toHaveTextContent(
      /already working on "First"/,
    );
  });

  it('changes status from the card menu (the keyboard and touch path)', () => {
    const design = task('Design homepage');
    renderApp('/tasks');
    const menu = openStatusMenu('Design homepage');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Move to Blocked/ }));
    // Blocking asks why first; nothing changes until it is confirmed.
    expect(statusOf(design.id)).toBe('todo');
    const dialog = screen.getByRole('dialog', { name: 'Mark as blocked' });
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Waiting on brand assets' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as blocked' }));
    expect(statusOf(design.id)).toBe('blocked');
    expect(getWorkspace().tasks[design.id]?.blockedReason).toBe('Waiting on brand assets');
    expect(
      within(cardIn('Blocked', 'Design homepage')).getByText('Waiting on brand assets'),
    ).toBeInTheDocument();
  });

  it('filters the board', () => {
    task('Design homepage');
    task('Write test plan', { departmentId: DEPT.qa, assigneeId: null });
    renderApp('/tasks');
    fireEvent.change(screen.getByLabelText('Assignee'), { target: { value: 'unassigned' } });
    expect(
      within(column('To do'))
        .getAllByRole('article')
        .map((card) => card.getAttribute('aria-label')),
    ).toEqual(['Write test plan']);
    expect(screen.getByText('Showing 1 of 2 tasks')).toBeInTheDocument();
  });

  it('shows an empty state before there are tasks', () => {
    renderApp('/tasks');
    expect(screen.getByRole('heading', { name: 'No tasks yet' })).toBeInTheDocument();
  });
});

describe('task creation', () => {
  it('creates an assigned task with dependencies', () => {
    const design = task('Design homepage');
    renderApp('/tasks');
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });

    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Build homepage' },
    });
    fireEvent.change(within(dialog).getByLabelText('Department'), {
      target: { value: DEPT.frontend },
    });
    fireEvent.change(within(dialog).getByLabelText('Priority'), { target: { value: 'high' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Ryan Miller/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Design homepage/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create task' }));

    const created = Object.values(getWorkspace().tasks).find(
      (item) => item.title === 'Build homepage',
    );
    expect(created).toMatchObject({
      projectId,
      departmentId: DEPT.frontend,
      assigneeId: EMP.ryan,
      priority: 'high',
      status: 'todo',
      dependencies: [design.id],
    });
    expect(cardIn('To do', 'Build homepage')).toBeInTheDocument();
    expect(getWorkspace().notifications.at(-1)).toMatchObject({ title: 'Task assigned' });
  });

  it('only offers people from the task department unless cross-department is allowed', () => {
    renderApp('/tasks');
    act(() => {
      task('Seed task');
    });
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    fireEvent.change(within(dialog).getByLabelText('Department'), { target: { value: DEPT.qa } });

    expect(within(dialog).getByRole('radio', { name: /Emma Wilson/ })).toBeEnabled();
    expect(within(dialog).queryByRole('radio', { name: /Sarah Chen/ })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /another department/ }));
    expect(within(dialog).getByRole('radio', { name: /Sarah Chen/ })).toBeEnabled();
    expect(
      within(dialog)
        .getByRole('radio', { name: /Sarah Chen/ })
        .closest('label'),
    ).toHaveTextContent(/UI\/UX Designer · UI\/UX Design/);
  });

  it('shows the validation error for an empty title', () => {
    task('Seed');
    renderApp('/tasks');
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Task title is required.');
  });

  it('cannot create tasks without a project that accepts them', async () => {
    await freshWorkspace();
    renderApp('/tasks');
    expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled();
    expect(screen.getByText(/Create a project first/)).toBeInTheDocument();
  });
});

describe('task details', () => {
  it('opens from a card and shows every detail', () => {
    const design = task('Design homepage', { description: 'Hero, pricing and FAQ.' });
    const build = task('Build homepage', {
      departmentId: DEPT.frontend,
      assigneeId: EMP.ryan,
      dependencies: [design.id],
    });
    const { router } = renderApp('/tasks');
    fireEvent.click(
      within(cardIn('To do', 'Build homepage')).getByRole('button', { name: 'Build homepage' }),
    );

    expect(router.state.location.search).toBe(`?task=${build.id}`);
    const drawer = screen.getByRole('dialog', { name: 'Build homepage' });
    expect(drawer).toHaveTextContent('Ryan Miller');
    expect(drawer).toHaveTextContent('Frontend Developer · Frontend Development');
    expect(drawer).toHaveTextContent('Medium');
    expect(drawer).toHaveTextContent('Waiting on 1 of 1.');
    expect(within(drawer).getByRole('link', { name: /Website/ })).toHaveAttribute(
      'href',
      `/projects/${projectId}`,
    );
    expect(drawer).toHaveTextContent('Task "Build homepage" was created in "Website".');

    fireEvent.click(within(drawer).getByRole('button', { name: /Design homepage/ }));
    expect(screen.getByRole('dialog', { name: 'Design homepage' })).toHaveTextContent(
      'Hero, pricing and FAQ.',
    );
  });

  it('edits title and priority', () => {
    const design = task('Design homepage');
    renderApp(`/tasks?task=${design.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit task' });
    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Design landing page' },
    });
    fireEvent.change(within(dialog).getByLabelText('Priority'), { target: { value: 'critical' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(getWorkspace().tasks[design.id]).toMatchObject({
      title: 'Design landing page',
      priority: 'critical',
    });
  });

  it('removes a cancelled dependency (the explicit waiver) so the task can start', () => {
    const design = task('Design homepage');
    const build = task('Build homepage', {
      departmentId: DEPT.frontend,
      assigneeId: EMP.ryan,
      dependencies: [design.id],
    });
    move(design.id, 'cancelled');
    renderApp(`/tasks?task=${build.id}`);
    expect(screen.getByText(/A cancelled dependency never counts as done/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Design homepage/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(getWorkspace().tasks[build.id]?.dependencies).toEqual([]);
    move(build.id, 'in_progress');
    expect(statusOf(build.id)).toBe('in_progress');
  });

  it('assigns and reassigns, updating employee status', () => {
    const design = task('Design homepage', { assigneeId: null, departmentId: DEPT.frontend });
    renderApp(`/tasks?task=${design.id}`);

    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    fireEvent.click(screen.getByRole('radio', { name: /Ryan Miller/ }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Assign task' })).getByRole('button', {
        name: 'Assign',
      }),
    );
    expect(getWorkspace().tasks[design.id]?.assigneeId).toBe(EMP.ryan);
    expect(screen.getByText('Task assigned')).toBeInTheDocument();

    act(() => {
      move(design.id, 'in_progress');
    });
    expect(getWorkspace().employees[EMP.ryan]?.currentTaskId).toBe(design.id);

    fireEvent.click(screen.getByRole('button', { name: 'Reassign' }));
    const dialog = screen.getByRole('dialog', { name: 'Reassign task' });
    expect(within(dialog).getByRole('radio', { name: /Unassigned/ })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /another department/ }));
    fireEvent.click(within(dialog).getByRole('radio', { name: /Emma Wilson/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reassign' }));

    expect(getWorkspace().tasks[design.id]?.assigneeId).toBe(EMP.emma);
    expect(getWorkspace().employees[EMP.emma]?.currentTaskId).toBe(design.id);
    expect(getWorkspace().employees[EMP.ryan]?.currentTaskId).toBeNull();
    expect(getWorkspace().notifications.at(-1)).toMatchObject({ title: 'Task reassigned' });
  });

  it('lets a busy person take a queued task, since it does not make them active', () => {
    move(
      task('Busy work', { departmentId: DEPT.frontend, assigneeId: EMP.ryan }).id,
      'in_progress',
    );
    const queued = task('Queued', { departmentId: DEPT.frontend, assigneeId: null });
    renderApp(`/tasks?task=${queued.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(screen.getByRole('radio', { name: /Ryan Miller/ })).toBeEnabled();
  });

  it('does not hand an active task to someone who is already busy', () => {
    move(
      task('Busy work', { departmentId: DEPT.frontend, assigneeId: EMP.ryan }).id,
      'in_progress',
    );
    const active = task('Active elsewhere', { departmentId: DEPT.frontend, assigneeId: null });
    unwrap(
      commands.assignTask(USER_ACTOR, {
        taskId: active.id,
        assigneeId: EMP.emma,
        allowCrossDepartment: true,
      }),
    );
    move(active.id, 'in_progress');
    renderApp(`/tasks?task=${active.id}`);

    fireEvent.click(screen.getByRole('button', { name: 'Reassign' }));
    const ryan = screen.getByRole('radio', { name: /Ryan Miller/ });
    expect(ryan).toBeDisabled();
    expect(ryan.closest('label')).toHaveTextContent(
      'Ryan Miller is already working on "Busy work".',
    );
  });

  it('deletes a task after confirmation', async () => {
    const design = task('Design homepage');
    renderApp(`/tasks?task=${design.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(getWorkspace().tasks[design.id]).toBeUndefined();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows a closed task as read-only', () => {
    const design = task('Design homepage');
    move(design.id, 'in_progress', 'in_review', 'done');
    renderApp(`/tasks?task=${design.id}`);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reassign' })).toBeDisabled();
    expect(
      screen.getByText('This task is closed and can no longer be changed.'),
    ).toBeInTheDocument();
  });
});

describe('quick views and deadlines (Phase 1.7)', () => {
  it('filters to overdue work with one click and labels it without relying on colour', () => {
    task('Late launch notes', { deadline: '2020-01-01' });
    task('Future work', { deadline: '2099-01-01' });
    renderApp('/tasks');
    const overdueView = screen.getByRole('button', { name: /^Overdue/ });
    expect(overdueView).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(overdueView);
    expect(screen.getByRole('button', { name: /^Overdue/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const cards = screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'));
    expect(cards).toEqual(['Late launch notes']);
    expect(screen.getByText(/^Overdue · Due/)).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2 tasks')).toBeInTheDocument();
  });

  it('composes status and priority filters from the URL', () => {
    task('High one', { priority: 'high' });
    task('Low one', { priority: 'low' });
    renderApp('/tasks?status=todo&priority=high');
    expect(screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'))).toEqual([
      'High one',
    ]);
  });
});
