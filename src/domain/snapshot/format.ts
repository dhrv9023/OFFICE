import type { WorkspaceRecords } from '../rules/workspaceIntegrity';
import type { WorkspaceState } from '../types/workspace';

/**
 * The serialised form of a workspace — used both for the saved copy in the browser
 * database and for export files, so the two share one schema version and one
 * migration path.
 *
 * Entities are stored as flat lists (not ID-keyed maps): easier to read by hand,
 * and duplicate IDs stay detectable when the data is read back.
 */
export const SNAPSHOT_FORMAT = 'project-hq-workspace';

/**
 * Version of the data SHAPE inside a snapshot. Bump it whenever a domain type
 * changes in a way old data does not satisfy, and add a migration (migrations.ts).
 */
export const SNAPSHOT_SCHEMA_VERSION = 5;

export interface WorkspaceSnapshot {
  readonly format: typeof SNAPSHOT_FORMAT;
  readonly schemaVersion: number;
  readonly savedAt: string;
  readonly workspace: WorkspaceRecords;
}

export interface WorkspaceSummary {
  readonly departments: number;
  readonly employees: number;
  readonly projects: number;
  readonly tasks: number;
  readonly meetings: number;
  readonly activityEvents: number;
  readonly notifications: number;
}

/** An export file: a snapshot plus human-oriented metadata. */
export interface WorkspaceExport {
  readonly format: typeof SNAPSHOT_FORMAT;
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly generator: string;
  readonly summary: WorkspaceSummary;
  readonly workspace: WorkspaceRecords;
}

export function toRecords(state: WorkspaceState): WorkspaceRecords {
  return {
    departments: Object.values(state.departments),
    employees: Object.values(state.employees),
    projects: Object.values(state.projects),
    tasks: Object.values(state.tasks),
    meetings: Object.values(state.meetings),
    activity: state.activity,
    notifications: state.notifications,
    accessProfiles: Object.values(state.accessProfiles),
    approvals: state.approvals,
    executions: state.executions,
    // Configurations hold no credentials (there is no field for them); exported as is.
    agentConfigs: Object.values(state.agentConfigs),
    messages: state.messages,
  };
}

export function summarize(state: WorkspaceState): WorkspaceSummary {
  return {
    departments: Object.keys(state.departments).length,
    employees: Object.keys(state.employees).length,
    projects: Object.keys(state.projects).length,
    tasks: Object.keys(state.tasks).length,
    meetings: Object.keys(state.meetings).length,
    activityEvents: state.activity.length,
    notifications: state.notifications.length,
  };
}

export function createSnapshot(state: WorkspaceState, savedAt: string): WorkspaceSnapshot {
  return {
    format: SNAPSHOT_FORMAT,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    savedAt,
    workspace: toRecords(state),
  };
}

export function createExport(state: WorkspaceState, exportedAt: string): WorkspaceExport {
  return {
    format: SNAPSHOT_FORMAT,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt,
    generator: 'Project HQ',
    summary: summarize(state),
    workspace: toRecords(state),
  };
}

/** Human-readable JSON (two-space indent, trailing newline). */
export function serializeExport(document: WorkspaceExport): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** `project-hq-workspace-YYYY-MM-DD.json`, dated from the ISO timestamp (UTC). */
export function exportFilename(exportedAt: string): string {
  return `project-hq-workspace-${exportedAt.slice(0, 10)}.json`;
}
