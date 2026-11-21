// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/domain/result';
import { downloadTextFile } from '@/services/download';
import { LoadingScreen } from './LoadingScreen';
import { RecoveryScreen } from './RecoveryScreen';
import { StorageErrorScreen } from './StorageErrorScreen';

vi.mock('@/services/download', () => ({ downloadTextFile: vi.fn() }));

function fakeLifecycle() {
  return {
    retry: vi.fn(() => Promise.resolve()),
    exportRecoveryData: vi.fn(() =>
      Promise.resolve(ok({ filename: 'project-hq-recovery-2026-02-01.json', contents: '{}' })),
    ),
    importWorkspace: vi.fn(() =>
      Promise.resolve(
        err({
          kind: 'invalid_relationships' as const,
          message: 'The workspace data is inconsistent (1 problem).',
          details: ['Task "x" belongs to a missing project.'],
        }),
      ),
    ),
    resetWorkspace: vi.fn(() => Promise.resolve(ok(undefined))),
    repairWorkspace: vi.fn(() => Promise.resolve(ok({ repaired: ['Reopen "X" as active.'] }))),
  };
}

function renderRecovery() {
  const lifecycle = fakeLifecycle();
  render(
    <RecoveryScreen
      message="This data uses schema version 9."
      details={['Expected version 1.']}
      lifecycle={lifecycle}
    />,
  );
  return lifecycle;
}

describe('LoadingScreen', () => {
  it('announces that the workspace is loading', () => {
    render(<LoadingScreen />);
    expect(screen.getByRole('status')).toHaveTextContent('Opening your workspace…');
  });
});

describe('StorageErrorScreen', () => {
  it('explains the problem and offers retry or a temporary workspace', () => {
    const onRetry = vi.fn();
    const onContinue = vi.fn();
    render(
      <StorageErrorScreen
        message="No IndexedDB."
        onRetry={onRetry}
        onContinueWithoutSaving={onContinue}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No IndexedDB.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue without saving' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onContinue).toHaveBeenCalledOnce();
  });
});

describe('RecoveryScreen', () => {
  it('shows what is wrong and that nothing was deleted', () => {
    renderRecovery();
    expect(screen.getByRole('heading', { name: /needs attention/ })).toBeInTheDocument();
    expect(screen.getByText('This data uses schema version 9.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been deleted or replaced/)).toBeInTheDocument();
    expect(screen.getByText('Expected version 1.')).toBeInTheDocument();
  });

  it('downloads the saved data', async () => {
    const lifecycle = renderRecovery();
    fireEvent.click(screen.getByRole('button', { name: 'Download the saved data' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Downloaded project-hq-recovery-2026-02-01.json.',
    );
    expect(lifecycle.exportRecoveryData).toHaveBeenCalledOnce();
    expect(downloadTextFile).toHaveBeenCalledWith('project-hq-recovery-2026-02-01.json', '{}');
  });

  it('reports why an import file was rejected', async () => {
    const lifecycle = renderRecovery();
    const file = new File(['{"bad":true}'], 'export.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Workspace export file'), { target: { files: [file] } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The workspace data is inconsistent (1 problem).');
    expect(alert).toHaveTextContent('Task "x" belongs to a missing project.');
    expect(lifecycle.importWorkspace).toHaveBeenCalledWith('{"bad":true}');
  });

  it('asks for confirmation before erasing, and can be cancelled', async () => {
    const lifecycle = renderRecovery();
    fireEvent.click(screen.getByRole('button', { name: 'Start fresh…' }));
    expect(lifecycle.resetWorkspace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Erase and start fresh' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start fresh…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Erase and start fresh' }));
    await waitFor(() => {
      expect(lifecycle.resetWorkspace).toHaveBeenCalledOnce();
    });
  });

  it('can try loading again', async () => {
    const lifecycle = renderRecovery();
    fireEvent.click(screen.getByRole('button', { name: 'Try loading again' }));
    await waitFor(() => {
      expect(lifecycle.retry).toHaveBeenCalledOnce();
    });
  });
});

describe('RecoveryScreen repair', () => {
  it('is hidden when no repair is available', () => {
    renderRecovery();
    expect(
      screen.queryByRole('heading', { name: 'A repair is available' }),
    ).not.toBeInTheDocument();
  });

  it('lists the repair, mentions the backup, and applies it only after confirmation', async () => {
    const lifecycle = fakeLifecycle();
    render(
      <RecoveryScreen
        message="The workspace data is inconsistent (1 problem)."
        details={['Project "Website" is marked completed but still has 1 open task.']}
        repairs={['Reopen "Website" as active (it is marked completed but has 1 open task).']}
        lifecycle={lifecycle}
      />,
    );
    expect(screen.getByRole('heading', { name: 'A repair is available' })).toBeInTheDocument();
    expect(screen.getByText(/Reopen "Website" as active/)).toBeInTheDocument();
    expect(screen.getByText(/kept as a backup in this browser first/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Repair…' }));
    expect(lifecycle.repairWorkspace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(lifecycle.repairWorkspace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Repair…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply repair and open' }));
    await waitFor(() => {
      expect(lifecycle.repairWorkspace).toHaveBeenCalledOnce();
    });
  });
});
