// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/domain/result';
import type { AppPhase } from '@/stores/appStatus';
import { BootGate } from './BootGate';

function fakeLifecycle() {
  return {
    retry: vi.fn(() => Promise.resolve()),
    continueWithoutSaving: vi.fn(() => ok(undefined)),
    exportRecoveryData: vi.fn(() => Promise.resolve(ok({ filename: 'x.json', contents: '{}' }))),
    importWorkspace: vi.fn(() =>
      Promise.resolve(
        ok({
          summary: {
            departments: 5,
            employees: 5,
            projects: 0,
            tasks: 0,
            meetings: 0,
            activityEvents: 0,
            notifications: 0,
          },
          migrated: false,
        }),
      ),
    ),
    resetWorkspace: vi.fn(() => Promise.resolve(ok(undefined))),
    repairWorkspace: vi.fn(() => Promise.resolve(ok({ repaired: [] }))),
  };
}

function renderGate(phase: AppPhase) {
  const lifecycle = fakeLifecycle();
  render(
    <BootGate phase={phase} lifecycle={lifecycle}>
      <p>The application</p>
    </BootGate>,
  );
  return lifecycle;
}

describe('BootGate', () => {
  it('shows only a loading screen while the workspace is opening', () => {
    renderGate({ status: 'initializing' });
    expect(screen.getByRole('status')).toHaveTextContent('Opening your workspace…');
    expect(screen.queryByText('The application')).not.toBeInTheDocument();
  });

  it('renders the application once ready', () => {
    renderGate({ status: 'ready', storage: 'persistent' });
    expect(screen.getByText('The application')).toBeInTheDocument();
  });

  it('shows the recovery screen, not the app, when saved data is unusable', () => {
    renderGate({
      status: 'recovery_required',
      reason: 'unsupported_version',
      message: 'This data uses schema version 9.',
      details: [],
      repairs: [],
    });
    expect(screen.getByRole('heading', { name: /needs attention/ })).toBeInTheDocument();
    expect(screen.getByText('This data uses schema version 9.')).toBeInTheDocument();
    expect(screen.queryByText('The application')).not.toBeInTheDocument();
  });

  it('shows the storage error screen with retry and a temporary workspace option', () => {
    const lifecycle = renderGate({ status: 'error', kind: 'unavailable', message: 'No storage.' });
    expect(screen.getByRole('alert')).toHaveTextContent('No storage.');
    expect(screen.queryByText('The application')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue without saving' }));
    expect(lifecycle.retry).toHaveBeenCalledOnce();
    expect(lifecycle.continueWithoutSaving).toHaveBeenCalledOnce();
  });
});
