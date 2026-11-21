import { useEffect, type ReactNode } from 'react';
import { workspaceLifecycle } from '@/commands';
import { useAppStatus } from '@/stores/appStatus';
import { BootGate } from './BootGate';

/** Starts hydration once and gates the application on the result. */
export function AppBoot({ children }: { children: ReactNode }) {
  const phase = useAppStatus((state) => state.phase);

  useEffect(() => {
    // Idempotent, so React StrictMode's double effect run starts it only once.
    void workspaceLifecycle.initialize();
  }, []);

  return (
    <BootGate phase={phase} lifecycle={workspaceLifecycle}>
      {children}
    </BootGate>
  );
}
