import { describe, expect, it, vi } from 'vitest';
import { commands, workspaceLifecycle } from '@/commands';
import { createCommands } from '@/commands/createCommands';
import { createSequentialIdGenerator } from '@/domain/ids';
import { validateWorkspace } from '@/domain/rules/workspaceIntegrity';
import { createSeedWorkspace, OFFICE_LAYOUT } from '@/domain/seed';
import { USER_ACTOR } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createTestClock, unwrap } from '@/test/harness';
import { createWorkspaceStore } from './internal/workspaceStore';
import { useUiStore } from './uiStore';
import { getWorkspace, subscribeWorkspace } from './workspace';

function setup() {
  const store = createWorkspaceStore();
  const bound = createCommands({
    store: {
      getState: () => store.getState(),
      setState: (next) => {
        store.setState(next, true);
      },
    },
    clock: createTestClock(),
    ids: createSequentialIdGenerator(),
  }).commands;
  return { store, commands: bound };
}

describe('workspace store (real Zustand store)', () => {
  it('starts from the seed workspace and holds data only', () => {
    const { store } = setup();
    expect(store.getState()).toEqual(createSeedWorkspace());
    const functions = Object.values(store.getState()).filter(
      (value) => typeof value === 'function',
    );
    expect(functions).toEqual([]);
  });

  it('notifies subscribers exactly once per successful command', () => {
    const { store, commands: bound } = setup();
    const listener = vi.fn();
    store.subscribe(listener);

    const project = unwrap(bound.createProject(USER_ACTOR, { name: 'Website' }));
    expect(listener).toHaveBeenCalledTimes(1);

    // Task + assignment + activity + notification still arrive as one update.
    unwrap(
      bound.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design',
        assigneeId: EMP.sarah,
      }),
    );
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('never shows subscribers a half-applied state', () => {
    const { store, commands: bound } = setup();
    const problems: number[] = [];
    store.subscribe((state) => {
      problems.push(validateWorkspace(state, OFFICE_LAYOUT).length);
    });

    const project = unwrap(bound.createProject(USER_ACTOR, { name: 'Website' }));
    const task = unwrap(
      bound.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design',
        assigneeId: EMP.sarah,
      }),
    );
    unwrap(bound.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }));
    unwrap(bound.deleteProject(USER_ACTOR, { projectId: project.id }));

    expect(problems).toEqual([0, 0, 0, 0]);
  });

  it('does not notify subscribers when a command is rejected', () => {
    const { store, commands: bound } = setup();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(bound.createProject(USER_ACTOR, { name: '' }).ok).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('application wiring', () => {
  it('blocks the exported commands until the workspace is loaded', () => {
    expect(commands.createProject(USER_ACTOR, { name: 'Too early' })).toMatchObject({
      ok: false,
      error: { code: 'workspace_unavailable' },
    });
  });

  it('connects the exported commands to the store behind the read API', async () => {
    await workspaceLifecycle.initialize();
    const seen: number[] = [];
    const unsubscribe = subscribeWorkspace((state) => {
      seen.push(Object.keys(state.projects).length);
    });

    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Wired' }));
    unsubscribe();

    expect(project.id).toMatch(/^prj_[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(project.createdAt))).toBe(false);
    expect(getWorkspace().projects[project.id]).toEqual(project);
    expect(seen).toEqual([1]);

    // Clean up the shared singleton for other tests in this file.
    unwrap(commands.deleteProject(USER_ACTOR, { projectId: project.id }));
    expect(getWorkspace().projects).toEqual({});
    await workspaceLifecycle.flush();
  });
});

describe('ui store', () => {
  it('holds selection state separately from business state', () => {
    const before = getWorkspace();
    useUiStore.getState().selectEmployee(EMP.sarah);
    useUiStore.getState().setActiveProject('prj_anything');

    expect(useUiStore.getState()).toMatchObject({
      selectedEmployeeId: EMP.sarah,
      activeProjectId: 'prj_anything',
    });
    expect(getWorkspace()).toBe(before);

    useUiStore.getState().selectEmployee(null);
    useUiStore.getState().setActiveProject(null);
    expect(useUiStore.getState()).toMatchObject({
      selectedEmployeeId: null,
      activeProjectId: null,
    });
  });
});
