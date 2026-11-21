import { describe, expect, it, vi } from 'vitest';
import { createSeedWorkspace, OFFICE_LAYOUT } from '@/domain/seed';
import {
  createExport,
  createSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  serializeExport,
} from '@/domain/snapshot/format';
import type { MigrationConfig } from '@/domain/snapshot/migrations';
import { restoreWorkspace } from '@/domain/snapshot/restore';
import { USER_ACTOR, type WorkspaceState } from '@/domain/types';
import { randomIdGenerator } from '@/services/ids';
import { createIndexedDbStorage } from '@/services/storage/indexedDbStorage';
import { createMemoryStorage } from '@/services/storage/memoryStorage';
import { StorageError, type StorageService } from '@/services/storage/types';
import { INITIAL_APP_STATE, type AppState } from '@/stores/internal/appStore';
import { selectEmployeeStatus, selectProjectProgress } from '@/stores/selectors';
import { DEPT, EMP } from '@/test/factories';
import { createTestClock, present, unwrap } from '@/test/harness';
import { createControlledStorage } from '@/test/storage';
import { createCommands } from './createCommands';
import { createWorkspaceLifecycle } from './workspaceLifecycle';

/** One running copy of the application, wired like commands/index.ts but isolated. */
function createApp(storage: StorageService, options: { migrations?: MigrationConfig } = {}) {
  let workspace: WorkspaceState = createSeedWorkspace();
  let app: AppState = INITIAL_APP_STATE;
  const listeners = new Set<() => void>();
  const onWorkspaceReplaced = vi.fn();
  const port = {
    getState: () => workspace,
    setState: (next: WorkspaceState) => {
      workspace = next;
      for (const listener of [...listeners]) listener();
    },
  };
  const clock = createTestClock();

  const lifecycle = createWorkspaceLifecycle({
    workspace: port,
    app: {
      getState: () => app,
      update: (patch) => {
        app = { ...app, ...patch };
      },
    },
    storage,
    clock,
    layout: OFFICE_LAYOUT,
    createSeed: createSeedWorkspace,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onWorkspaceReplaced,
    ...(options.migrations ? { migrations: options.migrations } : {}),
  });
  const commands = createCommands({
    store: port,
    clock,
    ids: randomIdGenerator,
    isAvailable: () => app.phase.status === 'ready' && app.operation === null,
  }).commands;
  return { lifecycle, commands, workspace: () => workspace, app: () => app, onWorkspaceReplaced };
}

type App = ReturnType<typeof createApp>;

/** Puts a recognisable project into the workspace. */
function addProject(app: App, name = 'Website') {
  return unwrap(app.commands.createProject(USER_ACTOR, { name }));
}

async function readyApp(storage: StorageService = createMemoryStorage()) {
  const app = createApp(storage);
  await app.lifecycle.initialize();
  expect(app.app().phase).toEqual({ status: 'ready', storage: 'persistent' });
  return app;
}

const exportOf = (state: WorkspaceState) =>
  serializeExport(createExport(state, '2026-05-01T12:00:00.000Z'));

type ExportDocument = Record<string, unknown> & {
  workspace: Record<string, Record<string, unknown>[]>;
};

/** A seed export file, parsed so a test can damage it. */
const seedDocument = (): ExportDocument =>
  JSON.parse(exportOf(createSeedWorkspace())) as ExportDocument;

const employeeAt = (document: ExportDocument, index: number) =>
  present(document.workspace.employees?.[index], `employee ${index}`);

/** A valid export file from some other workspace. */
async function otherWorkspaceFile(): Promise<{ file: string; state: WorkspaceState }> {
  const other = await readyApp();
  addProject(other, 'Imported project');
  return { file: exportOf(other.workspace()), state: other.workspace() };
}

describe('startup', () => {
  it('blocks every command until the workspace is loaded', async () => {
    const app = createApp(createMemoryStorage());
    expect(app.commands.createProject(USER_ACTOR, { name: 'Early' })).toMatchObject({
      ok: false,
      error: { code: 'workspace_unavailable' },
    });
    const starting = app.lifecycle.initialize();
    expect(app.app().phase.status).toBe('initializing');
    expect(app.commands.createProject(USER_ACTOR, { name: 'Early' }).ok).toBe(false);
    await starting;
    expect(app.commands.createProject(USER_ACTOR, { name: 'On time' }).ok).toBe(true);
  });

  it('seeds the first run and writes the seed before going live', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    expect(app.workspace()).toEqual(createSeedWorkspace());
    expect(controlled.saves).toHaveLength(1);
    expect(controlled.saves[0]?.options).toEqual({ expectedRevision: null });
    expect(await controlled.storage.load()).toMatchObject({ revision: 1 });
  });

  it('initialises only once, however often it is called', async () => {
    const controlled = createControlledStorage();
    const app = createApp(controlled.storage);
    await Promise.all([app.lifecycle.initialize(), app.lifecycle.initialize()]);
    await app.lifecycle.initialize();
    expect(controlled.saves).toHaveLength(1);
  });

  it('restores the saved workspace on the next start without rewriting it', async () => {
    const controlled = createControlledStorage();
    const first = await readyApp(controlled.storage);
    addProject(first);
    await first.lifecycle.flush();
    const savesBefore = controlled.saves.length;

    const second = await readyApp(controlled.storage);
    expect(second.workspace()).toEqual(first.workspace());
    expect(controlled.saves).toHaveLength(savesBefore);

    // And the reloaded copy keeps saving from the right revision.
    addProject(second, 'After reload');
    await second.lifecycle.flush();
    expect(second.app().save.state).toBe('saved');
  });

  it('uses the workspace another tab seeded at the same moment', async () => {
    const base = createMemoryStorage();
    const otherTab = createApp(base);
    await otherTab.lifecycle.initialize();
    addProject(otherTab, 'Seeded elsewhere');
    await otherTab.lifecycle.flush();

    let firstLoad = true;
    const racing: StorageService = {
      ...base,
      load: () => {
        if (firstLoad) {
          firstLoad = false;
          return Promise.resolve(null);
        }
        return base.load();
      },
    };
    const app = createApp(racing);
    await app.lifecycle.initialize();
    expect(app.app().phase.status).toBe('ready');
    expect(app.workspace()).toEqual(otherTab.workspace());
  });
});

describe('unusable saved data', () => {
  async function storedWith(mutate: (record: Record<string, unknown>) => void) {
    const controlled = createControlledStorage();
    await readyApp(controlled.storage);
    const broken = (await controlled.storage.load()) as Record<string, unknown>;
    mutate(broken);
    await controlled.storage.save(broken as never, { expectedRevision: 'any' });
    const before = await controlled.storage.load();
    controlled.saves.length = 0;
    return { controlled, before };
  }

  it.each([
    [
      'invalid_structure',
      (record: Record<string, unknown>) => {
        (record.workspace as { tasks: unknown }).tasks = 'not a list';
      },
    ],
    [
      'invalid_relationships',
      (record: Record<string, unknown>) => {
        const employees = (record.workspace as { employees: { departmentId: string }[] }).employees;
        present(employees[0]).departmentId = 'dept_gone';
      },
    ],
    [
      'unsupported_version',
      (record: Record<string, unknown>) => {
        record.schemaVersion = 99;
      },
    ],
    [
      'malformed',
      (record: Record<string, unknown>) => {
        record.format = 'something-else';
      },
    ],
  ] as const)(
    'stops for recovery (%s) and leaves the saved data untouched',
    async (reason, mutate) => {
      const { controlled, before } = await storedWith(mutate);
      const app = createApp(controlled.storage);
      await app.lifecycle.initialize();

      expect(app.app().phase).toMatchObject({ status: 'recovery_required', reason });
      expect(app.commands.createProject(USER_ACTOR, { name: 'x' }).ok).toBe(false);
      expect(app.lifecycle.exportWorkspace().ok).toBe(false);
      expect(controlled.saves).toHaveLength(0);
      expect(await controlled.storage.load()).toEqual(before);
    },
  );

  it('offers the stored record, exactly as saved, for manual recovery', async () => {
    const { controlled, before } = await storedWith((record) => {
      record.schemaVersion = 99;
    });
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();

    const download = unwrap(await app.lifecycle.exportRecoveryData());
    expect(download.filename).toMatch(/^project-hq-recovery-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(download.contents) as unknown).toMatchObject({
      format: 'project-hq-recovery',
      stored: before,
    });
  });

  it('can retry, import a good file or reset from recovery', async () => {
    const { file, state } = await otherWorkspaceFile();
    const { controlled } = await storedWith((record) => {
      record.schemaVersion = 99;
    });

    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();
    await app.lifecycle.retry();
    expect(app.app().phase.status).toBe('recovery_required');

    unwrap(await app.lifecycle.importWorkspace(file));
    expect(app.app().phase).toEqual({ status: 'ready', storage: 'persistent' });
    expect(app.workspace()).toEqual(state);
    expect(unwrap(restoreWorkspace(await controlled.storage.load(), OFFICE_LAYOUT)).state).toEqual(
      state,
    );

    const again = (
      await storedWith((record) => {
        record.format = 'nope';
      })
    ).controlled;
    const other = createApp(again.storage);
    await other.lifecycle.initialize();
    unwrap(await other.lifecycle.resetWorkspace());
    expect(other.workspace()).toEqual(createSeedWorkspace());
    expect(other.app().phase.status).toBe('ready');
  });
});

describe('migrations on startup', () => {
  // Pretend the current schema stored the activity list as "events" and the next
  // version renamed it. Relative to the real version, so it holds as the schema grows.
  const config = (step: (workspace: unknown) => unknown): MigrationConfig => ({
    currentVersion: SNAPSHOT_SCHEMA_VERSION + 1,
    migrations: { [SNAPSHOT_SCHEMA_VERSION]: step },
  });
  const rename = (workspace: unknown) => {
    const { events, ...rest } = workspace as Record<string, unknown>;
    return { ...rest, activity: events };
  };

  async function storeV1() {
    const controlled = createControlledStorage();
    const original = await readyApp(controlled.storage);
    addProject(original);
    await original.lifecycle.flush();
    const record = (await controlled.storage.load()) as { workspace: Record<string, unknown> };
    const { activity, ...rest } = record.workspace;
    await controlled.storage.save(
      { ...record, workspace: { ...rest, events: activity } } as never,
      {
        expectedRevision: 'any',
      },
    );
    return { controlled, original: original.workspace(), v1: await controlled.storage.load() };
  }

  it('backs up the old record, then saves the upgraded one', async () => {
    const { controlled, original, v1 } = await storeV1();
    const app = createApp(controlled.storage, { migrations: config(rename) });
    await app.lifecycle.initialize();

    expect(app.app().phase.status).toBe('ready');
    expect(app.workspace()).toEqual(original);
    const backups = await controlled.storage.listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ reason: 'pre-migration', payload: v1 });
    expect(await controlled.storage.load()).toMatchObject({
      workspace: { activity: original.activity },
    });
  });

  it('stops without writing when the backup cannot be made', async () => {
    const { controlled, v1 } = await storeV1();
    controlled.fail('saveBackup', new StorageError('quota_exceeded', 'Disk full.'));
    const app = createApp(controlled.storage, { migrations: config(rename) });
    await app.lifecycle.initialize();

    expect(app.app().phase).toMatchObject({ status: 'error', kind: 'quota_exceeded' });
    expect(await controlled.storage.load()).toEqual(v1);
  });

  it('asks for recovery when a migration fails, keeping the old data', async () => {
    const { controlled, v1 } = await storeV1();
    const app = createApp(controlled.storage, {
      migrations: config(() => {
        throw new Error('cannot upgrade');
      }),
    });
    await app.lifecycle.initialize();

    expect(app.app().phase).toMatchObject({
      status: 'recovery_required',
      reason: 'migration_failed',
    });
    expect(await controlled.storage.load()).toEqual(v1);
    expect(await controlled.storage.listBackups()).toEqual([]);
  });
});

describe('storage failures on startup', () => {
  it('shows an error instead of seeding when storage cannot be opened', async () => {
    const controlled = createControlledStorage();
    controlled.fail('open', new StorageError('unavailable', 'No IndexedDB.'));
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();

    expect(app.app().phase).toEqual({
      status: 'error',
      kind: 'unavailable',
      message: 'No IndexedDB.',
    });
    expect(controlled.saves).toHaveLength(0);
    expect(app.commands.createProject(USER_ACTOR, { name: 'x' }).ok).toBe(false);
  });

  it('never replaces saved data with the seed because a read failed', async () => {
    const controlled = createControlledStorage();
    const first = await readyApp(controlled.storage);
    addProject(first);
    await first.lifecycle.flush();
    const before = await controlled.storage.load();
    controlled.saves.length = 0;

    controlled.fail('load', new StorageError('read_failed', 'Read error.'));
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();
    expect(app.app().phase).toMatchObject({ status: 'error', kind: 'read_failed' });
    expect(controlled.saves).toHaveLength(0);

    controlled.heal();
    await app.lifecycle.retry();
    expect(app.app().phase.status).toBe('ready');
    expect(app.workspace()).toEqual(first.workspace());
    expect(await controlled.storage.load()).toEqual(before);
  });

  it('can continue in memory, and then never touches storage', async () => {
    const controlled = createControlledStorage();
    controlled.fail('open', new StorageError('unavailable', 'No IndexedDB.'));
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();

    unwrap(app.lifecycle.continueWithoutSaving());
    expect(app.app().phase).toEqual({ status: 'ready', storage: 'memory' });
    addProject(app);
    await app.lifecycle.flush();
    expect(controlled.saves).toHaveLength(0);

    // Import and reset still work, in memory.
    const { file, state } = await otherWorkspaceFile();
    unwrap(await app.lifecycle.importWorkspace(file));
    expect(app.workspace()).toEqual(state);
    expect(controlled.saves).toHaveLength(0);
  });

  it('only offers "continue without saving" after a storage error', async () => {
    const app = await readyApp();
    expect(app.lifecycle.continueWithoutSaving()).toMatchObject({
      ok: false,
      error: { kind: 'not_available' },
    });
  });
});

describe('automatic persistence', () => {
  it('saves after each successful command and reports the status', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    const project = addProject(app);
    await app.lifecycle.flush();

    expect(app.app().save.state).toBe('saved');
    const stored = unwrap(restoreWorkspace(await controlled.storage.load(), OFFICE_LAYOUT));
    expect(stored.state.projects[project.id]).toEqual(project);
  });

  it('does not write for rejected commands', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    const before = controlled.saves.length;
    expect(app.commands.createProject(USER_ACTOR, { name: '' }).ok).toBe(false);
    await app.lifecycle.flush();
    expect(controlled.saves).toHaveLength(before);
  });

  it('surfaces a failed save and recovers on retry', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    controlled.fail('save', new StorageError('quota_exceeded', 'Disk full.'));
    const project = addProject(app);
    await app.lifecycle.flush();
    expect(app.app().save).toEqual({
      state: 'error',
      kind: 'quota_exceeded',
      message: 'Disk full.',
    });

    controlled.heal();
    await app.lifecycle.retrySave();
    expect(app.app().save.state).toBe('saved');
    const stored = unwrap(restoreWorkspace(await controlled.storage.load(), OFFICE_LAYOUT));
    expect(stored.state.projects[project.id]).toEqual(project);
  });
});

describe('export', () => {
  it('produces a dated, human-readable file that restores to the same workspace', async () => {
    const app = await readyApp();
    addProject(app);
    const download = unwrap(app.lifecycle.exportWorkspace());
    expect(download.filename).toMatch(/^project-hq-workspace-2026-02-01\.json$/);
    expect(download.contents).toContain(
      `\n  "schemaVersion": ${String(SNAPSHOT_SCHEMA_VERSION)},\n`,
    );
    const restored = unwrap(
      restoreWorkspace(JSON.parse(download.contents) as unknown, OFFICE_LAYOUT),
    );
    expect(restored.state).toEqual(app.workspace());
  });

  it('is unavailable before the workspace is loaded', () => {
    const app = createApp(createMemoryStorage());
    expect(app.lifecycle.exportWorkspace()).toMatchObject({
      ok: false,
      error: { kind: 'not_available' },
    });
  });
});

describe('import', () => {
  it('replaces the workspace, saves it and clears selections', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    addProject(app, 'Replaced');
    const { file, state } = await otherWorkspaceFile();

    const outcome = unwrap(await app.lifecycle.importWorkspace(file));
    expect(outcome.migrated).toBe(false);
    expect(outcome.summary.projects).toBe(1);
    expect(app.workspace()).toEqual(state);
    expect(app.onWorkspaceReplaced).toHaveBeenCalled();
    expect(controlled.saves.at(-1)?.options.expectedRevision).toBe('any');
    expect(unwrap(restoreWorkspace(await controlled.storage.load(), OFFICE_LAYOUT)).state).toEqual(
      state,
    );

    // Autosave carries on against the imported workspace.
    addProject(app, 'After import');
    await app.lifecycle.flush();
    expect(app.app().save.state).toBe('saved');
  });

  it.each([
    ['invalid_json', (): string => '{ nope'],
    ['malformed', (): string => JSON.stringify({ hello: 'world' })],
    [
      'unsupported_version',
      (): string =>
        JSON.stringify({ ...seedDocument(), schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1 }),
    ],
    [
      'invalid_structure',
      (): string => {
        const document = seedDocument();
        employeeAt(document, 0).name = 7;
        return JSON.stringify(document);
      },
    ],
    [
      'invalid_relationships',
      (): string => {
        const document = seedDocument();
        employeeAt(document, 1).deskId = employeeAt(document, 0).deskId;
        return JSON.stringify(document);
      },
    ],
  ] as const)('rejects a %s file and changes nothing', async (kind, file) => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    addProject(app);
    await app.lifecycle.flush();
    const workspaceBefore = app.workspace();
    const storedBefore = await controlled.storage.load();
    const savesBefore = controlled.saves.length;
    app.onWorkspaceReplaced.mockClear();

    const result = await app.lifecycle.importWorkspace(file());
    expect(result).toMatchObject({ ok: false, error: { kind } });
    if (!result.ok) expect(result.error.message.length).toBeGreaterThan(0);
    expect(app.workspace()).toBe(workspaceBefore);
    expect(controlled.saves).toHaveLength(savesBefore);
    expect(await controlled.storage.load()).toEqual(storedBefore);
    expect(app.app().phase.status).toBe('ready');
    expect(app.onWorkspaceReplaced).not.toHaveBeenCalled();
  });

  it('explains how to open a file from a newer version', async () => {
    const app = await readyApp();
    const result = await app.lifecycle.importWorkspace(
      JSON.stringify({ ...seedDocument(), schemaVersion: 7 }),
    );
    if (result.ok) throw new Error('expected failure');
    expect(result.error.message).toMatch(/schema version 7.*Update Project HQ/);
  });

  it('keeps the current workspace when the imported one cannot be saved', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    addProject(app, 'Keep me');
    await app.lifecycle.flush();
    const before = app.workspace();
    const storedBefore = await controlled.storage.load();
    const { file } = await otherWorkspaceFile();

    controlled.fail('save', new StorageError('quota_exceeded', 'Disk full.'));
    const result = await app.lifecycle.importWorkspace(file);
    expect(result).toMatchObject({ ok: false, error: { kind: 'quota_exceeded' } });
    expect(app.workspace()).toBe(before);
    expect(await controlled.storage.load()).toEqual(storedBefore);
    expect(app.app()).toMatchObject({ phase: { status: 'ready' }, operation: null });

    // Autosaving resumed: the next change is saved once storage recovers.
    controlled.heal();
    addProject(app, 'Still saving');
    await app.lifecycle.flush();
    expect(app.app().save.state).toBe('saved');
  });

  it('holds off commands and other operations while it runs', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    const { file } = await otherWorkspaceFile();

    const release = controlled.holdSaves();
    const importing = app.lifecycle.importWorkspace(file);
    await Promise.resolve();
    expect(app.app().operation).toBe('importing');
    expect(app.commands.createProject(USER_ACTOR, { name: 'Mid-import' })).toMatchObject({
      ok: false,
      error: { code: 'workspace_unavailable' },
    });
    expect(await app.lifecycle.resetWorkspace()).toMatchObject({
      ok: false,
      error: { kind: 'not_available' },
    });

    release();
    unwrap(await importing);
    expect(app.app().operation).toBeNull();
  });

  it('waits for an autosave in flight so it cannot overwrite the import', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    const { file, state } = await otherWorkspaceFile();

    const release = controlled.holdSaves();
    addProject(app, 'Saving slowly');
    const importing = app.lifecycle.importWorkspace(file);
    release();
    unwrap(await importing);
    await app.lifecycle.flush();

    expect(unwrap(restoreWorkspace(await controlled.storage.load(), OFFICE_LAYOUT)).state).toEqual(
      state,
    );
  });
});

describe('previewImport', () => {
  it('summarises a valid file without changing anything', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    const before = app.workspace();
    const savesBefore = controlled.saves.length;
    const { file } = await otherWorkspaceFile();

    const preview = unwrap(app.lifecycle.previewImport(file));
    expect(preview).toEqual({
      summary: expect.objectContaining({ projects: 1, employees: 5 }) as unknown,
      sourceVersion: SNAPSHOT_SCHEMA_VERSION,
      migrated: false,
    });
    expect(app.workspace()).toBe(before);
    expect(controlled.saves).toHaveLength(savesBefore);
  });

  it('reports the same errors as import', async () => {
    const app = await readyApp();
    expect(app.lifecycle.previewImport('{ nope')).toMatchObject({
      ok: false,
      error: { kind: 'invalid_json' },
    });
    expect(
      app.lifecycle.previewImport(JSON.stringify({ ...seedDocument(), schemaVersion: 9 })),
    ).toMatchObject({ ok: false, error: { kind: 'unsupported_version' } });
  });
});

describe('reset', () => {
  it('restores the seed, persists it and clears backups', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    addProject(app);
    await controlled.storage.saveBackup({ createdAt: 't', reason: 'pre-migration', payload: {} });

    unwrap(await app.lifecycle.resetWorkspace());
    expect(app.workspace()).toEqual(createSeedWorkspace());
    expect(app.onWorkspaceReplaced).toHaveBeenCalled();
    expect(await controlled.storage.listBackups()).toEqual([]);
    expect(unwrap(restoreWorkspace(await controlled.storage.load(), OFFICE_LAYOUT)).state).toEqual(
      createSeedWorkspace(),
    );
  });

  it('changes nothing when the reset cannot be saved', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    addProject(app);
    await app.lifecycle.flush();
    const before = app.workspace();
    const storedBefore = await controlled.storage.load();

    controlled.fail('save', new StorageError('write_failed', 'Write error.'));
    expect(await app.lifecycle.resetWorkspace()).toMatchObject({
      ok: false,
      error: { kind: 'write_failed' },
    });
    expect(app.workspace()).toBe(before);
    expect(await controlled.storage.load()).toEqual(storedBefore);
    expect(app.app().operation).toBeNull();
  });
});

describe('Phase 1.6 changes across a reload (IndexedDB)', () => {
  it('keeps a renamed employee, task deadlines and meetings, with the same IDs', async () => {
    const name = 'project-hq-phase-1-6-test';
    const firstStorage = createIndexedDbStorage({ name });
    const first = createApp(firstStorage);
    await first.lifecycle.initialize();

    const project = unwrap(first.commands.createProject(USER_ACTOR, { name: 'Website' }));
    const task = unwrap(
      first.commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design homepage',
        assigneeId: EMP.sarah,
        deadline: '2026-12-18',
      }),
    );
    unwrap(first.commands.renameEmployee(USER_ACTOR, { employeeId: EMP.sarah, name: 'Sarah Lee' }));
    const meeting = unwrap(
      first.commands.scheduleMeeting(USER_ACTOR, {
        title: 'Kick-off',
        participantIds: [EMP.sarah],
        roomId: 'room_meeting',
        startsAt: '2026-12-01T10:00',
        durationMinutes: 60,
      }),
    );
    await first.lifecycle.flush();
    const before = first.workspace();
    firstStorage.close();

    const secondStorage = createIndexedDbStorage({ name });
    const second = createApp(secondStorage);
    await second.lifecycle.initialize();
    const after = second.workspace();
    secondStorage.close();

    expect(after).toEqual(before);
    expect(after.employees[EMP.sarah]).toMatchObject({ id: EMP.sarah, name: 'Sarah Lee' });
    expect(after.tasks[task.id]).toMatchObject({ assigneeId: EMP.sarah, deadline: '2026-12-18' });
    expect(after.meetings[meeting.id]?.participantIds).toEqual([EMP.sarah]);
    // History keeps the name it was written with.
    expect(after.activity.map((event) => event.description)).toContain(
      'Task "Design homepage" was assigned to Sarah Chen.',
    );
    expect(after.activity.at(-2)?.description).toBe('Sarah Chen was renamed to Sarah Lee.');
  });
});

describe('full workflow across a reload (IndexedDB)', () => {
  it('restores projects, tasks, assignments, statuses, activity and notifications', async () => {
    const name = 'project-hq-workflow-test';
    const firstStorage = createIndexedDbStorage({ name });
    const first = createApp(firstStorage);
    await first.lifecycle.initialize();

    const project = unwrap(first.commands.createProject(USER_ACTOR, { name: 'Website relaunch' }));
    const task = unwrap(
      first.commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design homepage',
      }),
    );
    unwrap(first.commands.assignTask(USER_ACTOR, { taskId: task.id, assigneeId: EMP.sarah }));
    unwrap(first.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }));
    await first.lifecycle.flush();
    expect(first.app().save.state).toBe('saved');
    const before = first.workspace();
    firstStorage.close();

    // A new page load: fresh storage connection, fresh stores, fresh lifecycle.
    const secondStorage = createIndexedDbStorage({ name });
    const second = createApp(secondStorage);
    await second.lifecycle.initialize();

    expect(second.app().phase).toEqual({ status: 'ready', storage: 'persistent' });
    const after = second.workspace();
    expect(after).toEqual(before);
    expect(after.projects[project.id]?.name).toBe('Website relaunch');
    expect(after.tasks[task.id]).toMatchObject({ assigneeId: EMP.sarah, status: 'in_progress' });
    expect(after.employees[EMP.sarah]?.currentTaskId).toBe(task.id);
    expect(selectEmployeeStatus(after, EMP.sarah)).toBe('working');
    expect(selectProjectProgress(after, project.id)).toMatchObject({ percent: 0 });
    expect(after.activity.map((event) => event.eventType)).toEqual([
      'project.created',
      'task.created',
      'task.assigned',
      'task.status_changed',
    ]);
    expect(after.notifications.length).toBe(before.notifications.length);

    // Work continues after the reload and is saved too.
    unwrap(second.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_review' }));
    unwrap(second.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'done' }));
    await second.lifecycle.flush();
    secondStorage.close();

    const third = createApp(createIndexedDbStorage({ name }));
    await third.lifecycle.initialize();
    expect(third.workspace().tasks[task.id]?.status).toBe('done');
    expect(selectProjectProgress(third.workspace(), project.id)).toMatchObject({ percent: 100 });
  });
});

describe('snapshot written by storage', () => {
  it('matches the export format', async () => {
    const controlled = createControlledStorage();
    const app = await readyApp(controlled.storage);
    const { snapshot } = present(controlled.saves[0]);
    expect(snapshot).toEqual(createSnapshot(app.workspace(), snapshot.savedAt));
  });
});

describe('legacy workspaces (saved before the Phase 1.4 project rules)', () => {
  type StoredRecord = Record<string, unknown> & {
    revision: number;
    workspace: {
      projects: Record<string, unknown>[];
      tasks: Record<string, unknown>[];
    };
  };

  /**
   * Saves a workspace with a project and one open task, then rewrites the stored
   * project the way an older build could have left it (status was freely settable).
   */
  async function storeLegacy(mutate: (record: StoredRecord) => void) {
    const controlled = createControlledStorage();
    const first = await readyApp(controlled.storage);
    const project = addProject(first, 'Website');
    unwrap(
      first.commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design',
        assigneeId: EMP.sarah,
      }),
    );
    await first.lifecycle.flush();
    const record = (await controlled.storage.load()) as StoredRecord;
    mutate(record);
    await controlled.storage.save(record as never, { expectedRevision: 'any' });
    const stored = (await controlled.storage.load()) as StoredRecord;
    controlled.saves.length = 0;
    return { controlled, stored, projectId: project.id };
  }

  const setProject = (status: string) => (record: StoredRecord) => {
    const project = present(record.workspace.projects[0]);
    project.status = status;
  };

  it('loads a valid pre-1.4 workspace normally, and again after a reload', async () => {
    // Archived with open work was, and still is, a valid state.
    const { controlled, stored } = await storeLegacy(setProject('archived'));
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();
    expect(app.app().phase).toEqual({ status: 'ready', storage: 'persistent' });
    expect(controlled.saves).toHaveLength(0);

    const reloaded = createApp(controlled.storage);
    await reloaded.lifecycle.initialize();
    expect(reloaded.app().phase.status).toBe('ready');
    expect(reloaded.workspace()).toEqual(app.workspace());
    expect(await controlled.storage.load()).toEqual(stored);
  });

  it('stops for recovery on a completed project with an unfinished task, keeping the data', async () => {
    const { controlled, stored } = await storeLegacy(setProject('completed'));
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();

    expect(app.app().phase).toEqual({
      status: 'recovery_required',
      reason: 'invalid_relationships',
      message: 'The workspace data is inconsistent (1 problem).',
      details: ['Project "Website" is marked completed but still has 1 open task.'],
      repairs: ['Reopen "Website" as active (it is marked completed but has 1 open task).'],
    });
    expect(app.commands.createProject(USER_ACTOR, { name: 'x' }).ok).toBe(false);
    expect(controlled.saves).toHaveLength(0);
    expect(await controlled.storage.load()).toEqual(stored);
    expect(await controlled.storage.listBackups()).toEqual([]);
  });

  it('exports the invalid data exactly as saved', async () => {
    const { controlled, stored } = await storeLegacy(setProject('completed'));
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();
    const download = unwrap(await app.lifecycle.exportRecoveryData());
    expect(JSON.parse(download.contents) as unknown).toMatchObject({ stored });
    expect(await controlled.storage.load()).toEqual(stored);
  });

  it('repairs only when asked: backs up the original, reopens the project, keeps every task', async () => {
    const { controlled, stored, projectId } = await storeLegacy(setProject('completed'));
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();

    const result = unwrap(await app.lifecycle.repairWorkspace());
    expect(result.repaired).toHaveLength(1);
    expect(app.app()).toMatchObject({
      phase: { status: 'ready', storage: 'persistent' },
      operation: null,
    });
    expect(app.workspace().projects[projectId]?.status).toBe('active');
    expect(Object.values(app.workspace().tasks).map((task) => task.title)).toEqual(['Design']);

    const backups = await controlled.storage.listBackups();
    expect(backups).toEqual([
      expect.objectContaining({ reason: 'pre-repair', payload: stored }) as unknown,
    ]);
    expect(controlled.saves.at(-1)?.options).toEqual({ expectedRevision: stored.revision });

    const reloaded = createApp(controlled.storage);
    await reloaded.lifecycle.initialize();
    expect(reloaded.app().phase.status).toBe('ready');
    expect(reloaded.workspace()).toEqual(app.workspace());
  });

  it('does not repair if the saved data changed since it was checked', async () => {
    const { controlled } = await storeLegacy(setProject('completed'));
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();

    // Another tab writes in between (here: the same invalid data, a newer revision).
    const current = (await controlled.storage.load()) as StoredRecord;
    const racing: StorageService = {
      ...controlled.storage,
      load: async () => {
        const record = (await controlled.storage.load()) as StoredRecord;
        await controlled.storage.save(record as never, { expectedRevision: 'any' });
        return record;
      },
    };
    const raced = createApp(racing);
    await raced.lifecycle.initialize();
    const result = await raced.lifecycle.repairWorkspace();
    expect(result).toMatchObject({ ok: false, error: { kind: 'conflict' } });
    expect(raced.app().phase.status).toBe('recovery_required');
    const after = (await controlled.storage.load()) as StoredRecord;
    expect(after.workspace).toEqual(current.workspace);
    expect(present(after.workspace.projects[0]).status).toBe('completed');
  });

  it('offers no repair for an archived project that breaks another invariant', async () => {
    const { controlled, stored } = await storeLegacy((record) => {
      setProject('archived')(record);
      const task = present(record.workspace.tasks[0]);
      task.status = 'in_progress';
      task.assigneeId = null;
    });
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();

    expect(app.app().phase).toMatchObject({
      status: 'recovery_required',
      reason: 'invalid_relationships',
      details: ['Active task "Design" has no assignee.'],
      repairs: [],
    });
    expect(await app.lifecycle.repairWorkspace()).toMatchObject({
      ok: false,
      error: { kind: 'not_available' },
    });
    expect(await controlled.storage.load()).toEqual(stored);
  });

  it('offers no repair for partially corrupted data, and leaves it untouched', async () => {
    const { controlled, stored } = await storeLegacy((record) => {
      setProject('completed')(record);
      present(record.workspace.tasks[0]).departmentId = 'dept_gone';
    });
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();

    expect(app.app().phase).toMatchObject({ status: 'recovery_required', repairs: [] });
    const { phase } = app.app();
    expect(phase.status === 'recovery_required' ? phase.details : []).toHaveLength(2);
    expect(controlled.saves).toHaveLength(0);
    expect(await controlled.storage.load()).toEqual(stored);
  });

  it('rejects a lifecycle status that does not exist, without a repair', async () => {
    const { controlled, stored } = await storeLegacy(setProject('paused'));
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();
    expect(app.app().phase).toMatchObject({
      status: 'recovery_required',
      reason: 'invalid_structure',
      repairs: [],
    });
    expect(await controlled.storage.load()).toEqual(stored);
  });

  it('can still be recovered by importing a valid file or resetting', async () => {
    const { file, state } = await otherWorkspaceFile();
    const { controlled } = await storeLegacy(setProject('completed'));
    const app = createApp(controlled.storage);
    await app.lifecycle.initialize();
    unwrap(await app.lifecycle.importWorkspace(file));
    expect(app.workspace()).toEqual(state);
  });

  it('rejects importing a file with the same problem', async () => {
    const app = await readyApp();
    const { stored } = await storeLegacy(setProject('completed'));
    const file = JSON.stringify({ ...stored, exportedAt: 'x' });
    expect(await app.lifecycle.importWorkspace(file)).toMatchObject({
      ok: false,
      error: { kind: 'invalid_relationships' },
    });
  });
});
