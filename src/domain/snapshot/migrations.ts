import { err, ok, type Result } from '../result';
import type { DepartmentId, EmployeeId } from '../ids';
import { defaultAgentConfig } from '../rules/agentConfig';
import { defaultGrants } from '../rules/access';
import { SNAPSHOT_SCHEMA_VERSION } from './format';

/**
 * A migration upgrades the `workspace` payload of a snapshot by exactly one schema
 * version. It receives untrusted data (`unknown`) and must return the next shape;
 * it may throw if the data cannot be upgraded. Migrations are pure and are never
 * edited once released — a later change means a new version and a new migration.
 */
export type SnapshotMigration = (workspace: unknown) => unknown;

export interface MigrationConfig {
  /** The schema version this build of the app reads and writes. */
  readonly currentVersion: number;
  /** Keyed by the version migrated FROM: `migrations[1]` turns v1 data into v2. */
  readonly migrations: Readonly<Record<number, SnapshotMigration>>;
}

/** Permissions introduced in schema v5 (Phase 2.0). */
const V5_READS = new Set<string>([
  'employee.read',
  'task.read',
  'project.read',
  'meeting.read',
  'message.read',
  'message.send',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * v1 → v2 (Phase 1.6): tasks gain an optional `deadline` (none for existing
 * tasks) and the workspace gains a `meetings` list (empty). Nothing else changes;
 * anything already malformed is left for the decoder to report.
 */
export function migrateV1ToV2(workspace: unknown): unknown {
  if (!isRecord(workspace)) throw new Error('the workspace is not an object');
  const tasks = Array.isArray(workspace.tasks)
    ? (workspace.tasks as unknown[]).map((task) =>
        isRecord(task) && !('deadline' in task) ? { ...task, deadline: null } : task,
      )
    : workspace.tasks;
  return {
    ...workspace,
    tasks,
    meetings: 'meetings' in workspace ? workspace.meetings : [],
  };
}

const withDefaults = (list: unknown, defaults: Record<string, unknown>): unknown =>
  Array.isArray(list)
    ? (list as unknown[]).map((item) => {
        if (!isRecord(item)) return item;
        const missing = Object.fromEntries(
          Object.entries(defaults).filter(([key]) => !(key in item)),
        );
        return { ...item, ...missing };
      })
    : list;

/**
 * v2 → v3 (Phase 1.7): meetings gain a start time, duration and project (none
 * for existing meetings — times are never invented); activity events gain a
 * meeting reference (none for existing events); tasks gain a blocked reason
 * (none: older reasons live only in the activity text, which is unchanged).
 */
export function migrateV2ToV3(workspace: unknown): unknown {
  if (!isRecord(workspace)) throw new Error('the workspace is not an object');
  return {
    ...workspace,
    tasks: withDefaults(workspace.tasks, { blockedReason: null }),
    meetings: withDefaults(workspace.meetings, {
      startsAt: null,
      durationMinutes: null,
      projectId: null,
    }),
    activity: withDefaults(workspace.activity, { meetingId: null }),
  };
}

/**
 * v3 → v4 (Phase 1.8): every employee gets an access profile with the default
 * grants for their role, **disabled** (no AI acts until the founder enables it);
 * the workspace gains empty approval and execution histories. Deterministic: the
 * profile's timestamp is the employee's own creation time.
 */
export function migrateV3ToV4(workspace: unknown): unknown {
  if (!isRecord(workspace)) throw new Error('the workspace is not an object');
  if (!Array.isArray(workspace.employees)) throw new Error('the workspace has no employee list');
  const accessProfiles =
    'accessProfiles' in workspace
      ? workspace.accessProfiles
      : (workspace.employees as unknown[]).map((employee) => {
          if (!isRecord(employee)) throw new Error('an employee is not an object');
          return {
            employeeId: employee.id,
            status: 'disabled',
            // Exactly the Phase 1.8 defaults: read grants arrive in v4 → v5.
            grants: defaultGrants({ departmentId: employee.departmentId as DepartmentId }).filter(
              (grant) => !V5_READS.has(grant.permission),
            ),
            updatedAt: employee.createdAt,
          };
        });
  return {
    ...workspace,
    accessProfiles,
    approvals: 'approvals' in workspace ? workspace.approvals : [],
    executions: 'executions' in workspace ? workspace.executions : [],
  };
}

/**
 * v4 → v5 (Phase 2.0): read permissions exist now, and writing never implies
 * reading, so each profile gains its role's default READ grants (existing grants
 * are kept as they are; nothing is removed or widened). Every employee gets an
 * unconfigured agent configuration (no provider); messages start empty.
 * Deterministic: timestamps come from the employee's own createdAt.
 */
export function migrateV4ToV5(workspace: unknown): unknown {
  if (!isRecord(workspace)) throw new Error('the workspace is not an object');
  if (!Array.isArray(workspace.employees)) throw new Error('the workspace has no employee list');
  const employees = workspace.employees as unknown[];
  const departmentOf = new Map<unknown, DepartmentId>();
  for (const employee of employees) {
    if (!isRecord(employee)) throw new Error('an employee is not an object');
    departmentOf.set(employee.id, employee.departmentId as DepartmentId);
  }
  const accessProfiles = Array.isArray(workspace.accessProfiles)
    ? (workspace.accessProfiles as unknown[]).map((profile) => {
        if (!isRecord(profile) || !Array.isArray(profile.grants)) return profile;
        const departmentId = departmentOf.get(profile.employeeId);
        if (!departmentId) return profile;
        const held = new Set(
          (profile.grants as unknown[]).map((grant) => (isRecord(grant) ? grant.permission : null)),
        );
        const added = defaultGrants({ departmentId }).filter(
          (grant) => V5_READS.has(grant.permission) && !held.has(grant.permission),
        );
        // Reads first, as in the role defaults, so a migrated default profile equals a new one.
        return { ...profile, grants: [...added, ...(profile.grants as unknown[])] };
      })
    : workspace.accessProfiles;
  return {
    ...workspace,
    accessProfiles,
    agentConfigs:
      'agentConfigs' in workspace
        ? workspace.agentConfigs
        : employees.map((employee) => {
            const record = employee as Record<string, unknown>;
            return {
              ...defaultAgentConfig({ id: record.id as EmployeeId }, String(record.createdAt)),
            };
          }),
    messages: 'messages' in workspace ? workspace.messages : [],
  };
}

/** v1: first release; v2: 1.6; v3: 1.7 (meeting times); v4: 1.8 (access); v5: 2.0 (reads, agents). */
export const SNAPSHOT_MIGRATIONS: MigrationConfig = {
  currentVersion: SNAPSHOT_SCHEMA_VERSION,
  migrations: { 1: migrateV1ToV2, 2: migrateV2ToV3, 3: migrateV3ToV4, 4: migrateV4ToV5 },
};

export type MigrationError =
  | { readonly kind: 'unsupported_version'; readonly message: string }
  | { readonly kind: 'migration_failed'; readonly message: string };

export interface MigrationOutcome {
  readonly workspace: unknown;
  /** Versions stepped through, e.g. [1, 2] when v1 data was brought to v3. Empty if none. */
  readonly appliedFrom: readonly number[];
}

/**
 * Brings a payload from `fromVersion` up to the current version, one step at a time.
 * Never guesses: an unknown or newer version, a missing step or a throwing step all
 * produce an error and leave the caller's data untouched.
 */
export function migrateWorkspace(
  workspace: unknown,
  fromVersion: number,
  config: MigrationConfig = SNAPSHOT_MIGRATIONS,
): Result<MigrationOutcome, MigrationError> {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    return err({
      kind: 'unsupported_version',
      message: `Schema version "${String(fromVersion)}" is not a valid version number.`,
    });
  }
  if (fromVersion > config.currentVersion) {
    return err({
      kind: 'unsupported_version',
      message: `This data uses schema version ${fromVersion}, but this version of Project HQ only understands versions up to ${config.currentVersion}. Update Project HQ and try again.`,
    });
  }

  let current = workspace;
  const appliedFrom: number[] = [];

  for (let version = fromVersion; version < config.currentVersion; version += 1) {
    const migrate = config.migrations[version];
    if (!migrate) {
      return err({
        kind: 'migration_failed',
        message: `No migration is available from schema version ${version} to ${version + 1}.`,
      });
    }
    try {
      current = migrate(current);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return err({
        kind: 'migration_failed',
        message: `Upgrading the data from schema version ${version} to ${version + 1} failed: ${reason}`,
      });
    }
    appliedFrom.push(version);
  }

  return ok({ workspace: current, appliedFrom });
}
