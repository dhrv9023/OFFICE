import type { Clock } from '@/domain/clock';
import { createSnapshot } from '@/domain/snapshot/format';
import type { WorkspaceState } from '@/domain/types';
import { describeStorageError, type StorageErrorKind, type StorageService } from './types';

export type SaveStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'saving' }
  | { readonly state: 'saved'; readonly at: string }
  | { readonly state: 'error'; readonly kind: StorageErrorKind; readonly message: string };

export interface AutosaverDependencies {
  readonly storage: StorageService;
  readonly clock: Clock;
  /** The current canonical workspace state. */
  readonly getState: () => WorkspaceState;
  /** Subscribes to workspace changes; returns an unsubscribe function. */
  readonly subscribe: (listener: () => void) => () => void;
  readonly onStatus: (status: SaveStatus) => void;
}

export interface Autosaver {
  /** Begin saving changes. `baseline` is the state already on disk at `revision`. */
  start(baseline: WorkspaceState, revision: number | null): void;
  /** Stop reacting to changes and wait for any write in flight to settle. */
  pause(): Promise<void>;
  /** Start reacting again and save anything that changed while paused. */
  resume(): void;
  /** Resolves once every change made so far has been written (or a write failed). */
  flush(): Promise<void>;
  /** Try again after a failed save. */
  retry(): Promise<void>;
  /**
   * After a conflict (another tab saved newer data), and only on the user's explicit
   * choice: keep this tab's version. The newer copy on disk is first stored as a
   * backup, then replaced. Nothing is ever overwritten without this call.
   */
  overwrite(): Promise<void>;
}

/**
 * Writes the workspace to storage whenever it changes — immediately, with no
 * timers — while guaranteeing that the copy on disk never goes backwards:
 *
 *  - SINGLE FLIGHT: at most one write is in progress at any time, so two writes
 *    can never finish out of order.
 *  - LATEST WINS: each write reads the state at the moment it starts. Changes that
 *    arrive during a write are not queued one by one; when the write finishes, one
 *    further write saves the newest state. Intermediate states are skipped.
 *  - NO REDUNDANT WRITES: states are immutable, so "unchanged" is a reference check.
 *  - REVISION CHECKED: every write tells storage which revision it expects to
 *    replace. If something else (another tab) wrote in between, storage refuses
 *    and the error is surfaced instead of overwriting newer data.
 *
 * After a failed write the state stays dirty; the next change or `retry()` tries again.
 */
export function createAutosaver(dependencies: AutosaverDependencies): Autosaver {
  const { storage, clock, getState, subscribe, onStatus } = dependencies;

  /** The exact state object known to be on disk. */
  let saved: WorkspaceState | null = null;
  let revision: number | null = null;
  let unsubscribe: (() => void) | null = null;
  let draining = false;
  let settled: Promise<void> = Promise.resolve();
  /** Set by `overwrite()`: the next write replaces whatever is on disk (after a backup). */
  let overwriteNext = false;

  const drain = async (): Promise<void> => {
    try {
      while (unsubscribe !== null) {
        const target = getState();
        if (target === saved) return;

        onStatus({ state: 'saving' });
        const savedAt = clock.now();
        try {
          if (overwriteNext) {
            const newer = await storage.load();
            if (newer !== null) {
              await storage.saveBackup({
                createdAt: savedAt,
                reason: 'pre-overwrite',
                payload: newer,
              });
            }
          }
          revision = await storage.save(createSnapshot(target, savedAt), {
            expectedRevision: overwriteNext ? 'any' : revision,
          });
          overwriteNext = false;
          saved = target;
          onStatus({ state: 'saved', at: savedAt });
        } catch (error) {
          onStatus({ state: 'error', ...describeStorageError(error) });
          return;
        }
      }
    } finally {
      draining = false;
    }
  };

  const schedule = (): void => {
    if (draining || unsubscribe === null) return;
    draining = true;
    settled = drain();
  };

  const listen = (): void => {
    unsubscribe ??= subscribe(schedule);
  };

  const waitUntilSettled = async (): Promise<void> => {
    // A write may be started while we wait, so re-check after each one.
    do {
      await settled;
    } while (draining);
  };

  return {
    start(baseline, baselineRevision) {
      saved = baseline;
      revision = baselineRevision;
      listen();
      schedule();
    },

    async pause() {
      unsubscribe?.();
      unsubscribe = null;
      await waitUntilSettled();
    },

    resume() {
      listen();
      schedule();
    },

    flush: waitUntilSettled,

    async retry() {
      schedule();
      await waitUntilSettled();
    },

    async overwrite() {
      overwriteNext = true;
      // Force a write even if nothing changed since the failed attempt.
      saved = null;
      schedule();
      await waitUntilSettled();
    },
  };
}
