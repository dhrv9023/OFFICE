import type { Clock } from '@/domain/clock';
import { err, ok, type Result } from '@/domain/result';
import {
  createExport,
  createSnapshot,
  exportFilename,
  serializeExport,
  summarize,
  type WorkspaceSummary,
} from '@/domain/snapshot/format';
import type { MigrationConfig } from '@/domain/snapshot/migrations';
import {
  parseSnapshotJson,
  planWorkspaceRepair,
  restoreWorkspace,
  type SnapshotErrorKind,
} from '@/domain/snapshot/restore';
import type { OfficeLayout, WorkspaceState } from '@/domain/types';
import { createAutosaver } from '@/services/storage/autosave';
import {
  describeStorageError,
  readRevision,
  StorageError,
  type StorageErrorKind,
  type StorageService,
} from '@/services/storage/types';
import type { AppState } from '@/stores/internal/appStore';
import type { WorkspaceStorePort } from './createCommands';

export interface LifecycleError {
  readonly kind: 'not_available' | SnapshotErrorKind | StorageErrorKind;
  readonly message: string;
  readonly details: readonly string[];
}

export interface FileDownload {
  readonly filename: string;
  readonly contents: string;
}

export interface ImportOutcome {
  readonly summary: WorkspaceSummary;
  /** True when the file was written by an older version and was upgraded. */
  readonly migrated: boolean;
}

export interface ImportPreview {
  readonly summary: WorkspaceSummary;
  /** The schema version the file was written with. */
  readonly sourceVersion: number;
  /** True when the file is from an older version and will be upgraded on import. */
  readonly migrated: boolean;
}

export interface LifecycleDependencies {
  readonly workspace: WorkspaceStorePort;
  readonly app: {
    getState(): AppState;
    update(patch: Partial<AppState>): void;
  };
  readonly storage: StorageService;
  readonly clock: Clock;
  readonly layout: OfficeLayout;
  /** Builds the deterministic first-run workspace. */
  readonly createSeed: () => WorkspaceState;
  /** Subscribes to workspace changes; returns an unsubscribe function. */
  readonly subscribe: (listener: () => void) => () => void;
  /** Called after the whole workspace was swapped, so selections can be cleared. */
  readonly onWorkspaceReplaced?: () => void;
  /** Overridable for tests; defaults to the app's real migrations. */
  readonly migrations?: MigrationConfig;
}

/**
 * Operations that load or replace the WHOLE workspace: start-up hydration, import,
 * reset and recovery. They sit beside the business commands as the only other
 * writer of the workspace store, with one hard rule: a workspace only ever enters
 * the store after passing `restoreWorkspace` (or being fresh seed data).
 *
 * They are deliberately not part of `Commands`: they take no Actor and are meant
 * for the human operator only — an AI agent must never be able to reset or
 * replace the company.
 */
export interface WorkspaceLifecycle {
  /** Opens storage and loads (or first-time seeds) the workspace. Idempotent. */
  initialize(): Promise<void>;
  /** Runs initialisation again after `error` or `recovery_required`. */
  retry(): Promise<void>;
  /** From `error` only: work on fresh seed data in memory. Nothing is saved or overwritten. */
  continueWithoutSaving(): Result<void, LifecycleError>;
  /** The current workspace as a human-readable JSON file. */
  exportWorkspace(): Result<FileDownload, LifecycleError>;
  /** The saved record exactly as stored, for manual recovery when it cannot be loaded. */
  exportRecoveryData(): Promise<Result<FileDownload, LifecycleError>>;
  /**
   * Backups kept in this browser (before a migration, repair or overwrite), newest
   * first, each ready to download. They are never restored automatically.
   */
  listBackups(): Promise<
    Result<readonly { createdAt: string; reason: string; download: FileDownload }[], LifecycleError>
  >;
  /** Validates an export file exactly as import would, without changing anything. */
  previewImport(json: string): Result<ImportPreview, LifecycleError>;
  /** Replaces the workspace with the contents of an export file, or changes nothing. */
  importWorkspace(json: string): Promise<Result<ImportOutcome, LifecycleError>>;
  /**
   * From `recovery_required` only: applies the repairs listed in the phase to the
   * saved data. The original record is kept as a backup first, and nothing is
   * written if the saved data changed since it was checked. The caller must have
   * confirmed with the user.
   */
  repairWorkspace(): Promise<Result<{ repaired: readonly string[] }, LifecycleError>>;
  /** Replaces the workspace with fresh seed data. The caller must have confirmed with the user. */
  resetWorkspace(): Promise<Result<void, LifecycleError>>;
  /** Retries a failed save. */
  retrySave(): Promise<void>;
  /**
   * After a save conflict (another tab saved newer data), on the user's explicit
   * choice: keep this tab's workspace. The newer saved copy is kept as a backup.
   */
  keepThisVersion(): Promise<void>;
  /** Resolves when all changes so far have been written. */
  flush(): Promise<void>;
}

const storageFailure = (error: unknown): LifecycleError => ({
  ...describeStorageError(error),
  details: [],
});

const notAvailable = (message: string): LifecycleError => ({
  kind: 'not_available',
  message,
  details: [],
});

export function createWorkspaceLifecycle(dependencies: LifecycleDependencies): WorkspaceLifecycle {
  const { workspace, app, storage, clock, layout, createSeed, migrations } = dependencies;

  const autosaver = createAutosaver({
    storage,
    clock,
    getState: () => workspace.getState(),
    subscribe: dependencies.subscribe,
    onStatus: (save) => {
      app.update({ save });
    },
  });

  let initialization: Promise<void> | null = null;

  /** Makes `state` the live workspace. `revision` is its revision on disk; `'memory'` = not saved. */
  const adopt = (state: WorkspaceState, revision: number | null | 'memory'): void => {
    workspace.setState(state);
    dependencies.onWorkspaceReplaced?.();
    if (revision === 'memory') {
      app.update({ phase: { status: 'ready', storage: 'memory' }, save: { state: 'idle' } });
    } else {
      autosaver.start(state, revision);
      app.update({
        phase: { status: 'ready', storage: 'persistent' },
        save: { state: 'saved', at: clock.now() },
      });
    }
  };

  const failStartup = (error: unknown): void => {
    app.update({ phase: { status: 'error', ...describeStorageError(error) } });
  };

  const runInitialization = async (): Promise<void> => {
    app.update({ phase: { status: 'initializing' }, operation: null, save: { state: 'idle' } });

    let stored: unknown;
    try {
      await storage.open();
      stored = await storage.load();

      if (stored === null) {
        // First run: seed, and make sure the seed is on disk before going live.
        const seed = createSeed();
        try {
          const revision = await storage.save(createSnapshot(seed, clock.now()), {
            expectedRevision: null,
          });
          adopt(seed, revision);
          return;
        } catch (error) {
          // Another tab seeded at the same moment: use what it saved instead.
          if (!(error instanceof StorageError) || error.kind !== 'conflict') throw error;
          stored = await storage.load();
        }
      }
    } catch (error) {
      failStartup(error);
      return;
    }

    const restored = restoreWorkspace(stored, layout, migrations);
    if (!restored.ok) {
      // The saved record is left exactly as it is. Nothing is seeded or overwritten.
      // If the only problems are ones the user may choose to repair, say so.
      const repair =
        restored.error.kind === 'invalid_relationships'
          ? planWorkspaceRepair(stored, layout, clock.now(), migrations)
          : null;
      app.update({
        phase: {
          status: 'recovery_required',
          reason: restored.error.kind,
          message: restored.error.message,
          details: restored.error.details,
          repairs: repair?.ok ? repair.value.changes.map((change) => change.description) : [],
        },
      });
      return;
    }

    let revision = readRevision(stored);
    if (restored.value.migrated) {
      // Keep the pre-upgrade record, then write the upgraded one. If either step
      // fails we stop here rather than run on data that is not safely on disk.
      try {
        await storage.saveBackup({
          createdAt: clock.now(),
          reason: 'pre-migration',
          payload: stored,
        });
        revision = await storage.save(createSnapshot(restored.value.state, clock.now()), {
          expectedRevision: revision,
        });
      } catch (error) {
        failStartup(error);
        return;
      }
    }

    adopt(restored.value.state, revision);
  };

  const initialize = (): Promise<void> => {
    initialization ??= runInitialization();
    return initialization;
  };

  /** Import and reset are possible with a live workspace or from the recovery screen. */
  const checkReplaceable = (): Result<{ persistent: boolean }, LifecycleError> => {
    const { phase, operation } = app.getState();
    if (operation !== null) {
      return err(notAvailable('Another workspace operation is still in progress.'));
    }
    if (phase.status === 'ready') return ok({ persistent: phase.storage === 'persistent' });
    if (phase.status === 'recovery_required') return ok({ persistent: true });
    return err(notAvailable('The workspace is not available yet.'));
  };

  /**
   * Swaps in a whole new workspace, storage first: the new state only becomes
   * live after it is safely written. If the write fails, memory and disk both
   * still hold the previous workspace and autosaving carries on as before.
   */
  const replaceWorkspace = async (
    operation: 'importing' | 'resetting',
    next: WorkspaceState,
    persistent: boolean,
    clearBackups: boolean,
  ): Promise<Result<void, LifecycleError>> => {
    const wasReady = app.getState().phase.status === 'ready';
    app.update({ operation });
    try {
      if (!persistent) {
        adopt(next, 'memory');
        return ok(undefined);
      }

      await autosaver.pause();
      try {
        const revision = await storage.save(createSnapshot(next, clock.now()), {
          expectedRevision: 'any',
          clearBackups,
        });
        adopt(next, revision);
        return ok(undefined);
      } catch (error) {
        if (wasReady) autosaver.resume();
        return err(storageFailure(error));
      }
    } finally {
      app.update({ operation: null });
    }
  };

  return {
    initialize,

    retry() {
      const { status } = app.getState().phase;
      if (status === 'error' || status === 'recovery_required') initialization = null;
      return initialize();
    },

    continueWithoutSaving() {
      if (app.getState().phase.status !== 'error') {
        return err(notAvailable('This is only possible after a storage error.'));
      }
      adopt(createSeed(), 'memory');
      return ok(undefined);
    },

    exportWorkspace() {
      if (app.getState().phase.status !== 'ready') {
        return err(notAvailable('The workspace is not loaded, so there is nothing to export.'));
      }
      const exportedAt = clock.now();
      return ok({
        filename: exportFilename(exportedAt),
        contents: serializeExport(createExport(workspace.getState(), exportedAt)),
      });
    },

    async exportRecoveryData() {
      try {
        const stored = await storage.load();
        if (stored === null) return err(notAvailable('There is no saved data to export.'));
        const exportedAt = clock.now();
        return ok({
          filename: `project-hq-recovery-${exportedAt.slice(0, 10)}.json`,
          contents: `${JSON.stringify({ format: 'project-hq-recovery', exportedAt, stored }, null, 2)}\n`,
        });
      } catch (error) {
        return err(storageFailure(error));
      }
    },

    async listBackups() {
      try {
        const backups = await storage.listBackups();
        return ok(
          [...backups]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((backup) => ({
              createdAt: backup.createdAt,
              reason: backup.reason,
              download: {
                filename: `project-hq-backup-${backup.reason}-${backup.createdAt.slice(0, 19).replace(/:/g, '-')}.json`,
                // The saved record itself, so the file can be imported directly.
                contents: `${JSON.stringify(backup.payload, null, 2)}\n`,
              },
            })),
        );
      } catch (error) {
        return err(storageFailure(error));
      }
    },

    previewImport(json) {
      const parsed = parseSnapshotJson(json);
      if (!parsed.ok) return parsed;
      const restored = restoreWorkspace(parsed.value, layout, migrations);
      if (!restored.ok) return restored;
      return ok({
        summary: summarize(restored.value.state),
        sourceVersion: restored.value.sourceVersion,
        migrated: restored.value.migrated,
      });
    },

    async importWorkspace(json) {
      const allowed = checkReplaceable();
      if (!allowed.ok) return allowed;

      // Everything up to here is pure: a rejected file has touched nothing.
      const parsed = parseSnapshotJson(json);
      if (!parsed.ok) return parsed;
      const restored = restoreWorkspace(parsed.value, layout, migrations);
      if (!restored.ok) return restored;

      const replaced = await replaceWorkspace(
        'importing',
        restored.value.state,
        allowed.value.persistent,
        false,
      );
      if (!replaced.ok) return replaced;
      return ok({ summary: summarize(restored.value.state), migrated: restored.value.migrated });
    },

    async repairWorkspace() {
      const { phase, operation } = app.getState();
      if (
        phase.status !== 'recovery_required' ||
        phase.repairs.length === 0 ||
        operation !== null
      ) {
        return err(notAvailable('There is no repair to apply.'));
      }
      app.update({ operation: 'repairing' });
      try {
        const stored = await storage.load();
        const plan = planWorkspaceRepair(stored, layout, clock.now(), migrations);
        if (!plan.ok) return plan;
        // Keep the record exactly as found, then write the repaired workspace only if
        // the saved copy is still the one that was checked (revision guard).
        await storage.saveBackup({ createdAt: clock.now(), reason: 'pre-repair', payload: stored });
        const revision = await storage.save(createSnapshot(plan.value.state, clock.now()), {
          expectedRevision: readRevision(stored),
        });
        adopt(plan.value.state, revision);
        return ok({ repaired: plan.value.changes.map((change) => change.description) });
      } catch (error) {
        return err(storageFailure(error));
      } finally {
        app.update({ operation: null });
      }
    },

    async resetWorkspace() {
      const allowed = checkReplaceable();
      if (!allowed.ok) return allowed;
      return replaceWorkspace('resetting', createSeed(), allowed.value.persistent, true);
    },

    retrySave: () => autosaver.retry(),

    keepThisVersion: () => autosaver.overwrite(),

    flush: () => autosaver.flush(),
  };
}
