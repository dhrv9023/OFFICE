import { useStore } from 'zustand';
import type { WorkspaceState } from '@/domain/types';
import { workspaceStore } from './internal/workspaceStore';

/**
 * Read-only access to the business state. There is intentionally no setter here:
 * all changes go through `commands/`.
 *
 * Selectors that build new arrays/objects must be wrapped with zustand's
 * `useShallow` at the call site (or return primitives / stored references).
 */
export function useWorkspace<T>(selector: (state: WorkspaceState) => T): T {
  return useStore(workspaceStore, selector);
}

export function getWorkspace(): WorkspaceState {
  return workspaceStore.getState();
}

/** Subscribe to changes outside React (e.g. the Phaser bridge). Returns an unsubscribe function. */
export function subscribeWorkspace(
  listener: (state: WorkspaceState, previous: WorkspaceState) => void,
): () => void {
  return workspaceStore.subscribe(listener);
}
