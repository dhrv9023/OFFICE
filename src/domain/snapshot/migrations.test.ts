import { describe, expect, it } from 'vitest';
import { DEPT, EMP } from '../../test/factories';
import { createHarness, unwrap } from '../../test/harness';
import { OFFICE_LAYOUT } from '../seed';
import { USER_ACTOR } from '../types';
import { createSnapshot, SNAPSHOT_SCHEMA_VERSION } from './format';
import { migrateV1ToV2, migrateV2ToV3, migrateV3ToV4, migrateV4ToV5 } from './migrations';
import { restoreWorkspace } from './restore';

/** A record exactly as a Phase 1.5 build saved it: schema 1, no deadlines, no meetings. */
function version1Record() {
  const h = createHarness();
  const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
  unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId: project.id,
      departmentId: DEPT.design,
      title: 'Design',
      assigneeId: EMP.sarah,
    }),
  );
  const record = JSON.parse(
    JSON.stringify(createSnapshot(h.state(), '2026-03-01T00:00:00.000Z')),
  ) as {
    schemaVersion: number;
    workspace: {
      tasks: Record<string, unknown>[];
      activity: Record<string, unknown>[];
      meetings?: unknown;
    };
  };
  record.schemaVersion = 1;
  for (const task of record.workspace.tasks) {
    delete task.deadline;
    delete task.blockedReason;
  }
  for (const event of record.workspace.activity) delete event.meetingId;
  delete record.workspace.meetings;
  return { record, state: h.state() };
}

describe('schema v1 → v2 (Phase 1.6)', () => {
  it('is followed by v3 (Phase 1.7) and v4 (Phase 1.8)', () => {
    expect(SNAPSHOT_SCHEMA_VERSION).toBe(5);
  });

  it('gives tasks no deadline and the workspace no meetings', () => {
    const { record } = version1Record();
    const upgraded = migrateV1ToV2(record.workspace) as {
      tasks: { deadline: unknown }[];
      meetings: unknown;
    };
    expect(upgraded.tasks.every((task) => task.deadline === null)).toBe(true);
    expect(upgraded.meetings).toEqual([]);
  });

  it('keeps a deadline or meetings list that is already there', () => {
    const upgraded = migrateV1ToV2({
      tasks: [{ id: 'task_1', deadline: '2026-12-01' }],
      meetings: ['kept'],
    }) as { tasks: { deadline: unknown }[]; meetings: unknown };
    expect(upgraded.tasks[0]?.deadline).toBe('2026-12-01');
    expect(upgraded.meetings).toEqual(['kept']);
  });

  it('refuses something that is not a workspace', () => {
    expect(() => migrateV1ToV2(null)).toThrow('not an object');
  });

  it('restores a saved version 1 workspace with nothing lost', () => {
    const { record, state } = version1Record();
    const restored = unwrap(restoreWorkspace(record, OFFICE_LAYOUT));
    expect(restored.state).toEqual(state);
    expect(restored).toMatchObject({ sourceVersion: 1, migrated: true });
  });
});

describe('schema v2 → v3 (Phase 1.7)', () => {
  it('adds no time to existing meetings, no meeting to existing events, no blocked reason', () => {
    const upgraded = migrateV2ToV3({
      tasks: [{ id: 'task_1', status: 'blocked' }],
      meetings: [{ id: 'mtg_1', title: 'Old' }],
      activity: [{ id: 'evt_1' }],
    }) as Record<string, Record<string, unknown>[]>;
    expect(upgraded.tasks?.[0]).toEqual({ id: 'task_1', status: 'blocked', blockedReason: null });
    expect(upgraded.meetings?.[0]).toEqual({
      id: 'mtg_1',
      title: 'Old',
      startsAt: null,
      durationMinutes: null,
      projectId: null,
    });
    expect(upgraded.activity?.[0]).toEqual({ id: 'evt_1', meetingId: null });
  });

  it('keeps values that are already there', () => {
    const upgraded = migrateV2ToV3({
      tasks: [],
      meetings: [{ startsAt: '2026-12-01T10:00', durationMinutes: 30, projectId: 'prj_1' }],
      activity: [],
    }) as Record<string, Record<string, unknown>[]>;
    expect(upgraded.meetings?.[0]).toMatchObject({
      startsAt: '2026-12-01T10:00',
      durationMinutes: 30,
    });
  });

  it('restores a saved v2 workspace with a meeting that has no time', () => {
    const h = createHarness();
    unwrap(
      h.commands.scheduleMeeting(USER_ACTOR, {
        title: 'Kick-off',
        participantIds: [EMP.sarah],
        roomId: 'room_meeting',
        startsAt: '2026-12-01T10:00',
        durationMinutes: 30,
      }),
    );
    const record = JSON.parse(
      JSON.stringify(createSnapshot(h.state(), '2026-03-01T00:00:00.000Z')),
    ) as {
      schemaVersion: number;
      workspace: {
        meetings: Record<string, unknown>[];
        activity: Record<string, unknown>[];
        tasks: Record<string, unknown>[];
      };
    };
    record.schemaVersion = 2;
    for (const meeting of record.workspace.meetings) {
      delete meeting.startsAt;
      delete meeting.durationMinutes;
      delete meeting.projectId;
    }
    for (const event of record.workspace.activity) delete event.meetingId;
    const restored = unwrap(restoreWorkspace(record, OFFICE_LAYOUT));
    expect(restored).toMatchObject({ sourceVersion: 2, migrated: true });
    expect(Object.values(restored.state.meetings)[0]).toMatchObject({
      title: 'Kick-off',
      startsAt: null,
      durationMinutes: null,
    });
  });
});

describe('schema v3 → v4 (Phase 1.8)', () => {
  /** A record exactly as Phase 1.7 saved it: no access profiles, approvals or executions. */
  function version3Record() {
    const h = createHarness();
    unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    const record = JSON.parse(
      JSON.stringify(createSnapshot(h.state(), '2026-03-01T00:00:00.000Z')),
    ) as {
      schemaVersion: number;
      workspace: Record<string, unknown>;
    };
    record.schemaVersion = 3;
    delete record.workspace.accessProfiles;
    delete record.workspace.approvals;
    delete record.workspace.executions;
    return { record, state: h.state() };
  }

  it('gives every employee a disabled profile with role defaults, and empty histories', () => {
    const { record, state } = version3Record();
    const restored = unwrap(restoreWorkspace(record, OFFICE_LAYOUT));
    expect(restored).toMatchObject({ sourceVersion: 3, migrated: true });
    expect(restored.state).toEqual(state);
    const profiles = Object.values(restored.state.accessProfiles);
    expect(profiles).toHaveLength(5);
    expect(profiles.every((profile) => profile.status === 'disabled')).toBe(true);
    expect(restored.state.approvals).toEqual([]);
    expect(restored.state.executions).toEqual([]);
  });

  it('is deterministic', () => {
    const { record } = version3Record();
    expect(migrateV3ToV4(record.workspace)).toEqual(migrateV3ToV4(record.workspace));
  });

  it('refuses a workspace without employees instead of guessing', () => {
    expect(() => migrateV3ToV4({ tasks: [] })).toThrow('no employee list');
  });

  it('leaves the original untouched when a migration step fails', () => {
    const { record } = version3Record();
    const broken = { ...record, workspace: { ...record.workspace, employees: 'nope' } };
    const copy = JSON.parse(JSON.stringify(broken)) as unknown;
    const result = restoreWorkspace(broken, OFFICE_LAYOUT);
    expect(result.ok).toBe(false);
    expect(broken).toEqual(copy);
  });
});

describe('schema v4 → v5 (Phase 2.0)', () => {
  /** A record as Phase 1.8 saved it: no read grants, agent configs or messages. */
  function version4Record() {
    const h = createHarness();
    unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
    unwrap(
      h.commands.updateAccessProfile(USER_ACTOR, {
        employeeId: EMP.sarah,
        status: 'active',
        grants: [{ permission: 'task.change_status', scope: 'own', requiresApproval: true }],
      }),
    );
    const record = JSON.parse(
      JSON.stringify(createSnapshot(h.state(), '2026-03-01T00:00:00.000Z')),
    ) as {
      schemaVersion: number;
      workspace: Record<string, unknown> & {
        accessProfiles: { employeeId: string; grants: { permission: string }[] }[];
      };
    };
    record.schemaVersion = 4;
    delete record.workspace.agentConfigs;
    delete record.workspace.messages;
    for (const profile of record.workspace.accessProfiles) {
      profile.grants = profile.grants.filter(
        (grant) =>
          ![
            'employee.read',
            'task.read',
            'project.read',
            'meeting.read',
            'message.read',
            'message.send',
          ].includes(grant.permission),
      );
    }
    return record;
  }

  it('adds role-default read grants, keeps every existing grant, and adds unconfigured agents', () => {
    const restored = unwrap(restoreWorkspace(version4Record(), OFFICE_LAYOUT));
    expect(restored).toMatchObject({ sourceVersion: 4, migrated: true });
    const sarah = restored.state.accessProfiles[EMP.sarah];
    expect(sarah?.status).toBe('active');
    // The founder's custom grant survives untouched; reads are added.
    expect(sarah?.grants).toContainEqual({
      permission: 'task.change_status',
      scope: 'own',
      requiresApproval: true,
    });
    expect(sarah?.grants.map((grant) => grant.permission)).toContain('task.read');
    expect(
      Object.values(restored.state.agentConfigs).every((config) => config.provider === null),
    ).toBe(true);
    expect(restored.state.messages).toEqual([]);
  });

  it('is deterministic', () => {
    const record = version4Record();
    expect(migrateV4ToV5(record.workspace)).toEqual(migrateV4ToV5(record.workspace));
  });
});
