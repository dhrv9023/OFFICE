// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePreferences } from '@/stores/preferencesStore';
import { freshWorkspace, renderApp } from '@/test/render';
import { NAV_ITEMS, ROUTES } from './navigation';

function primaryNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Primary' });
}

beforeEach(async () => {
  localStorage.clear();
  usePreferences.setState({ theme: 'dark', sidebarCollapsed: false });
  await freshWorkspace();
});

describe('application shell', () => {
  it('links to every section from the sidebar', () => {
    renderApp(ROUTES.dashboard);
    const nav = primaryNav();
    for (const item of NAV_ITEMS) {
      expect(within(nav).getByRole('link', { name: item.label })).toHaveAttribute(
        'href',
        item.path,
      );
    }
  });

  it.each(NAV_ITEMS.map((item) => [item.path, item.label]))(
    'renders %s with its title as the page heading',
    (path, label) => {
      renderApp(path);
      expect(screen.getByRole('heading', { level: 1, name: label })).toBeInTheDocument();
    },
  );

  it('highlights only the current route', () => {
    renderApp(ROUTES.tasks);
    const nav = primaryNav();
    expect(within(nav).getByRole('link', { name: 'Tasks' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    for (const label of ['Dashboard', 'Projects', 'Settings']) {
      expect(within(nav).getByRole('link', { name: label })).not.toHaveAttribute('aria-current');
    }
  });

  it('updates the highlight and title when navigating', () => {
    renderApp(ROUTES.dashboard);
    fireEvent.click(within(primaryNav()).getByRole('link', { name: 'Employees' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
    expect(within(primaryNav()).getByRole('link', { name: 'Employees' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('marks the current page in the breadcrumb and gives the page one display title', () => {
    renderApp(ROUTES.projects);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Projects')).toHaveAttribute('aria-current', 'page');
    expect(within(crumbs).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
  });

  it('collapses the sidebar, keeps labels accessible and remembers the choice', () => {
    renderApp(ROUTES.dashboard);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(primaryNav()).getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(localStorage.getItem('project-hq:sidebar-collapsed')).toBe('true');
  });

  it('opens and closes the mobile navigation drawer', () => {
    renderApp(ROUTES.dashboard);
    const opener = screen.getByRole('button', { name: 'Open navigation' });
    opener.focus();
    fireEvent.click(opener);

    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    expect(within(drawer).getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes the mobile drawer after following a link', () => {
    renderApp(ROUTES.dashboard);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    fireEvent.click(within(drawer).getByRole('link', { name: 'Activity' }));
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument();
  });

  it('switches theme from the top bar and remembers it', () => {
    renderApp(ROUTES.dashboard);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(usePreferences.getState().theme).toBe('light');
    expect(localStorage.getItem('project-hq:theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
  });

  it('opens the workspace menu with keyboard support', async () => {
    renderApp(ROUTES.dashboard);
    const trigger = screen.getByRole('button', { name: 'Workspace menu' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu', { name: 'Workspace menu' });
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(within(menu).getByRole('menuitem', { name: 'Export workspace' })).toHaveFocus();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Settings' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('shows a not-found page for unknown paths', () => {
    renderApp('/does-not-exist');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toBeInTheDocument();
  });
});
