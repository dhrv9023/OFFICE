import { createStore, type StoreApi } from 'zustand/vanilla';
import type { SnapshotErrorKind } from '@/domain/snapshot/restore';
import type { SaveStatus } from '@/services/storage/autosave';
import type { StorageErrorKind } from '@/services/storage/types';

/**
 * Where the application is in its start-up lifecycle.
 *
 *  initializing       storage is being opened and the workspace loaded
 *  ready              the workspace is loaded; commands are allowed
 *  recovery_required  saved data exists but cannot be used; it has been left
 *                     untouched and the user must choose what to do
 *  error              storage itself could not be used
 */
export type AppPhase =
  | { readonly status: 'initializing' }
  | {
      readonly status: 'ready';
      /** `memory` = the user chose to continue without saving after a storage error. */
      readonly storage: 'persistent' | 'memory';
    }
  | {
      readonly status: 'recovery_required';
      readonly reason: SnapshotErrorKind;
      readonly message: string;
      readonly details: readonly string[];
      /** Fixes the user may choose to apply (see `repairWorkspace`). Empty if none. */
      readonly repairs: readonly string[];
    }
  | { readonly status: 'error'; readonly kind: StorageErrorKind; readonly message: string };

export interface AppState {
  readonly phase: AppPhase;
  /** Set while the whole workspace is being replaced; commands are held off meanwhile. */
  readonly operation: 'importing' | 'resetting' | 'repairing' | null;
  readonly save: SaveStatus;
}

/**
 * INTERNAL — runtime status of the application (not business data, never persisted).
 * Written only by the workspace lifecycle in `commands/`; read through `stores/appStatus.ts`.
 */
export type AppStore = StoreApi<AppState>;

export const INITIAL_APP_STATE: AppState = {
  phase: { status: 'initializing' },
  operation: null,
  save: { state: 'idle' },
};

export function createAppStore(): AppStore {
  return createStore<AppState>()(() => INITIAL_APP_STATE);
}

export const appStore: AppStore = createAppStore();
