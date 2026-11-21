import { describe, expect, it } from 'vitest';
import { DEPT, EMP } from '../../test/factories';
import { createHarness, unwrap } from '../../test/harness';
import { OFFICE_LAYOUT } from '../seed';
import { USER_ACTOR, type TaskStatus } from '../types';
import { createSnapshot } from './format';
import { planWorkspaceRepair, restoreWorkspace } from './restore';

/**
 * A workspace as a build before Phase 1.4 could have saved it: project status was
 * then freely settable, so a project could be "completed" with open tasks.
 */
function legacyRecord(options: { projectStatus?: string; taskStatus?: TaskStatus } = {}) {
  const h = createHarness();
  const project = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' }));
  const task = unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId: project.id,
      departmentId: DEPT.design,
      title: 'Design',
      assigneeId: EMP.sarah,
    }),
  );
  if (options.taskStatus === 'in_progress') {
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }));
  }
  const record = JSON.parse(
    JSON.stringify(createSnapshot(h.state(), '2026-03-01T00:00:00.000Z')),
  ) as {
    workspace: { projects: { status: string }[]; tasks: Record<string, unknown>[] };
  };
  const stored = record.workspace.projects[0];
  if (stored) stored.status = options.projectStatus ?? 'completed';
  return { record, state: h.state(), projectId: project.id, taskId: task.id };
}

describe('legacy workspaces at the restore gate', () => {
  it('rejects a completed project with an unfinished task and explains it', () => {
    const { record } = legacyRecord();
    const result = restoreWorkspace(record, OFFICE_LAYOUT);
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid_relationships' } });
    if (!result.ok) {
      expect(result.error.details).toEqual([
        'Project "Website" is marked completed but still has 1 open task.',
      ]);
    }
  });

  it('accepts historical states that are still valid', () => {
    for (const projectStatus of ['archived', 'on_hold', 'planning', 'active']) {
      expect(restoreWorkspace(legacyRecord({ projectStatus }).record, OFFICE_LAYOUT).ok).toBe(true);
    }
  });

  it('rejects a lifecycle state that does not exist as a structural problem', () => {
    const result = restoreWorkspace(
      legacyRecord({ projectStatus: 'paused' }).record,
      OFFICE_LAYOUT,
    );
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid_structure' } });
  });
});

describe('planWorkspaceRepair', () => {
  it('reopens the project and changes nothing else', () => {
    const { record, state, projectId, taskId } = legacyRecord({ taskStatus: 'in_progress' });
    const plan = unwrap(planWorkspaceRepair(record, OFFICE_LAYOUT, '2026-11-20T10:00:00.000Z'));

    expect(plan.changes).toEqual([
      {
        projectId,
        description: 'Reopen "Website" as active (it is marked completed but has 1 open task).',
      },
    ]);
    expect(plan.state.projects[projectId]).toMatchObject({
      status: 'active',
      updatedAt: '2026-11-20T10:00:00.000Z',
    });
    expect(plan.state.tasks[taskId]).toEqual(state.tasks[taskId]);
    expect(plan.state.activity).toEqual(state.activity);
    expect(plan.state.employees).toEqual(state.employees);
  });

  it('does not offer a repair when nothing needs it', () => {
    const { record } = legacyRecord({ projectStatus: 'active' });
    expect(planWorkspaceRepair(record, OFFICE_LAYOUT, 'now').ok).toBe(false);
  });

  it('does not offer a repair when other problems remain', () => {
    const { record } = legacyRecord();
    const task = record.workspace.tasks[0];
    if (task) task.assigneeId = 'emp_missing';
    const result = planWorkspaceRepair(record, OFFICE_LAYOUT, 'now');
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid_relationships' } });
    if (!result.ok) expect(result.error.details.join(' ')).toMatch(/emp_missing/);
  });
});
