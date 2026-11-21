import { describe, expect, it } from 'vitest';
import { DEPT, EMP } from '../../test/factories';
import { createHarness, present, unwrap } from '../../test/harness';
import { createSeedWorkspace, OFFICE_LAYOUT } from '../seed';
import { USER_ACTOR, type WorkspaceState } from '../types';
import {
  createExport,
  createSnapshot,
  exportFilename,
  serializeExport,
  SNAPSHOT_FORMAT,
  SNAPSHOT_SCHEMA_VERSION,
} from './format';
import { migrateWorkspace, type MigrationConfig } from './migrations';
import { parseSnapshotJson, restoreWorkspace } from './restore';

/** A workspace with a project, two dependent tasks, assignments and history. */
function busyWorkspace(): WorkspaceState {
  const h = createHarness();
  const project = unwrap(
    h.commands.createProject(USER_ACTOR, { name: 'Website', deadline: '2026-12-31' }),
  );
  const design = unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId: project.id,
      departmentId: DEPT.design,
      title: 'Design homepage',
      assigneeId: EMP.sarah,
    }),
  );
  unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId: project.id,
      departmentId: DEPT.frontend,
      title: 'Build homepage',
      assigneeId: EMP.ryan,
      dependencies: [design.id],
    }),
  );
  unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: design.id, status: 'in_progress' }));
  return h.state();
}

/** A JSON round trip, as happens on export → import and on IndexedDB structured clone. */
const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

type Entity = Record<string, unknown>;
type RawSnapshot = Record<string, unknown> & { workspace: Record<string, Entity[]> };

const snapshotOf = (state: WorkspaceState): RawSnapshot =>
  roundTrip(createSnapshot(state, '2026-02-01T10:00:00.000Z')) as RawSnapshot;

/** The `index`-th record of one entity list in a raw snapshot. */
const entity = (raw: RawSnapshot, list: string, index: number): Entity =>
  present(raw.workspace[list]?.[index], `${list}[${index}]`);

describe('export format', () => {
  it('contains the schema version, timestamp, metadata and every entity', () => {
    const state = busyWorkspace();
    const exported = createExport(state, '2026-03-04T23:59:00.000Z');
    expect(exported).toMatchObject({
      format: SNAPSHOT_FORMAT,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exportedAt: '2026-03-04T23:59:00.000Z',
      generator: 'Project HQ',
      summary: {
        departments: 5,
        employees: 5,
        projects: 1,
        tasks: 2,
        meetings: 0,
        activityEvents: state.activity.length,
        notifications: state.notifications.length,
      },
    });
    expect(Object.keys(exported.workspace).sort()).toEqual(
      [
        'accessProfiles',
        'activity',
        'agentConfigs',
        'approvals',
        'departments',
        'executions',
        'employees',
        'meetings',
        'messages',
        'notifications',
        'projects',
        'tasks',
      ].sort(),
    );
  });

  it('is human-readable JSON with no UI or office state', () => {
    const text = serializeExport(createExport(busyWorkspace(), '2026-03-04T10:00:00.000Z'));
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "format": "project-hq-workspace",\n');
    for (const forbidden of [
      'selectedEmployeeId',
      'activeProjectId',
      'rooms',
      'waypoints',
      'phase',
    ]) {
      expect(text).not.toContain(`"${forbidden}"`);
    }
  });

  it('names the file after the export date', () => {
    expect(exportFilename('2026-03-04T23:59:00.000Z')).toBe('project-hq-workspace-2026-03-04.json');
  });
});

describe('restoreWorkspace', () => {
  it('round-trips a workspace exactly', () => {
    const state = busyWorkspace();
    const exported = roundTrip(createExport(state, '2026-03-04T10:00:00.000Z'));
    const restored = unwrap(restoreWorkspace(exported, OFFICE_LAYOUT));
    expect(restored).toEqual({ state, sourceVersion: SNAPSHOT_SCHEMA_VERSION, migrated: false });
  });

  it('round-trips the seed workspace', () => {
    const seed = createSeedWorkspace();
    expect(unwrap(restoreWorkspace(snapshotOf(seed), OFFICE_LAYOUT)).state).toEqual(seed);
  });

  it.each([
    ['a non-object', 42],
    ['an array', []],
    ['null', null],
    ['the wrong format', { format: 'something-else', schemaVersion: 1, workspace: {} }],
    ['no schema version', { format: SNAPSHOT_FORMAT, workspace: {} }],
    ['a text schema version', { format: SNAPSHOT_FORMAT, schemaVersion: '1', workspace: {} }],
    ['no workspace', { format: SNAPSHOT_FORMAT, schemaVersion: 1 }],
  ])('rejects %s as malformed', (_label, raw) => {
    const result = restoreWorkspace(raw, OFFICE_LAYOUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('malformed');
  });

  it('rejects a newer schema version with an explanation', () => {
    const raw = {
      ...snapshotOf(createSeedWorkspace()),
      schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1,
    };
    const result = restoreWorkspace(raw, OFFICE_LAYOUT);
    expect(result).toMatchObject({ ok: false, error: { kind: 'unsupported_version' } });
    if (!result.ok) expect(result.error.message).toMatch(/Update Project HQ/);
  });

  it('reports every structural problem with its path', () => {
    const raw = snapshotOf(busyWorkspace());
    entity(raw, 'tasks', 0).status = 'finished';
    delete entity(raw, 'tasks', 1).title;
    entity(raw, 'projects', 0).deadline = '2026-02-30';

    const result = restoreWorkspace(raw, OFFICE_LAYOUT);
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid_structure' } });
    if (result.ok) return;
    expect(result.error.message).toMatch(/3 problems/);
    expect(result.error.details).toEqual(
      expect.arrayContaining([
        expect.stringContaining('workspace.tasks[0].status must be one of'),
        'workspace.tasks[1].title is missing.',
        expect.stringContaining('workspace.projects[0].deadline'),
      ]),
    );
  });

  it('rejects a missing entity list', () => {
    const raw = snapshotOf(createSeedWorkspace());
    delete raw.workspace.notifications;
    expect(restoreWorkspace(raw, OFFICE_LAYOUT)).toMatchObject({
      ok: false,
      error: { kind: 'invalid_structure', details: ['workspace.notifications is missing.'] },
    });
  });

  it('caps the number of reported details', () => {
    const raw = snapshotOf(createSeedWorkspace());
    raw.workspace.tasks = Array.from({ length: 40 }, () => ({}));
    const result = restoreWorkspace(raw, OFFICE_LAYOUT);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.details).toHaveLength(26);
    expect(result.error.details.at(-1)).toMatch(/^…and \d+ more\.$/);
  });

  it('rejects broken relationships between valid entities', () => {
    const raw = snapshotOf(busyWorkspace());
    entity(raw, 'tasks', 0).projectId = 'prj_missing';
    expect(restoreWorkspace(raw, OFFICE_LAYOUT)).toMatchObject({
      ok: false,
      error: { kind: 'invalid_relationships' },
    });
  });

  it('rejects duplicate IDs, dependency cycles and a stale currentTaskId', () => {
    const duplicate = snapshotOf(busyWorkspace());
    present(duplicate.workspace.tasks).push({ ...entity(duplicate, 'tasks', 0) });

    const cycle = snapshotOf(busyWorkspace());
    entity(cycle, 'tasks', 0).dependencies = [entity(cycle, 'tasks', 1).id];

    const stale = snapshotOf(busyWorkspace());
    const daniel = present(stale.workspace.employees?.find((e) => e.id === EMP.daniel));
    daniel.currentTaskId = entity(stale, 'tasks', 0).id;

    for (const raw of [duplicate, cycle, stale]) {
      expect(restoreWorkspace(raw, OFFICE_LAYOUT)).toMatchObject({
        ok: false,
        error: { kind: 'invalid_relationships' },
      });
    }
  });

  it('drops properties it does not know', () => {
    const raw = snapshotOf(createSeedWorkspace());
    entity(raw, 'employees', 0).secret = 'ride-along';
    raw.workspace.extra = [];
    const { state } = unwrap(restoreWorkspace(raw, OFFICE_LAYOUT));
    expect(state).toEqual(createSeedWorkspace());
    expect(JSON.stringify(state)).not.toContain('ride-along');
  });

  it('runs migrations before validating', () => {
    const config: MigrationConfig = {
      currentVersion: 2,
      migrations: {
        // Pretend v1 called the activity list "events".
        1: (workspace) => {
          const { events, ...rest } = workspace as Record<string, unknown>;
          return { ...rest, activity: events };
        },
      },
    };
    const raw = snapshotOf(busyWorkspace());
    const { activity, ...rest } = raw.workspace;
    const v1 = { ...raw, schemaVersion: 1, workspace: { ...rest, events: activity } };

    const restored = unwrap(restoreWorkspace(v1, OFFICE_LAYOUT, config));
    expect(restored.migrated).toBe(true);
    expect(restored.sourceVersion).toBe(1);
    expect(restored.state.activity).toHaveLength(present(activity).length);
  });
});

describe('parseSnapshotJson', () => {
  it('rejects text that is not JSON', () => {
    const result = parseSnapshotJson('{ not json');
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid_json' } });
  });
});

describe('migrateWorkspace', () => {
  const config: MigrationConfig = {
    currentVersion: 3,
    migrations: {
      1: (data) => ({ ...(data as object), steps: ['1→2'] }),
      2: (data) => {
        const value = data as { steps: string[] };
        return { ...value, steps: [...value.steps, '2→3'] };
      },
    },
  };

  it('applies each step in order from the stored version', () => {
    expect(unwrap(migrateWorkspace({}, 1, config))).toEqual({
      workspace: { steps: ['1→2', '2→3'] },
      appliedFrom: [1, 2],
    });
    expect(unwrap(migrateWorkspace({ steps: ['1→2'] }, 2, config)).appliedFrom).toEqual([2]);
  });

  it('applies nothing to current data', () => {
    const data = { untouched: true };
    expect(unwrap(migrateWorkspace(data, 3, config))).toEqual({ workspace: data, appliedFrom: [] });
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects the invalid version %s', (version) => {
    expect(migrateWorkspace({}, version, config)).toMatchObject({
      ok: false,
      error: { kind: 'unsupported_version' },
    });
  });

  it('rejects a version newer than the app', () => {
    const result = migrateWorkspace({}, 4, config);
    expect(result).toMatchObject({ ok: false, error: { kind: 'unsupported_version' } });
    if (!result.ok) expect(result.error.message).toMatch(/version 4.*up to 3/);
  });

  it('fails when a step is missing', () => {
    expect(
      migrateWorkspace({}, 1, { currentVersion: 3, migrations: { 1: (d) => d } }),
    ).toMatchObject({ ok: false, error: { kind: 'migration_failed' } });
    const result = migrateWorkspace({}, 1, { currentVersion: 3, migrations: { 1: (d) => d } });
    if (!result.ok) expect(result.error.message).toMatch(/from schema version 2 to 3/);
  });

  it('fails when a step throws, without changing the input', () => {
    const input = Object.freeze({ value: 1 });
    const result = migrateWorkspace(input, 1, {
      currentVersion: 2,
      migrations: {
        1: () => {
          throw new Error('bad data');
        },
      },
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'migration_failed' } });
    if (!result.ok) expect(result.error.message).toMatch(/bad data/);
    expect(input).toEqual({ value: 1 });
  });
});
