import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectId, TaskId } from '@/domain/ids';
import { defaultGrants } from '@/domain/rules/access';
import { createExport, serializeExport } from '@/domain/snapshot/format';
import { USER_ACTOR } from '@/domain/types';
import type { CredentialSource } from '@/services/credentials';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, unwrap, type Harness } from '@/test/harness';
import { canTransition, RUN_STATES, RUN_TRANSITIONS } from './lifecycle';
import { validateProposal } from './proposal';
import {
  createProviderRegistry,
  ProviderError,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ProviderCallContext,
} from './provider';
import { createAgentRuntime, type RunResult } from './runtime';

/*
 * Runtime tests. The provider below is a TEST DOUBLE: it returns scripted
 * responses so the runtime's own behaviour can be checked. Nothing like it ships
 * in the application (Phase 2.0 registers no provider).
 */

type Step = (
  request: ModelRequest,
  context: ProviderCallContext,
) => Promise<ModelResponse> | ModelResponse;

function scriptedProvider(steps: Step[], options: { requiresCredential?: boolean } = {}) {
  const seen: { request: ModelRequest; credential: string | null }[] = [];
  const provider: ModelProvider = {
    id: 'test-double',
    label: 'Test double',
    requiresCredential: options.requiresCredential ?? false,
    async complete(request, context) {
      seen.push({ request, credential: context.credential });
      const step = steps.shift();
      if (!step)
        return {
          text: '',
          proposals: [],
          usage: { inputTokens: 1, outputTokens: 1 },
          stopReason: 'end',
        };
      return step(request, context);
    },
  };
  return { provider, seen };
}

const respond = (proposals: unknown[], text = ''): ModelResponse => ({
  text,
  proposals,
  usage: { inputTokens: 100, outputTokens: 50 },
  stopReason: proposals.length > 0 ? 'proposals' : 'end',
});

/** Waits until the signal aborts (a call that never finishes on its own). */
const hang = (_request: ModelRequest, context: ProviderCallContext) =>
  new Promise<ModelResponse>((_resolve, reject) => {
    context.signal.addEventListener('abort', () => {
      reject(new ProviderError('cancelled', 'aborted'));
    });
  });

/** Minimal in-test credential source (the app's session vault is tested on its own). */
function testVault() {
  const keys = new Map<string, string>();
  return {
    get: (providerId: string) => keys.get(providerId) ?? null,
    set: (providerId: string, key: string) => {
      keys.set(providerId, key);
    },
  } satisfies CredentialSource & { set(providerId: string, key: string): void };
}

let h: Harness;
let projectId: ProjectId;
let ryansTask: TaskId;
let sarahsTask: TaskId;
let persist = true;

beforeEach(() => {
  persist = true;
  h = createHarness();
  projectId = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' })).id;
  ryansTask = unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.frontend,
      title: 'Build header',
      assigneeId: EMP.ryan,
    }),
  ).id;
  sarahsTask = unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.design,
      title: 'Design header',
      assigneeId: EMP.sarah,
    }),
  ).id;
  unwrap(h.commands.updateAccessProfile(USER_ACTOR, { employeeId: EMP.ryan, status: 'active' }));
  unwrap(
    h.commands.updateAgentConfig(USER_ACTOR, {
      employeeId: EMP.ryan,
      patch: { provider: 'test-double', model: 'scripted', maxIterations: 4 },
    }),
  );
});

function runtimeWith(
  provider: ModelProvider,
  options: {
    maxRunDurationMs?: number;
    vault?: CredentialSource;
  } = {},
) {
  let id = 0;
  return createAgentRuntime({
    gatewayFor: h.gatewayFor,
    readerFor: h.readerFor,
    configFor: (employeeId) => h.state().agentConfigs[employeeId],
    providers: createProviderRegistry([provider]),
    credentials: options.vault ?? testVault(),
    clock: { now: () => new Date().toISOString() },
    newRunId: () => {
      id += 1;
      return `run${String(id)}`;
    },
    canPersist: () => persist,
    ...(options.maxRunDurationMs ? { maxRunDurationMs: options.maxRunDurationMs } : {}),
  });
}

const moveOwnTask = (requestId = 'a1', status = 'in_progress') => ({
  requestId,
  action: { type: 'changeTaskStatus', input: { taskId: ryansTask, status } },
  target: { type: 'task', id: ryansTask },
  explanation: 'Starting the header build.',
});

const runOf = (result: RunResult) => {
  if (!result.ok) throw new Error(result.error.message);
  return result.run;
};

describe('lifecycle', () => {
  it('starts, submits through the gateway, and completes with what the pipeline confirmed', async () => {
    const { provider, seen } = scriptedProvider([() => respond([moveOwnTask()], 'Starting.')]);
    const runtime = runtimeWith(provider);
    const run = runOf(await runtime.start(EMP.ryan, 'Start your header task.'));

    expect(run).toMatchObject({
      state: 'completed',
      stopReason: 'model_finished',
      iterations: 2,
      actions: [{ actionType: 'changeTaskStatus', status: 'succeeded', requestId: 'run1:a1' }],
      notes: ['Starting.'],
    });
    expect(h.state().tasks[ryansTask]?.status).toBe('in_progress');
    expect(h.state().executions.at(-1)).toMatchObject({
      actorId: EMP.ryan,
      requestId: 'run1:a1',
      status: 'succeeded',
    });
    expect(h.state().activity.at(-1)?.actorId).toBe(EMP.ryan);
    // The model saw only what Ryan may read, and only actions he may propose.
    const first = seen[0]?.request;
    expect(first?.messages[0]?.content).toContain('Build header');
    expect(first?.messages[0]?.content).not.toContain('Design header');
    expect(first?.tools.map((tool) => tool.action)).toContain('changeTaskStatus');
    expect(first?.tools.map((tool) => tool.action)).not.toContain('deleteTask');
    expect(runtime.activeRunFor(EMP.ryan)).toBeUndefined();
  });

  it('defines every transition and rejects the invalid ones', () => {
    expect(canTransition('idle', 'preparing')).toBe(true);
    expect(canTransition('idle', 'running')).toBe(false);
    expect(canTransition('completed', 'running')).toBe(false);
    expect(canTransition('waiting_for_approval', 'running')).toBe(false);
    for (const state of RUN_STATES) expect(RUN_TRANSITIONS[state]).toBeDefined();
  });

  it('refuses to cancel a run that has already ended', async () => {
    const { provider } = scriptedProvider([]);
    const runtime = runtimeWith(provider);
    const run = runOf(await runtime.start(EMP.ryan, 'Check in.'));
    expect(runtime.cancel(run.id)).toMatchObject({
      ok: false,
      error: { code: 'invalid_transition' },
    });
  });

  it('allows only one active run per employee', async () => {
    let release: (value: ModelResponse) => void = () => undefined;
    const { provider } = scriptedProvider([
      () => new Promise<ModelResponse>((resolve) => (release = resolve)),
    ]);
    const runtime = runtimeWith(provider);
    const first = runtime.start(EMP.ryan, 'First.');
    await Promise.resolve();
    expect(await runtime.start(EMP.ryan, 'Second.')).toMatchObject({
      ok: false,
      error: { code: 'run_conflict' },
    });
    release(respond([]));
    expect(runOf(await first).state).toBe('completed');
    // Free again afterwards.
    expect(runOf(await runtime.start(EMP.ryan, 'Third.')).state).toBe('completed');
  });

  it('cancels an active run, aborting the provider call, and frees the employee', async () => {
    const { provider } = scriptedProvider([hang]);
    const runtime = runtimeWith(provider);
    const pending = runtime.start(EMP.ryan, 'Work.');
    await Promise.resolve();
    const active = runtime.activeRunFor(EMP.ryan);
    expect(active?.state).toBe('running');
    runtime.cancel(active?.id ?? '');
    const run = runOf(await pending);
    expect(run).toMatchObject({ state: 'cancelled', error: { code: 'cancelled' } });
    expect(runtime.activeRunFor(EMP.ryan)).toBeUndefined();
  });

  it('times out, saying actions already submitted keep their outcome', async () => {
    const { provider } = scriptedProvider([() => respond([moveOwnTask()]), hang]);
    const runtime = runtimeWith(provider, { maxRunDurationMs: 40 });
    const run = runOf(await runtime.start(EMP.ryan, 'Work.'));
    expect(run.state).toBe('timed_out');
    expect(run.error?.message).toContain('Actions already submitted keep the outcome');
    // The action before the timeout did commit, and the run says so.
    expect(run.actions[0]?.status).toBe('succeeded');
    expect(h.state().tasks[ryansTask]?.status).toBe('in_progress');
  });

  it('fails cleanly on a provider error, and on an unexpected exception', async () => {
    const failing = scriptedProvider([
      () => {
        throw new ProviderError('rate_limited', 'Slow down.', true);
      },
    ]);
    const runtime = runtimeWith(failing.provider);
    expect(runOf(await runtime.start(EMP.ryan, 'Work.'))).toMatchObject({
      state: 'failed',
      error: { code: 'provider_error', message: 'Test double: Slow down.' },
    });
    expect(runtime.activeRunFor(EMP.ryan)).toBeUndefined();

    const broken = scriptedProvider([
      () => {
        throw new Error('socket hang up');
      },
    ]);
    const second = runtimeWith(broken.provider);
    expect(runOf(await second.start(EMP.ryan, 'Work.')).state).toBe('failed');
    expect(second.activeRunFor(EMP.ryan)).toBeUndefined();
  });

  it('stops when the token budget is exceeded', async () => {
    unwrap(
      h.commands.updateAgentConfig(USER_ACTOR, {
        employeeId: EMP.ryan,
        patch: { maxTokens: 1_000 },
      }),
    );
    const { provider } = scriptedProvider([
      () => ({
        text: '',
        proposals: [moveOwnTask()],
        usage: { inputTokens: 900, outputTokens: 200 },
        stopReason: 'proposals',
      }),
    ]);
    const run = runOf(await runtimeWith(provider).start(EMP.ryan, 'Work.'));
    expect(run).toMatchObject({ state: 'failed', error: { code: 'budget_exceeded' } });
    // The budget check comes before the proposals are submitted.
    expect(h.state().tasks[ryansTask]?.status).toBe('todo');
  });
});

describe('identity and authorization', () => {
  it('cannot act on another employee’s work: the gateway denies it', async () => {
    const { provider } = scriptedProvider([
      () =>
        respond([
          {
            requestId: 'x1',
            action: {
              type: 'changeTaskStatus',
              input: { taskId: sarahsTask, status: 'in_progress' },
            },
            explanation: 'Helping Sarah.',
          },
        ]),
    ]);
    const run = runOf(await runtimeWith(provider).start(EMP.ryan, 'Help out.'));
    expect(run.actions[0]).toMatchObject({
      status: 'denied',
      error: { code: 'permission_denied' },
    });
    expect(h.state().tasks[sarahsTask]?.status).toBe('todo');
  });

  it('cannot use founder authority: such proposals never reach the pipeline', async () => {
    const { provider } = scriptedProvider([
      () =>
        respond([
          {
            requestId: 'f1',
            action: { type: 'updateAccessProfile', input: { employeeId: EMP.ryan } },
            explanation: 'More power.',
          },
          {
            requestId: 'f2',
            action: { type: 'approveRequest', input: { approvalId: 'apr_1' } },
            explanation: 'Self-approve.',
          },
        ]),
    ]);
    const executions = h.state().executions.length;
    const run = runOf(await runtimeWith(provider).start(EMP.ryan, 'Escalate.'));
    expect(run.actions.map((action) => action.error?.code)).toEqual([
      'invalid_proposal',
      'invalid_proposal',
    ]);
    expect(h.state().executions).toHaveLength(executions);
  });

  it('only runs employees who are enabled, configured and have a provider', async () => {
    const { provider } = scriptedProvider([]);
    const runtime = runtimeWith(provider);
    // Disabled access profile.
    expect(runOf(await runtime.start(EMP.sarah, 'Work.'))).toMatchObject({
      state: 'failed',
      error: { code: 'not_permitted' },
    });
    // Active but no provider configured.
    unwrap(h.commands.updateAccessProfile(USER_ACTOR, { employeeId: EMP.emma, status: 'active' }));
    expect(runOf(await runtime.start(EMP.emma, 'Work.'))).toMatchObject({
      error: { code: 'not_configured' },
    });
    // Configured with a provider nobody registered.
    unwrap(
      h.commands.updateAgentConfig(USER_ACTOR, {
        employeeId: EMP.emma,
        patch: { provider: 'other', model: 'm' },
      }),
    );
    expect(runOf(await runtime.start(EMP.emma, 'Work.'))).toMatchObject({
      error: { code: 'provider_unavailable' },
    });
  });

  it('applies a permission change made during a run to the next proposal', async () => {
    const { provider } = scriptedProvider([
      () => respond([moveOwnTask('p1')]),
      () => {
        unwrap(
          h.commands.updateAccessProfile(USER_ACTOR, { employeeId: EMP.ryan, status: 'suspended' }),
        );
        return respond([moveOwnTask('p2', 'blocked')]);
      },
    ]);
    const run = runOf(await runtimeWith(provider).start(EMP.ryan, 'Work.'));
    expect(run.actions.map((action) => action.status)).toEqual(['succeeded', 'denied']);
    expect(h.state().tasks[ryansTask]?.status).toBe('in_progress');
  });

  it('keeps an approval-required action pending until the founder decides', async () => {
    unwrap(
      h.commands.updateAccessProfile(USER_ACTOR, {
        employeeId: EMP.ryan,
        grants: [
          ...defaultGrants({ departmentId: DEPT.frontend }),
          { permission: 'task.delete', scope: 'own', requiresApproval: false },
        ],
      }),
    );
    const { provider } = scriptedProvider([
      () =>
        respond([
          {
            requestId: 'd1',
            action: { type: 'deleteTask', input: { taskId: ryansTask } },
            explanation: 'Duplicate task.',
          },
          moveOwnTask('after'),
        ]),
    ]);
    const runtime = runtimeWith(provider);
    const run = runOf(await runtime.start(EMP.ryan, 'Tidy up.'));
    expect(run.state).toBe('waiting_for_approval');
    // Nothing after the pending action was attempted, and nothing was applied.
    expect(run.actions).toHaveLength(1);
    expect(h.state().tasks[ryansTask]).toBeDefined();
    expect(await runtime.start(EMP.ryan, 'Again.')).toMatchObject({
      ok: false,
      error: { code: 'run_conflict' },
    });
    expect(runOf(runtime.refresh(run.id)).state).toBe('waiting_for_approval');

    const approval = h.state().approvals.at(-1);
    unwrap(h.commands.approveRequest(USER_ACTOR, { approvalId: approval?.id ?? 'apr_none' }));
    expect(runOf(runtime.refresh(run.id))).toMatchObject({
      state: 'completed',
      stopReason: 'approval_resolved',
      actions: [{ status: 'succeeded' }],
    });
    expect(h.state().tasks[ryansTask]).toBeUndefined();
    expect(runtime.activeRunFor(EMP.ryan)).toBeUndefined();
  });

  it('withdraws pending approvals when cancelled, so they can never execute', async () => {
    unwrap(
      h.commands.updateAccessProfile(USER_ACTOR, {
        employeeId: EMP.ryan,
        grants: [
          ...defaultGrants({ departmentId: DEPT.frontend }),
          { permission: 'task.delete', scope: 'own', requiresApproval: false },
        ],
      }),
    );
    const { provider } = scriptedProvider([
      () =>
        respond([
          {
            requestId: 'd1',
            action: { type: 'deleteTask', input: { taskId: ryansTask } },
            explanation: 'Remove.',
          },
        ]),
    ]);
    const runtime = runtimeWith(provider);
    const run = runOf(await runtime.start(EMP.ryan, 'Tidy up.'));
    expect(runOf(runtime.cancel(run.id))).toMatchObject({
      state: 'cancelled',
      actions: [{ status: 'cancelled' }],
    });
    const approval = h.state().approvals.at(-1);
    expect(approval?.status).toBe('cancelled');
    expect(
      h.commands.approveRequest(USER_ACTOR, { approvalId: approval?.id ?? 'apr_none' }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'approval_closed' },
    });
    expect(h.state().tasks[ryansTask]).toBeDefined();
  });
});

describe('reliability', () => {
  it('never executes the same request ID twice', async () => {
    const create = {
      requestId: 'c1',
      action: {
        type: 'createTask',
        input: { projectId, departmentId: DEPT.frontend, title: 'Footer', assigneeId: EMP.ryan },
      },
      explanation: 'Footer needed.',
    };
    const { provider } = scriptedProvider([() => respond([create, create])]);
    const tasks = Object.keys(h.state().tasks).length;
    const run = runOf(await runtimeWith(provider).start(EMP.ryan, 'Plan.'));
    expect(run.actions.map((action) => action.status)).toEqual(['succeeded', 'succeeded']);
    expect(run.actions[0]?.executionId).toBe(run.actions[1]?.executionId);
    expect(Object.keys(h.state().tasks)).toHaveLength(tasks + 1);
  });

  it('re-running is a new run through the full pipeline: refusals stay refusals', async () => {
    const proposal = {
      requestId: 'x1',
      action: { type: 'changeTaskStatus', input: { taskId: sarahsTask, status: 'in_progress' } },
      explanation: 'Try again.',
    };
    const { provider } = scriptedProvider([
      () => respond([proposal]),
      () => respond([]),
      () => respond([proposal]),
    ]);
    const runtime = runtimeWith(provider);
    expect(runOf(await runtime.start(EMP.ryan, 'Try.')).actions[0]?.status).toBe('denied');
    expect(runOf(await runtime.start(EMP.ryan, 'Try again.')).actions[0]?.status).toBe('denied');
    expect(h.state().tasks[sarahsTask]?.status).toBe('todo');
  });

  it('starts nothing, and stops submitting, when changes cannot be saved', async () => {
    persist = false;
    const { provider } = scriptedProvider([() => respond([moveOwnTask()])]);
    const runtime = runtimeWith(provider);
    expect(runOf(await runtime.start(EMP.ryan, 'Work.'))).toMatchObject({
      error: { code: 'persistence_unavailable' },
    });

    persist = true;
    const second = scriptedProvider([
      () => {
        persist = false;
        return respond([moveOwnTask()]);
      },
    ]);
    const run = runOf(await runtimeWith(second.provider).start(EMP.ryan, 'Work.'));
    expect(run).toMatchObject({
      state: 'failed',
      error: { code: 'persistence_unavailable' },
      actions: [],
    });
    expect(h.state().tasks[ryansTask]?.status).toBe('todo');
  });

  it('records malformed proposals as refused and carries on', async () => {
    const { provider } = scriptedProvider([() => respond([{ nonsense: true }, moveOwnTask()])]);
    const run = runOf(await runtimeWith(provider).start(EMP.ryan, 'Work.'));
    expect(run.actions.map((action) => action.status)).toEqual(['refused', 'succeeded']);
  });
});

describe('configuration and credentials', () => {
  it('requires a credential when the provider does, and keeps it out of runs and the workspace', async () => {
    const { provider, seen } = scriptedProvider([() => respond([])], { requiresCredential: true });
    const vault = testVault();
    expect(runOf(await runtimeWith(provider, { vault }).start(EMP.ryan, 'Work.'))).toMatchObject({
      error: { code: 'missing_credential' },
    });

    vault.set('test-double', 'sk-session-only-123');
    const run = runOf(await runtimeWith(provider, { vault }).start(EMP.ryan, 'Work.'));
    expect(run.state).toBe('completed');
    expect(seen.at(-1)?.credential).toBe('sk-session-only-123');
    expect(JSON.stringify(run)).not.toContain('sk-session-only-123');
    expect(serializeExport(createExport(h.state(), '2026-03-01T00:00:00.000Z'))).not.toContain(
      'sk-session-only-123',
    );
  });

  it('exposes no store or founder capability on the runtime itself', () => {
    const runtime = runtimeWith(scriptedProvider([]).provider);
    expect(Object.keys(runtime).sort()).toEqual([
      'activeRunFor',
      'cancel',
      'get',
      'list',
      'refresh',
      'start',
      'subscribe',
    ]);
  });
});

describe('proposal validation', () => {
  it('accepts a well-formed proposal and rejects malformed ones', () => {
    expect(validateProposal(moveOwnTask()).ok).toBe(true);
    for (const bad of [
      null,
      {},
      { ...moveOwnTask(), requestId: 'has spaces' },
      { ...moveOwnTask(), action: { type: 'dropDatabase', input: {} } },
      { ...moveOwnTask(), action: { type: 'changeTaskStatus', input: 'x' } },
      { ...moveOwnTask(), explanation: '' },
      { ...moveOwnTask(), target: { type: 'task', id: 5 } },
    ]) {
      expect(validateProposal(bad).ok).toBe(false);
    }
  });
});
