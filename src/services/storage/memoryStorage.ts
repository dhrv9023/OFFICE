import {
  conflictError,
  MAX_BACKUPS,
  readRevision,
  type BackupRecord,
  type StorageService,
} from './types';

/**
 * A StorageService that keeps everything in memory, with the same revision and
 * conflict semantics as the IndexedDB one. Used by tests, and proof that the
 * persistence layer is replaceable. Data is copied on the way in and out, like a
 * real database, so callers can never share object references with "disk".
 */
export function createMemoryStorage(): StorageService {
  let record: unknown = null;
  let backups: BackupRecord[] = [];

  return {
    kind: 'memory',

    open: () => Promise.resolve(),

    checkAvailability: () => Promise.resolve({ available: true }),

    load: () => Promise.resolve(structuredClone(record)),

    save(snapshot, { expectedRevision, clearBackups }) {
      const currentRevision = readRevision(record);
      if (expectedRevision !== 'any' && currentRevision !== expectedRevision) {
        return Promise.reject(conflictError(expectedRevision, currentRevision));
      }
      const revision = (currentRevision ?? 0) + 1;
      record = structuredClone({ id: 'current', ...snapshot, revision });
      if (clearBackups === true) backups = [];
      return Promise.resolve(revision);
    },

    clear() {
      record = null;
      backups = [];
      return Promise.resolve();
    },

    saveBackup(backup) {
      backups = [...backups, structuredClone(backup)].slice(-MAX_BACKUPS);
      return Promise.resolve();
    },

    listBackups: () => Promise.resolve(structuredClone(backups)),

    close: () => undefined,
  };
}
