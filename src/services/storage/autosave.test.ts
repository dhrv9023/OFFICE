import { describe, expect, it } from 'vitest';
import { createSeedWorkspace } from '@/domain/seed';
import type { WorkspaceSnapshot } from '@/domain/snapshot/format';
import type { WorkspaceState } from '@/domain/types';
import { createTestClock } from '@/test/harness';
import { createControlledStorage } from '@/test/storage';
import { createAutosaver, type SaveStatus } from './autosave';
import { StorageError } from './types';

/** A minimal immutable store, standing in for the Zustand workspace store. */
function createStore(initial: WorkspaceState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next: WorkspaceState) {
      state = next;
      for (const listener of [...listeners]) listener();
    },
    /** Notify without changing anything. */
    poke() {
      for (const listener of [...listeners]) listener();
    },
  };
}

/** A distinct state object, labelled so tests can tell which one reached disk. */
const version = (base: WorkspaceState, label: string): WorkspaceState => ({
  ...base,
  notifications: [
    {
      id: `ntf_${label}`,
      title: label,
      message: label,
      type: 'info',
      relatedEntityId: null,
      isRead: false,
      createdAt: '2026-02-01T09:00:00.000Z',
    },
  ],
});

async function setup() {
  const seed = createSeedWorkspace();
  const controlled = createControlledStorage();
  const baseline = await controlled.storage.save(
    {
      format: 'project-hq-workspace',
      schemaVersion: 5,
      savedAt: 'seed',
      workspace: {
        departments: [],
        employees: [],
        projects: [],
        tasks: [],
        meetings: [],
        activity: [],
        notifications: [],
        accessProfiles: [],
        approvals: [],
        executions: [],
        agentConfigs: [],
        messages: [],
      },
    },
    { expectedRevision: null },
  );
  controlled.saves.length = 0;
  const store = createStore(seed);
  const statuses: SaveStatus[] = [];
  const autosaver = createAutosaver({
    storage: controlled.storage,
    clock: createTestClock(),
    getState: () => store.getState(),
    subscribe: (listener) => store.subscribe(listener),
    onStatus: (status) => statuses.push(status),
  });
  autosaver.start(seed, baseline);

  const savedLabel = async (): Promise<string | undefined> => {
    const record = (await controlled.storage.load()) as {
      workspace: { notifications: { title: string }[] };
    };
    return record.workspace.notifications[0]?.title;
  };
  return { seed, controlled, store, statuses, autosaver, savedLabel };
}

describe('autosaver', () => {
  it('writes nothing until the workspace changes', async () => {
    const { controlled, autosaver, statuses } = await setup();
    await autosaver.flush();
    expect(controlled.saves).toHaveLength(0);
    expect(statuses).toEqual([]);
  });

  it('saves each change, checking the revision it replaces', async () => {
    const { seed, controlled, store, autosaver, statuses, savedLabel } = await setup();

    store.set(version(seed, 'first'));
    await autosaver.flush();
    store.set(version(seed, 'second'));
    await autosaver.flush();

    expect(controlled.saves.map((save) => save.options.expectedRevision)).toEqual([1, 2]);
    expect(await savedLabel()).toBe('second');
    expect(statuses.map((status) => status.state)).toEqual(['saving', 'saved', 'saving', 'saved']);
  });

  it('skips notifications that did not change the state', async () => {
    const { controlled, store, autosaver } = await setup();
    store.poke();
    store.poke();
    await autosaver.flush();
    expect(controlled.saves).toHaveLength(0);
  });

  it('never runs two writes at once, and saves the latest state last', async () => {
    const { seed, controlled, store, autosaver, savedLabel } = await setup();
    const release = controlled.holdSaves();

    store.set(version(seed, 'a'));
    store.set(version(seed, 'b'));
    store.set(version(seed, 'c'));
    expect(controlled.saves).toHaveLength(1);

    release();
    await autosaver.flush();

    expect(controlled.maxConcurrentSaves()).toBe(1);
    // 'a' was in flight; 'b' was superseded before it could be written.
    expect(controlled.saves.map((save) => save.snapshot.workspace.notifications[0]?.title)).toEqual(
      ['a', 'c'],
    );
    expect(await savedLabel()).toBe('c');
  });

  it('reports a failed write, keeps the change pending and saves it on retry', async () => {
    const { seed, controlled, store, autosaver, statuses, savedLabel } = await setup();
    controlled.fail('save', new StorageError('quota_exceeded', 'Disk full.'));

    store.set(version(seed, 'unsaved'));
    await autosaver.flush();
    expect(statuses.at(-1)).toEqual({
      state: 'error',
      kind: 'quota_exceeded',
      message: 'Disk full.',
    });
    expect(await savedLabel()).toBeUndefined();

    controlled.heal();
    await autosaver.retry();
    expect(statuses.at(-1)?.state).toBe('saved');
    expect(await savedLabel()).toBe('unsaved');
  });

  it('tries again on the next change after a failure', async () => {
    const { seed, controlled, store, autosaver, savedLabel } = await setup();
    controlled.fail('save', new Error('flaky'));
    store.set(version(seed, 'one'));
    await autosaver.flush();

    controlled.heal();
    store.set(version(seed, 'two'));
    await autosaver.flush();
    expect(await savedLabel()).toBe('two');
  });

  it('does not overwrite data another tab saved', async () => {
    const { seed, controlled, store, autosaver, statuses, savedLabel } = await setup();
    // Another tab writes revision 2 behind our back.
    await controlled.storage.save(
      { ...((await controlled.storage.load()) as WorkspaceSnapshot), savedAt: 'other-tab' },
      { expectedRevision: 1 },
    );

    store.set(version(seed, 'ours'));
    await autosaver.flush();

    expect(statuses.at(-1)).toMatchObject({ state: 'error', kind: 'conflict' });
    expect(await controlled.storage.load()).toMatchObject({ savedAt: 'other-tab', revision: 2 });
    expect(await savedLabel()).toBeUndefined();
  });

  it('after a conflict, retrying never overwrites; keeping this version backs the other up first', async () => {
    const { seed, controlled, store, autosaver, statuses, savedLabel } = await setup();
    await controlled.storage.save(
      { ...((await controlled.storage.load()) as WorkspaceSnapshot), savedAt: 'other-tab' },
      { expectedRevision: 1 },
    );
    store.set(version(seed, 'ours'));
    await autosaver.flush();

    // Retry is not a way to clobber the other tab.
    await autosaver.retry();
    expect(statuses.at(-1)).toMatchObject({ state: 'error', kind: 'conflict' });
    expect(await controlled.storage.load()).toMatchObject({ savedAt: 'other-tab' });

    // The explicit choice: keep ours, after backing theirs up.
    await autosaver.overwrite();
    expect(statuses.at(-1)).toMatchObject({ state: 'saved' });
    expect(await savedLabel()).toBe('ours');
    const backups = await controlled.storage.listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({
      reason: 'pre-overwrite',
      payload: { savedAt: 'other-tab' },
    });

    // Normal, revision-checked saving resumes afterwards.
    store.set(version(seed, 'next'));
    await autosaver.flush();
    expect(await savedLabel()).toBe('next');
    expect(statuses.at(-1)).toMatchObject({ state: 'saved' });
  });

  it('waits for the write in flight when paused, and catches up on resume', async () => {
    const { seed, controlled, store, autosaver, savedLabel } = await setup();
    const release = controlled.holdSaves();
    store.set(version(seed, 'in-flight'));

    let paused = false;
    const pausing = autosaver.pause().then(() => {
      paused = true;
    });
    await Promise.resolve();
    expect(paused).toBe(false);
    release();
    await pausing;
    expect(await savedLabel()).toBe('in-flight');

    store.set(version(seed, 'while-paused'));
    await autosaver.flush();
    expect(await savedLabel()).toBe('in-flight');

    autosaver.resume();
    await autosaver.flush();
    expect(await savedLabel()).toBe('while-paused');
  });
});
