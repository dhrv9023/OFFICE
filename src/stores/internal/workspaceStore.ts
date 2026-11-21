import { createStore, type StoreApi } from 'zustand/vanilla';
import { createSeedWorkspace } from '@/domain/seed';
import type { WorkspaceState } from '@/domain/types';

/**
 * INTERNAL — the writable store holding the canonical business state.
 *
 * It holds data only: no actions. Only `commands/` may import this module (enforced
 * by ESLint); everything else reads through `stores/workspace.ts`.
 */
export type WorkspaceStore = StoreApi<WorkspaceState>;

export function createWorkspaceStore(
  initial: WorkspaceState = createSeedWorkspace(),
): WorkspaceStore {
  return createStore<WorkspaceState>()(() => initial);
}

export const workspaceStore: WorkspaceStore = createWorkspaceStore();
