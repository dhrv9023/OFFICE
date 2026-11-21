// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceLifecycle } from '@/commands';
import { createWorkspaceLifecycle } from '@/commands/workspaceLifecycle';
import { createSeedWorkspace, OFFICE_LAYOUT } from '@/domain/seed';
import type { WorkspaceState } from '@/domain/types';
import { createIndexedDbStorage } from '@/services/storage/indexedDbStorage';
import { getWorkspace } from '@/stores/workspace';
import { DEPT } from '@/test/factories';
import { createTestClock } from '@/test/harness';
import { freshWorkspace, renderApp } from '@/test/render';

beforeEach(async () => {
  await freshWorkspace();
});

function metric(label: string): string | null | undefined {
  return screen.getByText(label, { selector: 'dt span' }).closest('div')?.querySelector('dd')
    ?.textContent;
}

/** Runs the whole flow through the UI only: no direct command calls. */
function operateCompanyThroughTheUi(router: ReturnType<typeof renderApp>['router']) {
  const go = (path: string) => {
    act(() => {
      void router.navigate(path);
    });
  };

  go('/projects');
  fireEvent.click(screen.getByRole('button', { name: 'New project' }));
  fireEvent.change(screen.getByLabelText('Project name'), {
    target: { value: 'Website relaunch' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  const projectId = Object.keys(getWorkspace().projects)[0] ?? '';
  go(`/projects/${projectId}`);
  fireEvent.click(screen.getByRole('button', { name: 'Activate project' }));

  for (const [title, department, person] of [
    ['Design homepage', DEPT.design, /Sarah Chen/],
    ['Write test plan', DEPT.qa, /Emma Wilson/],
  ] as const) {
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: title } });
    fireEvent.change(within(dialog).getByLabelText('Department'), {
      target: { value: department },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: person }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create task' }));
  }

  go('/tasks');
  const moveVia = (title: string, to: string) => {
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`Change status of "${title}"`) }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`Move to ${to}`) }));
  };
  moveVia('Design homepage', 'In progress');
  moveVia('Design homepage', 'In review');
  moveVia('Design homepage', 'Done');
  moveVia('Write test plan', 'Blocked');
  // Blocking asks for an optional reason first.
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Mark as blocked' })).getByRole('button', {
      name: 'Mark as blocked',
    }),
  );
  return projectId;
}

describe('operating the company through the UI', () => {
  it('updates the dashboard, employee status, progress, activity and notifications', () => {
    const { router } = renderApp('/');
    expect(metric('Active projects')).toBe('0');

    operateCompanyThroughTheUi(router);

    act(() => {
      void router.navigate('/');
    });
    expect(metric('Active projects')).toBe('1');
    expect(metric('In progress')).toBe('0');
    expect(metric('Blocked')).toBe('1');
    expect(metric('Completed')).toBe('1');
    expect(
      within(screen.getByRole('region', { name: 'Current projects' })).getByRole('progressbar'),
    ).toHaveAttribute('aria-valuenow', '50');
    const team = screen.getByRole('region', { name: 'Team' });
    expect(within(team).getByText('Blocked')).toBeInTheDocument();

    expect(getWorkspace().activity.map((event) => event.eventType)).toEqual([
      'project.created',
      'project.status_changed',
      'task.created',
      'task.assigned',
      'task.created',
      'task.assigned',
      'task.status_changed',
      'task.status_changed',
      'task.status_changed',
      'task.status_changed',
    ]);
    expect(getWorkspace().notifications.map((notification) => notification.title)).toEqual([
      'Project created',
      'Project status changed',
      'Task assigned',
      'Task assigned',
      'Ready for review',
      'Task completed',
      'Task blocked',
    ]);
  });

  it('keeps everything after a refresh', async () => {
    const { router } = renderApp('/');
    operateCompanyThroughTheUi(router);
    await act(() => workspaceLifecycle.flush());
    const before = getWorkspace();

    // A new page load: a fresh store and lifecycle reading the same browser database.
    let reloaded: WorkspaceState = createSeedWorkspace();
    const lifecycle = createWorkspaceLifecycle({
      workspace: {
        getState: () => reloaded,
        setState: (next) => {
          reloaded = next;
        },
      },
      app: {
        getState: () => ({
          phase: { status: 'initializing' },
          operation: null,
          save: { state: 'idle' },
        }),
        update: () => undefined,
      },
      storage: createIndexedDbStorage(),
      clock: createTestClock(),
      layout: OFFICE_LAYOUT,
      createSeed: createSeedWorkspace,
      subscribe: () => () => undefined,
    });
    await lifecycle.initialize();
    expect(reloaded).toEqual(before);
    expect(
      Object.values(reloaded.tasks)
        .map((task) => task.status)
        .sort(),
    ).toEqual(['blocked', 'done']);
  });
});
