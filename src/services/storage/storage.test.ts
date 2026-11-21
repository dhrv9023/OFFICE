import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeedWorkspace } from '@/domain/seed';
import { createSnapshot, type WorkspaceSnapshot } from '@/domain/snapshot/format';
import {
  BACKUP_STORE,
  createIndexedDbStorage,
  DATABASE_UPGRADES,
  toStorageError,
  WORKSPACE_KEY,
  WORKSPACE_STORE,
  type DatabaseUpgrade,
} from './indexedDbStorage';
import { createMemoryStorage } from './memoryStorage';
import { MAX_BACKUPS, StorageError, type StorageService } from './types';

let databaseCounter = 0;
const freshName = (): string => `project-hq-test-${++databaseCounter}`;

const opened: StorageService[] = [];
const track = (storage: StorageService): StorageService => {
  opened.push(storage);
  return storage;
};
afterEach(() => {
  for (const storage of opened.splice(0)) storage.close();
  vi.unstubAllGlobals();
});

const snapshot = (savedAt = '2026-02-01T10:00:00.000Z'): WorkspaceSnapshot =>
  createSnapshot(createSeedWorkspace(), savedAt);

async function rejection(promise: Promise<unknown>): Promise<StorageError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(StorageError);
    return error as StorageError;
  }
  throw new Error('Expected the operation to fail.');
}

describe.each([
  ['IndexedDB', () => track(createIndexedDbStorage({ name: freshName() }))],
  ['memory', () => track(createMemoryStorage())],
] as const)('%s storage', (_label, create) => {
  it('opens, and reports nothing saved yet', async () => {
    const storage = create();
    await storage.open();
    await storage.open();
    expect(await storage.checkAvailability()).toEqual({ available: true });
    expect(await storage.load()).toBeNull();
    expect(await storage.listBackups()).toEqual([]);
  });

  it('saves and loads a snapshot, numbering revisions from 1', async () => {
    const storage = create();
    expect(await storage.save(snapshot(), { expectedRevision: null })).toBe(1);
    expect(await storage.load()).toEqual({ id: WORKSPACE_KEY, ...snapshot(), revision: 1 });

    const later = snapshot('2026-02-01T11:00:00.000Z');
    expect(await storage.save(later, { expectedRevision: 1 })).toBe(2);
    expect(await storage.load()).toEqual({ id: WORKSPACE_KEY, ...later, revision: 2 });
  });

  it('refuses a stale write and keeps the newer data', async () => {
    const storage = create();
    await storage.save(snapshot(), { expectedRevision: null });
    await storage.save(snapshot('2026-02-01T11:00:00.000Z'), { expectedRevision: 1 });

    const stale = await rejection(
      storage.save(snapshot('2026-02-01T09:00:00.000Z'), { expectedRevision: 1 }),
    );
    expect(stale.kind).toBe('conflict');
    expect(stale.message).toMatch(/expected revision 1, found revision 2/);

    const firstRunRace = await rejection(storage.save(snapshot(), { expectedRevision: null }));
    expect(firstRunRace.kind).toBe('conflict');

    expect(await storage.load()).toMatchObject({
      savedAt: '2026-02-01T11:00:00.000Z',
      revision: 2,
    });
  });

  it("overwrites anything with expectedRevision 'any'", async () => {
    const storage = create();
    expect(await storage.save(snapshot(), { expectedRevision: 'any' })).toBe(1);
    expect(await storage.save(snapshot(), { expectedRevision: 'any' })).toBe(2);
  });

  it(`keeps only the newest ${MAX_BACKUPS} backups, and can clear them with a save`, async () => {
    const storage = create();
    for (let index = 1; index <= MAX_BACKUPS + 2; index++) {
      await storage.saveBackup({
        createdAt: `t${index}`,
        reason: 'pre-migration',
        payload: { index },
      });
    }
    const backups = await storage.listBackups();
    expect(backups.map((backup) => backup.createdAt)).toEqual(['t3', 't4', 't5']);

    await storage.save(snapshot(), { expectedRevision: 'any', clearBackups: true });
    expect(await storage.listBackups()).toEqual([]);
  });

  it('clears the workspace and backups', async () => {
    const storage = create();
    await storage.save(snapshot(), { expectedRevision: null });
    await storage.saveBackup({ createdAt: 't', reason: 'pre-migration', payload: null });
    await storage.clear();
    expect(await storage.load()).toBeNull();
    expect(await storage.listBackups()).toEqual([]);
  });

  it('never shares object references with stored data', async () => {
    const storage = create();
    const value = snapshot();
    await storage.save(value, { expectedRevision: null });
    const first = (await storage.load()) as { savedAt: string };
    first.savedAt = 'changed';
    expect(await storage.load()).toMatchObject({ savedAt: value.savedAt });
  });
});

describe('IndexedDB storage specifics', () => {
  it('keeps data across connections (a page reload)', async () => {
    const name = freshName();
    const first = createIndexedDbStorage({ name });
    await first.save(snapshot(), { expectedRevision: null });
    first.close();

    const second = track(createIndexedDbStorage({ name }));
    expect(await second.load()).toMatchObject({ revision: 1, savedAt: snapshot().savedAt });
  });

  it('upgrades the database structure without losing the workspace', async () => {
    const name = freshName();
    const v1 = createIndexedDbStorage({ name });
    await v1.save(snapshot(), { expectedRevision: null });
    v1.close();

    const addIndex: DatabaseUpgrade = (_database, transaction) => {
      transaction.objectStore(BACKUP_STORE).createIndex('byReason', 'reason');
    };
    const v2 = track(
      createIndexedDbStorage({ name, version: 2, upgrades: { ...DATABASE_UPGRADES, 2: addIndex } }),
    );
    expect(await v2.load()).toMatchObject({ revision: 1 });
    v2.close();

    const database = await openDB(name);
    expect(database.version).toBe(2);
    expect([...database.transaction(BACKUP_STORE).store.indexNames]).toEqual(['byReason']);
    database.close();
  });

  it('leaves the old database intact when an upgrade step fails', async () => {
    const name = freshName();
    const v1 = createIndexedDbStorage({ name });
    await v1.save(snapshot(), { expectedRevision: null });
    v1.close();

    const broken = track(
      createIndexedDbStorage({
        name,
        version: 2,
        upgrades: {
          ...DATABASE_UPGRADES,
          2: (database) => {
            database.deleteObjectStore(WORKSPACE_STORE);
            throw new Error('upgrade bug');
          },
        },
      }),
    );
    expect((await rejection(broken.open())).kind).toBe('open_failed');

    const again = track(createIndexedDbStorage({ name }));
    expect(await again.load()).toMatchObject({ revision: 1 });
  });

  it('refuses to open a database created by a newer version of the app', async () => {
    const name = freshName();
    const database = await openDB(name, 5, {
      upgrade(db) {
        db.createObjectStore(WORKSPACE_STORE, { keyPath: 'id' });
      },
    });
    database.close();

    const storage = track(createIndexedDbStorage({ name }));
    const error = await rejection(storage.open());
    expect(error.kind).toBe('newer_version');
    expect(await storage.checkAvailability()).toMatchObject({
      available: false,
      error: { kind: 'newer_version' },
    });
  });

  it('reports IndexedDB as unavailable when the browser lacks it, and recovers later', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const storage = track(createIndexedDbStorage({ name: freshName() }));
    expect(await storage.checkAvailability()).toMatchObject({
      available: false,
      error: { kind: 'unavailable' },
    });
    expect((await rejection(storage.load())).kind).toBe('unavailable');

    vi.unstubAllGlobals();
    expect(await storage.checkAvailability()).toEqual({ available: true });
  });

  it('reports a blocked upgrade while another tab holds the old version open', async () => {
    const name = freshName();
    const otherTab = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore(WORKSPACE_STORE, { keyPath: 'id' });
        db.createObjectStore(BACKUP_STORE, { keyPath: 'id', autoIncrement: true });
      },
      // An old tab that ignores versionchange and keeps its connection.
    });
    const storage = track(
      createIndexedDbStorage({
        name,
        version: 2,
        upgrades: { ...DATABASE_UPGRADES, 2: () => undefined },
      }),
    );
    expect((await rejection(storage.open())).kind).toBe('blocked');
    otherTab.close();
  });
});

describe('toStorageError', () => {
  it('recognises a full disk', () => {
    const error = toStorageError(new DOMException('full', 'QuotaExceededError'), 'write_failed');
    expect(error.kind).toBe('quota_exceeded');
    expect(error.message).toMatch(/run out of storage space/);
    expect(error.cause).toBeInstanceOf(DOMException);
  });

  it('falls back to the given kind and keeps the reason', () => {
    const error = toStorageError(new Error('disk on fire'), 'read_failed');
    expect(error.kind).toBe('read_failed');
    expect(error.message).toContain('disk on fire');
  });

  it('passes a StorageError through unchanged', () => {
    const original = new StorageError('conflict', 'x');
    expect(toStorageError(original, 'write_failed')).toBe(original);
  });
});
