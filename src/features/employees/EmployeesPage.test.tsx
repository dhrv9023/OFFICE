// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { commands } from '@/commands';
import { USER_ACTOR } from '@/domain/types';
import { getWorkspace } from '@/stores/workspace';
import { DEPT, EMP } from '@/test/factories';
import { unwrap } from '@/test/harness';
import { freshWorkspace, renderApp } from '@/test/render';

beforeEach(async () => {
  await freshWorkspace();
});

function teamCards() {
  const team = screen.getByRole('region', { name: /^Team/ });
  return within(team).getAllByRole('article');
}

describe('employees page', () => {
  it('shows every person with their full name, role, department and status', () => {
    renderApp('/employees');
    const cards = teamCards();
    expect(cards).toHaveLength(5);
    const sarah = cards.find((card) => within(card).queryByRole('heading', { name: 'Sarah Chen' }));
    if (!sarah) throw new Error('Sarah Chen has no card');
    const name = within(sarah).getByRole('heading', { name: 'Sarah Chen' });
    // Names are never cut off: no truncation, they wrap if they must.
    expect(name.className).not.toMatch(/truncate|line-clamp/);
    expect(within(sarah).getByText('UI/UX Designer')).toBeInTheDocument();
    expect(within(sarah).getByText('UI/UX Design')).toBeInTheDocument();
    expect(within(sarah).getByText('Available')).toBeInTheDocument();
  });

  it('aligns card sections across a row with a subgrid', () => {
    renderApp('/employees');
    for (const card of teamCards()) {
      expect(card.className).toContain('grid-rows-subgrid');
      // The subgrid spans one track per direct section.
      expect(card.children).toHaveLength(5);
    }
  });

  it('links the unassigned figure to the unassigned tasks, only when there are some', () => {
    const projectId = unwrap(commands.createProject(USER_ACTOR, { name: 'Portal' })).id;
    const view = renderApp('/employees');
    expect(screen.queryByRole('link', { name: /unassigned: view them/ })).toBeNull();
    expect(screen.getByText('Every task has an owner')).toBeInTheDocument();
    view.unmount();

    unwrap(
      commands.createTask(USER_ACTOR, {
        projectId,
        departmentId: DEPT.frontend,
        title: 'Invoice screens',
      }),
    );
    renderApp('/employees');
    expect(screen.getByRole('link', { name: '1 unassigned: view them' })).toHaveAttribute(
      'href',
      '/tasks?assignee=unassigned',
    );
  });

  it('lists each department with its people and open tasks', () => {
    renderApp('/employees');
    const row = screen.getByRole('listitem', { name: 'Frontend Development' });
    expect(within(row).getByText('1 person')).toBeInTheDocument();
    expect(
      within(row).getByRole('link', { name: '0 open tasks in Frontend Development' }),
    ).toHaveAttribute('href', `/tasks?department=${DEPT.frontend}`);
  });
});

describe('renaming from the Employees page (Phase 1.6)', () => {
  it('renames through the card, and the new name appears on tasks and projects', () => {
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Website' }));
    unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.frontend,
        title: 'Build header',
        assigneeId: EMP.ryan,
      }),
    );
    const page = renderApp('/employees');
    fireEvent.click(screen.getByRole('button', { name: 'Rename Ryan Miller' }));
    const form = screen.getByRole('dialog', { name: 'Rename employee' });
    fireEvent.change(within(form).getByLabelText('New name'), { target: { value: 'Ryan Park' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(screen.getByRole('heading', { name: 'Ryan Park' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ryan Miller' })).toBeNull();
    expect(getWorkspace().employees[EMP.ryan]?.id).toBe(EMP.ryan);
    page.unmount();

    renderApp('/tasks');
    const card = screen.getByRole('article', { name: /Build header/ });
    expect(within(card).getByText('Ryan Park')).toBeInTheDocument();
    cleanup();

    renderApp(`/projects/${project.id}`);
    expect(screen.getAllByText('Ryan Park').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ryan Miller')).toBeNull();
  });
});
