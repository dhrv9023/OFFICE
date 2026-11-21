// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { commands } from '@/commands';
import { USER_ACTOR, type Project } from '@/domain/types';
import { getWorkspace } from '@/stores/workspace';
import { DEPT, EMP } from '@/test/factories';
import { unwrap } from '@/test/harness';
import { freshWorkspace, renderApp } from '@/test/render';

beforeEach(async () => {
  await freshWorkspace();
});

function project(name: string, extra: Parameters<typeof commands.createProject>[1] = { name }) {
  return unwrap(commands.createProject(USER_ACTOR, { ...extra, name }));
}

function setStatus(projectId: Project['id'], status: Project['status']) {
  unwrap(commands.updateProject(USER_ACTOR, { projectId, patch: { status } }));
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function cardNames(): string[] {
  return screen
    .queryAllByRole('article')
    .map((card) => within(card).getByRole('heading').textContent);
}

describe('projects list', () => {
  it('shows an empty state that leads to creating the first project', () => {
    renderApp('/projects');
    expect(screen.getByRole('heading', { name: 'No projects yet' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument();
  });

  it('creates a project through the form and opens it', async () => {
    const { router } = renderApp('/projects');
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fill('Project name', 'Website relaunch');
    fill('Description', 'Faster marketing site');
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'website' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } });
    fill('Deadline', '2026-12-18');
    fill('Objectives', 'Double sign-ups\n\n  Faster pages  ');
    fill('Requirements', 'Accessible');
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    const created = Object.values(getWorkspace().projects)[0];
    expect(created).toMatchObject({
      name: 'Website relaunch',
      description: 'Faster marketing site',
      category: 'website',
      priority: 'high',
      deadline: '2026-12-18',
      objectives: ['Double sign-ups', 'Faster pages'],
      requirements: ['Accessible'],
      status: 'planning',
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/projects/${created?.id ?? ''}`);
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Website relaunch' })).toBeInTheDocument();
    expect(screen.getByText('Project created')).toBeInTheDocument();
  });

  it('shows domain validation errors next to the field and keeps the dialog open', () => {
    renderApp('/projects');
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    const name = screen.getByLabelText('Project name');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Project name is required.');
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument();
    expect(getWorkspace().projects).toEqual({});
  });

  it('shows each project with status, priority, progress, tasks and people', () => {
    const created = project('Website relaunch', {
      name: '',
      description: 'Marketing site',
      priority: 'high',
    });
    setStatus(created.id, 'active');
    const design = unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: created.id,
        departmentId: DEPT.design,
        title: 'Design',
        assigneeId: EMP.sarah,
      }),
    );
    unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: created.id,
        departmentId: DEPT.qa,
        title: 'Test',
      }),
    );
    for (const status of ['in_progress', 'in_review', 'done'] as const) {
      unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: design.id, status }));
    }

    renderApp('/projects');
    const card = screen.getByRole('article');
    expect(within(card).getByRole('link', { name: 'Website relaunch' })).toHaveAttribute(
      'href',
      `/projects/${created.id}`,
    );
    expect(card).toHaveTextContent('Marketing site');
    expect(within(card).getByText('Active')).toBeInTheDocument();
    expect(within(card).getByText('High priority')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(card).toHaveTextContent('1 of 2 tasks completed');
    expect(card).toHaveTextContent('Sarah Chen');
    expect(card).toHaveTextContent(/Created/);
  });

  it('filters by search, status and priority, and clears filters', () => {
    const website = project('Website', { name: '', priority: 'high' });
    setStatus(website.id, 'active');
    project('Billing API', { name: '', priority: 'low' });
    project('Mobile app', { name: '', priority: 'high', description: 'iOS and Android' });

    renderApp('/projects');
    expect(cardNames()).toHaveLength(3);

    fill('Search projects', 'android');
    expect(cardNames()).toEqual(['Mobile app']);
    expect(screen.getByText('Showing 1 of 3 projects')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } });
    expect(cardNames()).toEqual(['Website']);

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'name' } });
    expect(cardNames()).toEqual(['Mobile app', 'Website']);

    fill('Search projects', 'nothing like this');
    expect(screen.getByRole('heading', { name: 'No projects match' })).toBeInTheDocument();
  });
});

describe('project details and lifecycle', () => {
  it('activates a planning project and the dashboard counts it', () => {
    const created = project('Portal');
    const { router } = renderApp(`/projects/${created.id}`);
    expect(screen.getByRole('heading', { level: 1, name: 'Portal' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'href',
      '/projects',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activate project' }));
    expect(getWorkspace().projects[created.id]?.status).toBe('active');
    expect(screen.getByText('"Portal" is now active.')).toBeInTheDocument();
    expect(getWorkspace().activity.at(-1)).toMatchObject({ eventType: 'project.status_changed' });

    act(() => {
      void router.navigate('/');
    });
    const tile = screen.getByText('Active projects', { selector: 'dt span' }).closest('div');
    expect(tile?.querySelector('dd')).toHaveTextContent('1');
  });

  it('only offers lifecycle moves the domain allows, explaining blocked ones', () => {
    const created = project('Portal');
    setStatus(created.id, 'active');
    unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: created.id,
        departmentId: DEPT.qa,
        title: 'Test',
      }),
    );
    renderApp(`/projects/${created.id}`);

    const complete = screen.getByRole('button', { name: 'Mark as completed' });
    expect(complete).toBeDisabled();
    expect(screen.getByText(/still has 1 open task/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }));
    const menu = screen.getByRole('menu');
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.firstElementChild?.nextSibling?.textContent ?? item.textContent);
    expect(labels.join('|')).toMatch(/Put on hold/);
    expect(labels.join('|')).toMatch(/Archive project/);
    expect(labels.join('|')).not.toMatch(/Move back to planning/);
  });

  it('puts a project on hold and resumes it', () => {
    const created = project('Portal');
    setStatus(created.id, 'active');
    renderApp(`/projects/${created.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Put on hold/ }));
    expect(getWorkspace().projects[created.id]?.status).toBe('on_hold');
    fireEvent.click(screen.getByRole('button', { name: 'Resume project' }));
    expect(getWorkspace().projects[created.id]?.status).toBe('active');
  });

  it('edits project details', () => {
    const created = project('Portal');
    renderApp(`/projects/${created.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Edit details/ }));

    const dialog = screen.getByRole('dialog', { name: 'Edit project' });
    expect(within(dialog).getByLabelText('Project name')).toHaveValue('Portal');
    fireEvent.change(within(dialog).getByLabelText('Project name'), {
      target: { value: 'Customer portal' },
    });
    fireEvent.change(within(dialog).getByLabelText('Priority'), { target: { value: 'critical' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(getWorkspace().projects[created.id]).toMatchObject({
      name: 'Customer portal',
      priority: 'critical',
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Customer portal' })).toBeInTheDocument();
  });

  it('confirms before archiving, then makes the project read-only until restored', () => {
    const created = project('Portal');
    const task = unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: created.id,
        departmentId: DEPT.qa,
        title: 'Test',
      }),
    );
    renderApp(`/projects/${created.id}`);

    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Archive project/ }));
    const confirm = screen.getByRole('alertdialog', { name: 'Archive project?' });
    expect(confirm).toHaveTextContent(/read-only/);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Archive project' }));
    expect(getWorkspace().projects[created.id]?.status).toBe('archived');

    expect(screen.getByText(/archived and read-only/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Change status of "Test"/ }));
    expect(screen.getByRole('menuitem', { name: /No moves available/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(getWorkspace().tasks[task.id]?.status).toBe('todo');

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Restore to planning' }));
    expect(getWorkspace().projects[created.id]?.status).toBe('planning');
    expect(screen.getByRole('button', { name: 'Add task' })).toBeEnabled();
  });

  it('deletes a project after confirmation', async () => {
    const created = project('Portal');
    const { router } = renderApp(`/projects/${created.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'More project actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete project/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(getWorkspace().projects).toEqual({});
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/projects');
    });
  });

  it('shows a helpful page for a project that does not exist', () => {
    renderApp('/projects/prj_missing');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Project not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to projects' })).toBeInTheDocument();
  });
});
