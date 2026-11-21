import { err, ok, type Result } from '../result';
import { buildWorkspace, type WorkspaceRecords } from '../rules/workspaceIntegrity';
import type { OfficeLayout } from '../types/office';
import type { WorkspaceState } from '../types/workspace';
import { decodeWorkspaceRecords } from './decode';
import { SNAPSHOT_FORMAT } from './format';
import { repairRecords, type RepairChange } from './repair';
import { migrateWorkspace, SNAPSHOT_MIGRATIONS, type MigrationConfig } from './migrations';

export type SnapshotErrorKind =
  /** The text is not JSON at all. */
  | 'invalid_json'
  /** JSON, but not a Project HQ workspace document. */
  | 'malformed'
  /** Written by a newer Project HQ, or carrying a nonsensical version. */
  | 'unsupported_version'
  /** An older version that could not be upgraded. */
  | 'migration_failed'
  /** An entity is missing a field or has a value of the wrong type. */
  | 'invalid_structure'
  /** Entities are well-formed but inconsistent with each other. */
  | 'invalid_relationships';

export interface SnapshotError {
  readonly kind: SnapshotErrorKind;
  /** One sentence suitable for showing to the user. */
  readonly message: string;
  /** Individual problems, most useful first. May be empty. */
  readonly details: readonly string[];
}

export interface RestoredWorkspace {
  readonly state: WorkspaceState;
  /** The schema version the data was written with. */
  readonly sourceVersion: number;
  /** True when at least one migration was applied to bring it up to date. */
  readonly migrated: boolean;
}

/** Keeps error reports readable when a file is thoroughly broken. */
const MAX_DETAILS = 25;

function snapshotError(
  kind: SnapshotErrorKind,
  message: string,
  details: readonly string[] = [],
): SnapshotError {
  const shown = details.slice(0, MAX_DETAILS);
  if (details.length > MAX_DETAILS) shown.push(`…and ${details.length - MAX_DETAILS} more.`);
  return { kind, message, details: shown };
}

export function parseSnapshotJson(json: string): Result<unknown, SnapshotError> {
  try {
    return ok(JSON.parse(json) as unknown);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return err(snapshotError('invalid_json', 'The file is not valid JSON.', [reason]));
  }
}

interface DecodedSnapshot {
  readonly records: WorkspaceRecords;
  readonly sourceVersion: number;
  readonly migrated: boolean;
}

/** Envelope → schema version → migrations → entity structure. No relationship checks. */
function decodeSnapshot(
  raw: unknown,
  config: MigrationConfig,
): Result<DecodedSnapshot, SnapshotError> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return err(snapshotError('malformed', 'This is not a Project HQ workspace.'));
  }
  const envelope = raw as Record<string, unknown>;

  if (envelope.format !== SNAPSHOT_FORMAT) {
    return err(
      snapshotError('malformed', 'This is not a Project HQ workspace.', [
        `Expected "format" to be "${SNAPSHOT_FORMAT}".`,
      ]),
    );
  }
  const { schemaVersion } = envelope;
  if (typeof schemaVersion !== 'number') {
    return err(
      snapshotError('malformed', 'The workspace does not say which schema version it uses.', [
        'Expected "schemaVersion" to be a number.',
      ]),
    );
  }
  if (!('workspace' in envelope)) {
    return err(snapshotError('malformed', 'The workspace data is missing.'));
  }

  const migrated = migrateWorkspace(envelope.workspace, schemaVersion, config);
  if (!migrated.ok) {
    return err(snapshotError(migrated.error.kind, migrated.error.message));
  }

  const decoded = decodeWorkspaceRecords(migrated.value.workspace);
  if (!decoded.ok) {
    return err(
      snapshotError(
        'invalid_structure',
        `The workspace data is damaged or incomplete (${decoded.error.length} problem${decoded.error.length === 1 ? '' : 's'}).`,
        decoded.error.map((error) => error.message),
      ),
    );
  }
  return ok({
    records: decoded.value,
    sourceVersion: schemaVersion,
    migrated: migrated.value.appliedFrom.length > 0,
  });
}

function build(
  decoded: DecodedSnapshot,
  layout: OfficeLayout,
): Result<RestoredWorkspace, SnapshotError> {
  const built = buildWorkspace(decoded.records, layout);
  if (!built.ok) {
    return err(
      snapshotError(
        'invalid_relationships',
        `The workspace data is inconsistent (${built.error.length} problem${built.error.length === 1 ? '' : 's'}).`,
        built.error.map((error) => error.message),
      ),
    );
  }
  return ok({
    state: built.value,
    sourceVersion: decoded.sourceVersion,
    migrated: decoded.migrated,
  });
}

/**
 * The single gate for any workspace data arriving from outside the command path —
 * the saved database record on startup and import files alike:
 *
 *   envelope → schema version → migrations → entity structure → relationships
 *   and current domain invariants (`validateWorkspace`)
 *
 * It is all-or-nothing: the result is either a complete, consistent
 * WorkspaceState or an error describing what is wrong. It never repairs, guesses
 * or partially accepts data.
 */
export function restoreWorkspace(
  raw: unknown,
  layout: OfficeLayout,
  config: MigrationConfig = SNAPSHOT_MIGRATIONS,
): Result<RestoredWorkspace, SnapshotError> {
  const decoded = decodeSnapshot(raw, config);
  return decoded.ok ? build(decoded.value, layout) : decoded;
}

export interface RepairPlan extends RestoredWorkspace {
  readonly changes: readonly RepairChange[];
}

/**
 * What the user-confirmed repair would produce for data that fails only the
 * current lifecycle rules (see `repairRecords`). Pure: nothing is written. Fails
 * if there is nothing to repair, or if problems remain after the repair.
 */
export function planWorkspaceRepair(
  raw: unknown,
  layout: OfficeLayout,
  now: string,
  config: MigrationConfig = SNAPSHOT_MIGRATIONS,
): Result<RepairPlan, SnapshotError> {
  const decoded = decodeSnapshot(raw, config);
  if (!decoded.ok) return decoded;
  const { records, changes } = repairRecords(decoded.value.records, now);
  if (changes.length === 0) {
    return err(
      snapshotError(
        'invalid_relationships',
        'There is nothing that can be repaired automatically.',
      ),
    );
  }
  const built = build({ ...decoded.value, records }, layout);
  return built.ok ? ok({ ...built.value, changes }) : built;
}
