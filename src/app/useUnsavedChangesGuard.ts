import { useEffect } from 'react';
import { getAppStatus, type AppState } from '@/stores/appStatus';

/**
 * Asks the browser to confirm leaving the page while changes are not on disk:
 * a save is in flight, the last save failed, or storage is unavailable. Never
 * prompts when everything is saved.
 */
export function useUnsavedChangesGuard(read: () => AppState = getAppStatus): void {
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const { phase, save } = read();
      const temporary = phase.status === 'ready' && phase.storage === 'memory';
      if (save.state === 'saving' || save.state === 'error' || temporary) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [read]);
}
