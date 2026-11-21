import { useStore } from 'zustand';
import { appStore, type AppState } from './internal/appStore';

export type { AppPhase, AppState } from './internal/appStore';

/** Read-only view of the application lifecycle and save status. */
export function useAppStatus<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}

export function getAppStatus(): AppState {
  return appStore.getState();
}
