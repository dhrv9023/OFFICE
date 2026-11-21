import { create } from 'zustand';
import type { TaskId } from '@/domain/ids';

/** Which task is waiting for a blocked reason (UI state only, never persisted). */
export const useBlockPrompt = create<{ taskId: TaskId | null }>()(() => ({ taskId: null }));

/** Asks why a task is blocked before moving it (from the board, the menu or the drawer). */
export function requestBlock(taskId: TaskId): void {
  useBlockPrompt.setState({ taskId });
}
