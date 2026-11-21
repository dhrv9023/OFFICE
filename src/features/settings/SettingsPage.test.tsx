// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commands, workspaceLifecycle } from '@/commands';
import { createSeedWorkspace } from '@/domain/seed';
import { USER_ACTOR } from '@/domain/types';
import { downloadTextFile } from '@/services/download';
import { usePreferences } from '@/stores/preferencesStore';
import { getWorkspace } from '@/stores/workspace';
import { unwrap } from '@/test/harness';
import { freshWorkspace, renderApp } from '@/test/render';

vi.mock('@/services/download', () => ({ downloadTextFile: vi.fn() }));

beforeEach(async () => {
  vi.mocked(downloadTextFile).mockClear();
  localStorage.clear();
  usePreferences.setState({ theme: 'dark' });
  await freshWorkspace();
});

/** The import error message (the toaster keeps its own, empty, alert region on the page). */
async function importAlert(): Promise<HTMLElement> {
  const text = await screen.findByText(/The file was not imported\./);
  const alert = text.closest<HTMLElement>('[role="alert"]');
  if (!alert) throw new Error('Import error is not in an alert region.');
  return alert;
}

function chooseFile(contents: string, name = 'export.json') {
  const input = screen.getByLabelText('Workspace file to import');
  fireEvent.change(input, { target: { files: [new File([contents], name)] } });
}

/** A valid export of a workspace that contains one project called "Imported". */
function exportWithProject(): string {
  unwrap(commands.createProject(USER_ACTOR, { name: 'Imported' }));
  const file = unwrap(workspaceLifecycle.exportWorkspace()).contents;
  return file;
}

describe('settings: appearance', () => {
  it('switches theme and remembers the choice', () => {
    renderApp('/settings');
    const light = screen.getByRole('radio', { name: /Light/ });
    expect(screen.getByRole('radio', { name: /Dark/ })).toBeChecked();

    fireEvent.click(light);
    expect(light).toBeChecked();
    expect(usePreferences.getState().theme).toBe('light');
    expect(localStorage.getItem('project-hq:theme')).toBe('light');

    fireEvent.click(screen.getByRole('radio', { name: /System/ }));
    expect(localStorage.getItem('project-hq:theme')).toBe('system');
  });
});

describe('settings: tabs', () => {
  it('moves between sections with the keyboard and keeps the tab in the URL', () => {
    const { router } = renderApp('/settings');
    const appearance = screen.getByRole('tab', { name: 'Appearance' });
    expect(appearance).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(appearance, { key: 'ArrowRight' });
    const data = screen.getByRole('tab', { name: 'Workspace data' });
    expect(data).toHaveAttribute('aria-selected', 'true');
    expect(data).toHaveFocus();
    expect(router.state.location.search).toBe('?tab=data');

    fireEvent.keyDown(data, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Storage' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('settings: export', () => {
  it('downloads the workspace as a dated JSON file', () => {
    renderApp('/settings?tab=data');
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(downloadTextFile).toHaveBeenCalledOnce();
    const [filename, contents] = vi.mocked(downloadTextFile).mock.calls[0] ?? [];
    expect(filename).toMatch(/^project-hq-workspace-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(contents ?? '') as unknown).toMatchObject({
      format: 'project-hq-workspace',
      summary: { employees: 5 },
    });
    expect(screen.getByText('Workspace exported')).toBeInTheDocument();
  });
});

describe('settings: import', () => {
  it('rejects an invalid file with an explanation and changes nothing', async () => {
    renderApp('/settings?tab=data');
    const before = getWorkspace();
    chooseFile('{ "not": "a workspace" }');

    const alert = await importAlert();
    expect(alert).toHaveTextContent('The file was not imported.');
    expect(alert).toHaveTextContent('This is not a Project HQ workspace.');
    expect(alert).toHaveTextContent('Your workspace has not been changed.');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(getWorkspace()).toBe(before);
  });

  it('lists the problems found in a damaged file', async () => {
    renderApp('/settings?tab=data');
    const document = JSON.parse(unwrap(workspaceLifecycle.exportWorkspace()).contents) as {
      workspace: { employees: { name: unknown }[] };
    };
    const first = document.workspace.employees[0];
    if (first) first.name = 42;
    chooseFile(JSON.stringify(document));

    const alert = await importAlert();
    expect(within(alert).getByText('1 problem found')).toBeInTheDocument();
    expect(
      within(alert).getByText('workspace.employees[0].name must be text.'),
    ).toBeInTheDocument();
  });

  it('asks for confirmation, shows what will change, and does nothing on cancel', async () => {
    const file = exportWithProject();
    await act(() => workspaceLifecycle.resetWorkspace());
    renderApp('/settings?tab=data');
    const before = getWorkspace();

    chooseFile(file, 'backup.json');
    const dialog = await screen.findByRole('alertdialog', { name: 'Replace your workspace?' });
    expect(dialog).toHaveTextContent('backup.json');
    const projects = within(dialog).getByRole('row', { name: /Projects/ });
    expect(projects).toHaveTextContent(/Projects\s*0\s*1/);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(getWorkspace()).toBe(before);
  });

  it('replaces the workspace after confirmation', async () => {
    const file = exportWithProject();
    await act(() => workspaceLifecycle.resetWorkspace());
    renderApp('/settings?tab=data');

    chooseFile(file);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace workspace' }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(Object.values(getWorkspace().projects).map((project) => project.name)).toEqual([
      'Imported',
    ]);
    expect(screen.getByText('Workspace imported')).toBeInTheDocument();
  });
});

describe('settings: reset', () => {
  it('requires confirmation, and cancel keeps everything', () => {
    unwrap(commands.createProject(USER_ACTOR, { name: 'Keep me' }));
    renderApp('/settings?tab=data');
    fireEvent.click(screen.getByRole('button', { name: 'Reset…' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Reset the workspace?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(Object.keys(getWorkspace().projects)).toHaveLength(1);
  });

  it('restores the starting company once confirmed', async () => {
    unwrap(commands.createProject(USER_ACTOR, { name: 'Gone soon' }));
    renderApp('/settings?tab=data');
    fireEvent.click(screen.getByRole('button', { name: 'Reset…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset workspace' }));

    await waitFor(() => {
      expect(screen.getByText('Workspace reset')).toBeInTheDocument();
    });
    expect(getWorkspace()).toEqual(createSeedWorkspace());
  });
});

describe('settings: storage', () => {
  it('reports that the workspace is ready and saved automatically', async () => {
    renderApp('/settings?tab=storage');
    expect(screen.getByText('Ready')).toBeInTheDocument();
    act(() => {
      unwrap(commands.createProject(USER_ACTOR, { name: 'Saved' }));
    });
    await act(() => workspaceLifecycle.flush());
    expect(screen.getByText(/All changes saved automatically/)).toBeInTheDocument();
    expect(screen.queryByText(/IndexedDB/)).not.toBeInTheDocument();
  });
});
