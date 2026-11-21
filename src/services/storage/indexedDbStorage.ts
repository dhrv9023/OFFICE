import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import {
  conflictError,
  MAX_BACKUPS,
  readRevision,
  StorageError,
  type BackupRecord,
  type StorageErrorKind,
  type StorageService,
} from './types';

export const DATABASE_NAME = 'project-hq';

/**
 * Version of the database STRUCTURE (object stores and indexes). This is separate
 * from the snapshot schema version, which describes the shape of the data inside.
 * Bump it and add an entry to DATABASE_UPGRADES whenever a store is added or changed.
 */
export const DATABASE_VERSION = 1;

export const WORKSPACE_STORE = 'workspace';
export const BACKUP_STORE = 'backups';
/** The single workspace record is stored under this key. */
export const WORKSPACE_KEY = 'current';

export type DatabaseUpgrade = (
  database: IDBPDatabase,
  transaction: IDBPTransaction<unknown, string[], 'versionchange'>,
) => void;

/**
 * One step per database version, applied in order from the version found on disk.
 * Steps only ever ADD or TRANSFORM: they never drop the workspace record. If a step
 * throws, the browser aborts the whole upgrade and the old database is left intact.
 */
export const DATABASE_UPGRADES: Readonly<Record<number, DatabaseUpgrade>> = {
  1: (database) => {
    database.createObjectStore(WORKSPACE_STORE, { keyPath: 'id' });
    database.createObjectStore(BACKUP_STORE, { keyPath: 'id', autoIncrement: true });
  },
};

export interface IndexedDbStorageOptions {
  readonly name?: string;
  readonly version?: number;
  readonly upgrades?: Readonly<Record<number, DatabaseUpgrade>>;
}

/** Maps a browser storage failure onto a StorageError, keeping the original as `cause`. */
export function toStorageError(error: unknown, fallback: StorageErrorKind): StorageError {
  if (error instanceof StorageError) return error;
  const name = error instanceof Error ? error.name : '';
  const reason = error instanceof Error && error.message ? ` (${error.message})` : '';

  if (name === 'QuotaExceededError') {
    return new StorageError(
      'quota_exceeded',
      'The browser has run out of storage space for Project HQ. Free up space, or export the workspace to keep a copy.',
      { cause: error },
    );
  }
  if (name === 'VersionError') {
    return new StorageError(
      'newer_version',
      'The saved data was created by a newer version of Project HQ. Update the app to open it.',
      { cause: error },
    );
  }
  const messages: Record<StorageErrorKind, string> = {
    unavailable: 'Browser storage is not available.',
    open_failed: 'The workspace database could not be opened.',
    newer_version: 'The saved data was created by a newer version of Project HQ.',
    blocked: 'The workspace database is in use by another tab.',
    read_failed: 'The saved workspace could not be read.',
    write_failed: 'The workspace could not be saved.',
    quota_exceeded: 'The browser has run out of storage space.',
    conflict: 'The saved workspace changed unexpectedly.',
  };
  return new StorageError(fallback, `${messages[fallback]}${reason}`, { cause: error });
}

export function createIndexedDbStorage(options: IndexedDbStorageOptions = {}): StorageService {
  const name = options.name ?? DATABASE_NAME;
  const version = options.version ?? DATABASE_VERSION;
  const upgrades = options.upgrades ?? DATABASE_UPGRADES;

  let connection: Promise<IDBPDatabase> | null = null;

  const openConnection = (): Promise<IDBPDatabase> =>
    new Promise<IDBPDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(
          new StorageError(
            'unavailable',
            'This browser does not provide IndexedDB, so the workspace cannot be saved.',
          ),
        );
        return;
      }

      openDB(name, version, {
        upgrade(database, oldVersion, newVersion, transaction) {
          // A failed step aborts this transaction; the failure is reported through openDB.
          transaction.done.catch(() => undefined);
          for (let step = oldVersion + 1; step <= (newVersion ?? version); step += 1) {
            const upgrade = upgrades[step];
            if (!upgrade) throw new Error(`No database upgrade is defined for version ${step}.`);
            upgrade(database, transaction);
          }
        },
        blocked() {
          // An older version is open elsewhere and the upgrade cannot start.
          reject(
            new StorageError(
              'blocked',
              'Project HQ is open in another tab that is using an older version. Close the other tabs and try again.',
            ),
          );
        },
        blocking() {
          // A newer version wants to upgrade: step aside so it is not blocked.
          void connection?.then((database) => {
            database.close();
          });
          connection = null;
        },
        terminated() {
          connection = null;
        },
      }).then(resolve, (error: unknown) => {
        reject(toStorageError(error, 'open_failed'));
      });
    });

  const connect = (): Promise<IDBPDatabase> => {
    connection ??= openConnection().catch((error: unknown) => {
      connection = null;
      throw error;
    });
    return connection;
  };

  return {
    kind: 'indexeddb',

    async open() {
      await connect();
    },

    async checkAvailability() {
      try {
        await connect();
        return { available: true };
      } catch (error) {
        return { available: false, error: toStorageError(error, 'unavailable') };
      }
    },

    async load() {
      const database = await connect();
      try {
        const record: unknown = await database.get(WORKSPACE_STORE, WORKSPACE_KEY);
        return record ?? null;
      } catch (error) {
        throw toStorageError(error, 'read_failed');
      }
    },

    async save(snapshot, { expectedRevision, clearBackups }) {
      const database = await connect();
      try {
        // One transaction: the revision check, the write and the backup clean-up
        // either all happen or none do.
        const transaction = database.transaction([WORKSPACE_STORE, BACKUP_STORE], 'readwrite');
        const store = transaction.objectStore(WORKSPACE_STORE);
        const currentRevision = readRevision(await store.get(WORKSPACE_KEY));

        if (expectedRevision !== 'any' && currentRevision !== expectedRevision) {
          transaction.abort();
          await transaction.done.catch(() => undefined);
          throw conflictError(expectedRevision, currentRevision);
        }

        const revision = (currentRevision ?? 0) + 1;
        await store.put({ id: WORKSPACE_KEY, ...snapshot, revision });
        if (clearBackups === true) await transaction.objectStore(BACKUP_STORE).clear();
        await transaction.done;
        return revision;
      } catch (error) {
        throw toStorageError(error, 'write_failed');
      }
    },

    async clear() {
      const database = await connect();
      try {
        const transaction = database.transaction([WORKSPACE_STORE, BACKUP_STORE], 'readwrite');
        await transaction.objectStore(WORKSPACE_STORE).clear();
        await transaction.objectStore(BACKUP_STORE).clear();
        await transaction.done;
      } catch (error) {
        throw toStorageError(error, 'write_failed');
      }
    },

    async saveBackup(backup) {
      const database = await connect();
      try {
        const transaction = database.transaction(BACKUP_STORE, 'readwrite');
        await transaction.store.add(backup);
        const keys = await transaction.store.getAllKeys();
        for (const key of keys.slice(0, Math.max(0, keys.length - MAX_BACKUPS))) {
          await transaction.store.delete(key);
        }
        await transaction.done;
      } catch (error) {
        throw toStorageError(error, 'write_failed');
      }
    },

    async listBackups() {
      const database = await connect();
      try {
        return (await database.getAll(BACKUP_STORE)) as BackupRecord[];
      } catch (error) {
        throw toStorageError(error, 'read_failed');
      }
    },

    close() {
      void connection?.then(
        (database) => {
          database.close();
        },
        () => undefined,
      );
      connection = null;
    },
  };
}
