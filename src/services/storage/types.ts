import type { WorkspaceSnapshot } from '@/domain/snapshot/format';

export type StorageErrorKind =
  /** The browser has no usable IndexedDB (disabled, private mode, unsupported). */
  | 'unavailable'
  /** The database could not be opened or upgraded. */
  | 'open_failed'
  /** The database was created by a newer version of the app. */
  | 'newer_version'
  /** Another tab is holding an older version of the database open. */
  | 'blocked'
  | 'read_failed'
  | 'write_failed'
  /** The browser refused the write because the storage quota is exhausted. */
  | 'quota_exceeded'
  /** The saved copy changed underneath us (typically another tab). Nothing was written. */
  | 'conflict';

export class StorageError extends Error {
  readonly kind: StorageErrorKind;

  constructor(kind: StorageErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
    this.kind = kind;
  }
}

/** Flattens any thrown value into something that can be stored in state and shown. */
export function describeStorageError(error: unknown): { kind: StorageErrorKind; message: string } {
  if (error instanceof StorageError) return { kind: error.kind, message: error.message };
  return {
    kind: 'write_failed',
    message: error instanceof Error ? error.message : 'An unknown storage error occurred.',
  };
}

export interface SaveOptions {
  /**
   * Optimistic concurrency check, evaluated inside the write transaction:
   *  - a number: the saved copy must currently be at exactly this revision;
   *  - `null`:   there must be no saved copy yet;
   *  - `'any'`:  overwrite whatever is there (import and reset only).
   * A mismatch rejects with a `conflict` StorageError and writes nothing.
   */
  readonly expectedRevision: number | null | 'any';
  /** Also delete all backups, in the same transaction (reset). */
  readonly clearBackups?: boolean;
}

export type BackupReason = 'pre-migration' | 'pre-repair' | 'pre-overwrite';

export interface BackupRecord {
  readonly createdAt: string;
  readonly reason: BackupReason;
  /** The saved record exactly as it was found. */
  readonly payload: unknown;
}

/**
 * Durable storage for one workspace. Implementations know nothing about business
 * rules or application state: they store and return snapshots, and report failure
 * by rejecting with a `StorageError`.
 *
 * The storage owns the `revision` counter: every successful save increments it and
 * returns the new value. Callers pass the revision they last saw, which is what
 * makes stale writes detectable.
 */
export interface StorageService {
  readonly kind: 'indexeddb' | 'memory';
  /** Opens (creating or upgrading if needed) the database. Safe to call repeatedly. */
  open(): Promise<void>;
  /** Whether storage can be used right now. Never rejects. */
  checkAvailability(): Promise<{ available: true } | { available: false; error: StorageError }>;
  /**
   * The saved record exactly as stored, or null when nothing has been saved.
   * The result is UNTRUSTED: validate it with `restoreWorkspace` before use.
   */
  load(): Promise<unknown>;
  /** Atomically replaces the saved workspace. Resolves with the new revision. */
  save(snapshot: WorkspaceSnapshot, options: SaveOptions): Promise<number>;
  /** Deletes the saved workspace and all backups. */
  clear(): Promise<void>;
  /** Keeps a copy of a record that is about to be replaced. Only the newest few are kept. */
  saveBackup(backup: BackupRecord): Promise<void>;
  listBackups(): Promise<BackupRecord[]>;
  close(): void;
}

/** How many backups are retained. */
export const MAX_BACKUPS = 3;

/** The revision of a stored record, or null if it has none that can be trusted. */
export function readRevision(record: unknown): number | null {
  if (typeof record !== 'object' || record === null) return null;
  const { revision } = record as { revision?: unknown };
  return typeof revision === 'number' && Number.isInteger(revision) && revision >= 1
    ? revision
    : null;
}

export function conflictError(expected: number | null, actual: number | null): StorageError {
  const describe = (revision: number | null): string =>
    revision === null ? 'no saved copy' : `revision ${revision}`;
  return new StorageError(
    'conflict',
    `The saved workspace changed since it was loaded (expected ${describe(expected)}, found ${describe(actual)}). It may be open in another tab. Reload to continue.`,
  );
}
