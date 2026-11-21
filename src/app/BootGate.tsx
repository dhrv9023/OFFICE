import type { ReactNode } from 'react';
import type { WorkspaceLifecycle } from '@/commands';
import type { AppPhase } from '@/stores/appStatus';
import { LoadingScreen } from './boot/LoadingScreen';
import { RecoveryScreen } from './boot/RecoveryScreen';
import { StorageErrorScreen } from './boot/StorageErrorScreen';

interface BootGateProps {
  phase: AppPhase;
  lifecycle: Pick<
    WorkspaceLifecycle,
    | 'retry'
    | 'continueWithoutSaving'
    | 'exportRecoveryData'
    | 'importWorkspace'
    | 'resetWorkspace'
    | 'repairWorkspace'
  >;
  children: ReactNode;
}

/**
 * Renders the application only when the workspace is ready. Until then the user
 * sees a loading, storage-error or recovery screen — never an empty or
 * half-loaded company, and nothing that could run a command.
 */
export function BootGate({ phase, lifecycle, children }: BootGateProps) {
  switch (phase.status) {
    case 'initializing':
      return <LoadingScreen />;
    case 'ready':
      return children;
    case 'recovery_required':
      return (
        <RecoveryScreen
          message={phase.message}
          details={phase.details}
          repairs={phase.repairs}
          lifecycle={lifecycle}
        />
      );
    case 'error':
      return (
        <StorageErrorScreen
          message={phase.message}
          onRetry={() => {
            void lifecycle.retry();
          }}
          onContinueWithoutSaving={() => {
            lifecycle.continueWithoutSaving();
          }}
        />
      );
  }
}
