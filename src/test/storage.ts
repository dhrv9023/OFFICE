import type { WorkspaceSnapshot } from '@/domain/snapshot/format';
import { createMemoryStorage } from '@/services/storage/memoryStorage';
import type { SaveOptions, StorageService } from '@/services/storage/types';

type Method = 'open' | 'load' | 'save' | 'saveBackup' | 'clear' | 'listBackups';

export interface ControlledStorage {
  readonly storage: StorageService;
  /** Every save attempt, in call order (including ones that then failed). */
  readonly saves: { snapshot: WorkspaceSnapshot; options: SaveOptions }[];
  /** Make every call to `method` reject with `error` until `heal` is called. */
  fail(method: Method, error: unknown): void;
  heal(method?: Method): void;
  /** Hold all saves until the returned function is called. */
  holdSaves(): () => void;
  /** The largest number of saves that were in progress at the same time. */
  maxConcurrentSaves(): number;
}

/** Wraps a StorageService so tests can inject failures and control timing. */
export function createControlledStorage(
  base: StorageService = createMemoryStorage(),
): ControlledStorage {
  const failures = new Map<Method, unknown>();
  const saves: ControlledStorage['saves'] = [];
  let gate: Promise<void> | null = null;
  let active = 0;
  let maxActive = 0;

  const guard = async <T>(method: Method, run: () => Promise<T>): Promise<T> => {
    await Promise.resolve();
    if (failures.has(method)) throw failures.get(method);
    return run();
  };

  const storage: StorageService = {
    kind: base.kind,
    open: () => guard('open', () => base.open()),
    checkAvailability: () => base.checkAvailability(),
    load: () => guard('load', () => base.load()),
    async save(snapshot, options) {
      saves.push({ snapshot, options });
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        if (gate) await gate;
        return await guard('save', () => base.save(snapshot, options));
      } finally {
        active -= 1;
      }
    },
    clear: () => guard('clear', () => base.clear()),
    saveBackup: (backup) => guard('saveBackup', () => base.saveBackup(backup)),
    listBackups: () => guard('listBackups', () => base.listBackups()),
    close: () => {
      base.close();
    },
  };

  return {
    storage,
    saves,
    fail: (method, error) => {
      failures.set(method, error);
    },
    heal: (method) => {
      if (method) failures.delete(method);
      else failures.clear();
    },
    holdSaves() {
      let release = (): void => undefined;
      gate = new Promise<void>((resolve) => {
        release = () => {
          gate = null;
          resolve();
        };
      });
      return release;
    },
    maxConcurrentSaves: () => maxActive,
  };
}
