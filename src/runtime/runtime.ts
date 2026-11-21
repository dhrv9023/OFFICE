import type { AgentGateway, Reader } from '@/commands';
import type { EmployeeId, ExecutionId } from '@/domain/ids';
import type { AgentConfig, ExecutionStatus } from '@/domain/types';
import type { CredentialSource } from '@/services/credentials';
import { ACTIVE_STATES, canTransition, isTerminal, type RunState } from './lifecycle';
import { validateProposal, type ActionProposal } from './proposal';
import {
  ProviderError,
  type ModelMessage,
  type ModelProvider,
  type ModelResponse,
  type ProviderRegistry,
  type ToolDefinition,
} from './provider';

/*
 * The agent runtime (Phase 2.0): runs one AI employee at a time per employee,
 * through capabilities it is given — never the store, IndexedDB, Phaser, the raw
 * commands or the founder's identity.
 *
 *   start → preparing (identity via the reader, configuration, provider)
 *         → running: model call → proposals → gateway.request (Phase 1.8 pipeline)
 *         → completed | waiting_for_approval | failed | cancelled | timed_out
 *
 * Every mutation is a gateway request, so authorization, approval, idempotency
 * and the execution record all come from Phase 1.8. The runtime only reports
 * what the pipeline confirmed. Run records live in memory (each action is
 * persisted by the pipeline as an Execution).
 */

export interface RuntimeDependencies {
  /** Identity-bound mutation handle for one employee (Phase 1.8). */
  readonly gatewayFor: (employeeId: EmployeeId) => AgentGateway;
  /** Identity-bound scoped reads for one employee (Phase 2.0). */
  readonly readerFor: (employeeId: EmployeeId) => Reader;
  /** The employee's configuration (read-only), or undefined. */
  readonly configFor: (employeeId: EmployeeId) => AgentConfig | undefined;
  readonly providers: ProviderRegistry;
  readonly credentials: CredentialSource;
  readonly clock: { now(): string };
  /** Run IDs. Must be unique per runtime. */
  readonly newRunId: () => string;
  /** False while changes cannot be saved (storage unavailable or failing). */
  readonly canPersist: () => boolean;
  /** Hard cap on any run, whatever the configuration says (ms). */
  readonly maxRunDurationMs?: number;
  readonly timers?: {
    setTimeout(callback: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
  };
}

export type RunErrorCode =
  | 'run_conflict'
  | 'not_permitted'
  | 'not_configured'
  | 'provider_unavailable'
  | 'missing_credential'
  | 'persistence_unavailable'
  | 'provider_error'
  | 'invalid_proposal'
  | 'budget_exceeded'
  | 'timeout'
  | 'cancelled'
  | 'invalid_transition'
  | 'not_found';

export interface RunError {
  readonly code: RunErrorCode;
  readonly message: string;
}

/** One action the run handed to the gateway, and what the pipeline said. */
export interface RunAction {
  readonly requestId: string;
  readonly actionType: string;
  readonly explanation: string;
  /** The Phase 1.8 execution outcome, exactly as the pipeline reported it. */
  readonly status: ExecutionStatus | 'refused';
  readonly executionId: ExecutionId | null;
  readonly error: { readonly code: string; readonly message: string } | null;
}

export interface Run {
  readonly id: string;
  readonly employeeId: EmployeeId;
  readonly instruction: string;
  readonly state: RunState;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly iterations: number;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costUsd: number;
  };
  readonly actions: readonly RunAction[];
  /** Model text from each round, kept for inspection; never shown as a reply. */
  readonly notes: readonly string[];
  readonly error: RunError | null;
  /** Why a completed run stopped: the model ended, or the iteration limit was reached. */
  readonly stopReason: 'model_finished' | 'iteration_limit' | 'approval_resolved' | null;
}

export type RunResult = { ok: true; run: Run } | { ok: false; error: RunError };

const RUNTIME_RULES = [
  'You act as an employee of this company through proposals only.',
  'Each proposal is checked by the company: it may be refused, need the founder’s approval, or fail validation.',
  'Never claim an action happened unless its outcome says it succeeded.',
].join(' ');

/** Phase 2.0 has no read tools for the model yet; context is gathered up front. */
function toolsFor(permissions: readonly string[]): ToolDefinition[] {
  const mapping: Record<string, ToolDefinition> = {
    'task.change_status': {
      action: 'changeTaskStatus',
      description: 'Move a task to another status.',
    },
    'task.edit': { action: 'updateTask', description: 'Edit a task’s details.' },
    'task.create': { action: 'createTask', description: 'Create a task.' },
    'task.assign': { action: 'assignTask', description: 'Assign a task.' },
    'task.delete': {
      action: 'deleteTask',
      description: 'Delete a task (needs the founder’s approval).',
    },
    'message.send': { action: 'sendMessage', description: 'Write to the founder.' },
    'meeting.create': { action: 'scheduleMeeting', description: 'Schedule a meeting.' },
  };
  const tools = new Map<string, ToolDefinition>();
  for (const entry of permissions) {
    const tool = mapping[entry.split(':')[0] ?? ''];
    if (tool) tools.set(tool.action, tool);
  }
  return [...tools.values()];
}

export function createAgentRuntime(deps: RuntimeDependencies) {
  const timers = deps.timers ?? {
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
    clearTimeout: (handle: unknown) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
  };
  const runs = new Map<string, Run>();
  /** Live runs by employee: at most one each. */
  const active = new Map<EmployeeId, { runId: string; controller: AbortController }>();
  const listeners = new Set<(run: Run) => void>();

  const runOf = (runId: string): Run => {
    const run = runs.get(runId);
    if (!run) throw new Error(`Unknown run ${runId}`);
    return run;
  };

  const update = (runId: string, patch: Partial<Run>): Run => {
    const current = runs.get(runId);
    if (!current) throw new Error(`Unknown run ${runId}`);
    const next = { ...current, ...patch };
    runs.set(runId, next);
    for (const listener of listeners) listener(next);
    return next;
  };

  /** Validated state change. Throws on an invalid transition (a programming error). */
  const move = (runId: string, to: RunState, patch: Partial<Run> = {}): Run => {
    const current = runs.get(runId);
    if (!current) throw new Error(`Unknown run ${runId}`);
    if (!canTransition(current.state, to)) {
      throw new Error(`Invalid run transition ${current.state} → ${to}`);
    }
    return update(runId, {
      ...patch,
      state: to,
      ...(isTerminal(to) ? { endedAt: deps.clock.now() } : {}),
    });
  };

  const finish = (runId: string, to: RunState, patch: Partial<Run> = {}): Run => {
    const run = runOf(runId);
    if (!isTerminal(run.state) && canTransition(run.state, to)) move(runId, to, patch);
    if (to !== 'waiting_for_approval' && active.get(run.employeeId)?.runId === runId) {
      active.delete(run.employeeId);
    }
    return runOf(runId);
  };

  /** Hands one proposal to the gateway and records exactly what the pipeline said. */
  const submit = (gateway: AgentGateway, runId: string, proposal: ActionProposal): RunAction => {
    // Namespaced per run: a retried run reuses its keys, so nothing runs twice.
    const requestId = `${runId}:${proposal.requestId}`.slice(0, 100);
    const outcome = gateway.request(
      { type: proposal.action.type, input: proposal.action.input },
      { requestId, reason: proposal.explanation },
    );
    if (!outcome.ok) {
      return {
        requestId,
        actionType: proposal.action.type,
        explanation: proposal.explanation,
        status: 'refused',
        executionId: null,
        error: { code: outcome.error.code, message: outcome.error.message },
      };
    }
    const { execution } = outcome.value;
    return {
      requestId,
      actionType: proposal.action.type,
      explanation: proposal.explanation,
      status: execution.status,
      executionId: execution.id,
      error: execution.error,
    };
  };

  /** Races a provider call against cancellation and timeout. */
  const call = (provider: ModelProvider, signal: AbortSignal, run: () => Promise<ModelResponse>) =>
    new Promise<ModelResponse>((resolve, reject) => {
      if (signal.aborted) {
        reject(new ProviderError('cancelled', 'The run was stopped.'));
        return;
      }
      const onAbort = () => {
        reject(new ProviderError('cancelled', 'The run was stopped.'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      run().then(
        (response) => {
          signal.removeEventListener('abort', onAbort);
          resolve(response);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(
            error instanceof ProviderError
              ? error
              : new ProviderError('unknown', `${provider.label} failed: ${String(error)}`),
          );
        },
      );
    });

  async function execute(runId: string, controller: AbortController): Promise<Run> {
    const run = runOf(runId);
    const { employeeId } = run;
    const signal = controller.signal;
    // Read through a function: an abort arrives asynchronously, across awaits.
    const aborted = () => signal.aborted;
    const fail = (code: RunErrorCode, message: string) =>
      finish(runId, 'failed', { error: { code, message } });

    // ── preparing ────────────────────────────────────────────────────────
    const reader = deps.readerFor(employeeId);
    const profile = reader.profile();
    if (!profile.ok) return fail('not_permitted', profile.error.message);
    const config = deps.configFor(employeeId);
    if (!config?.provider || config.model === '') {
      return fail('not_configured', `${profile.value.name} has no AI provider configured.`);
    }
    const provider = deps.providers.get(config.provider);
    if (!provider)
      return fail('provider_unavailable', `The provider "${config.provider}" is not available.`);
    const credential = deps.credentials.get(provider.id);
    if (provider.requiresCredential && credential === null) {
      return fail(
        'missing_credential',
        `No credential is held for ${provider.label} in this session.`,
      );
    }
    if (!deps.canPersist()) {
      return fail(
        'persistence_unavailable',
        'Changes cannot be saved right now, so no work is started.',
      );
    }

    const timeout = Math.min(config.timeoutMs, deps.maxRunDurationMs ?? config.timeoutMs);
    const timer = timers.setTimeout(() => {
      controller.abort('timeout');
    }, timeout);

    try {
      if (aborted()) {
        return signal.reason === 'timeout'
          ? finish(runId, 'timed_out', {
              error: { code: 'timeout', message: 'The run took too long.' },
            })
          : finish(runId, 'cancelled', { error: { code: 'cancelled', message: 'Cancelled.' } });
      }
      move(runId, 'running');
      const gateway = deps.gatewayFor(employeeId);
      const tasks = reader.myTasks();
      const messages = reader.messages();
      const context = JSON.stringify({
        me: profile.value,
        myTasks: tasks.ok ? tasks.value : [],
        messagesWithFounder: messages.ok ? messages.value : [],
      });
      const conversation: ModelMessage[] = [
        { role: 'user', content: `Context (read with your permissions): ${context}` },
        { role: 'user', content: run.instruction },
      ];
      const tools = toolsFor(profile.value.access.permissions);

      for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
        let response: ModelResponse;
        try {
          response = await call(provider, signal, () =>
            provider.complete(
              {
                config: { model: config.model, maxOutputTokens: Math.min(8_000, config.maxTokens) },
                system: [RUNTIME_RULES, config.systemInstructions].filter(Boolean).join('\n\n'),
                messages: conversation,
                tools,
              },
              { signal, credential },
            ),
          );
        } catch (error) {
          if (aborted()) {
            return signal.reason === 'timeout'
              ? finish(runId, 'timed_out', {
                  error: {
                    code: 'timeout',
                    message: `The run took longer than ${String(Math.round(timeout / 1000))} s. Actions already submitted keep the outcome shown for them.`,
                  },
                })
              : finish(runId, 'cancelled', {
                  error: {
                    code: 'cancelled',
                    message: 'Cancelled. Actions already submitted keep their outcome.',
                  },
                });
          }
          const providerError =
            error instanceof ProviderError ? error : new ProviderError('unknown', String(error));
          return fail('provider_error', `${provider.label}: ${providerError.message}`);
        }

        const current = runOf(runId);
        const usage = {
          inputTokens: current.usage.inputTokens + response.usage.inputTokens,
          outputTokens: current.usage.outputTokens + response.usage.outputTokens,
          costUsd: current.usage.costUsd + (response.usage.costUsd ?? 0),
        };
        update(runId, {
          iterations: iteration,
          usage,
          notes: response.text ? [...current.notes, response.text] : current.notes,
        });
        if (usage.inputTokens + usage.outputTokens > config.maxTokens) {
          return fail(
            'budget_exceeded',
            `The run used more than ${String(config.maxTokens)} tokens.`,
          );
        }
        if (config.maxCostUsd !== null && usage.costUsd > config.maxCostUsd) {
          return fail('budget_exceeded', `The run cost more than $${String(config.maxCostUsd)}.`);
        }

        if (response.proposals.length === 0) {
          return finish(runId, 'completed', { stopReason: 'model_finished' });
        }

        const outcomes: string[] = [];
        for (const raw of response.proposals) {
          if (aborted()) break;
          if (!deps.canPersist()) {
            return fail(
              'persistence_unavailable',
              'Saving stopped working; no further actions are submitted.',
            );
          }
          const checked = validateProposal(raw);
          if (!checked.ok) {
            outcomes.push(`Proposal rejected before submission: ${checked.reason}`);
            const prior = runOf(runId);
            update(runId, {
              actions: [
                ...prior.actions,
                {
                  requestId: '',
                  actionType: 'invalid',
                  explanation: '',
                  status: 'refused',
                  executionId: null,
                  error: { code: 'invalid_proposal', message: checked.reason },
                },
              ],
            });
            continue;
          }
          const action = submit(gateway, runId, checked.proposal);
          const prior = runOf(runId);
          update(runId, { actions: [...prior.actions, action] });
          outcomes.push(
            `${checked.proposal.requestId}: ${action.status}${action.error ? ` (${action.error.message})` : ''}`,
          );
          if (action.status === 'awaiting_approval') {
            // Nothing else is attempted until the founder decides.
            return finish(runId, 'waiting_for_approval');
          }
        }
        if (aborted()) {
          return signal.reason === 'timeout'
            ? finish(runId, 'timed_out', {
                error: { code: 'timeout', message: 'The run took too long.' },
              })
            : finish(runId, 'cancelled', { error: { code: 'cancelled', message: 'Cancelled.' } });
        }
        conversation.push({ role: 'assistant', content: response.text });
        conversation.push({ role: 'tool', content: `Outcomes: ${outcomes.join('; ')}` });
      }
      return finish(runId, 'completed', { stopReason: 'iteration_limit' });
    } finally {
      timers.clearTimeout(timer);
    }
  }

  return {
    /**
     * Starts a run for an employee. Refused if one is already active for them.
     * Resolves when the run reaches a terminal state or waits for approval.
     */
    async start(employeeId: EmployeeId, instruction: string): Promise<RunResult> {
      const existing = active.get(employeeId);
      if (existing) {
        return {
          ok: false,
          error: {
            code: 'run_conflict',
            message: `This employee already has an active run (${existing.runId}).`,
          },
        };
      }
      const text = instruction.trim();
      if (text === '' || text.length > 4000) {
        return {
          ok: false,
          error: {
            code: 'invalid_proposal',
            message: 'An instruction of 1–4000 characters is required.',
          },
        };
      }
      const id = deps.newRunId();
      const controller = new AbortController();
      runs.set(id, {
        id,
        employeeId,
        instruction: text,
        state: 'idle',
        startedAt: deps.clock.now(),
        endedAt: null,
        iterations: 0,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        actions: [],
        notes: [],
        error: null,
        stopReason: null,
      });
      active.set(employeeId, { runId: id, controller });
      move(id, 'preparing');
      try {
        return { ok: true, run: await execute(id, controller) };
      } catch (error) {
        // A bug or an unexpected exception: never leave the employee locked.
        return {
          ok: true,
          run: finish(id, 'failed', { error: { code: 'provider_error', message: String(error) } }),
        };
      } finally {
        const run = runs.get(id);
        if (run && run.state !== 'waiting_for_approval' && active.get(employeeId)?.runId === id) {
          active.delete(employeeId);
        }
      }
    },

    /**
     * Stops a run. A running provider call is aborted; a run waiting for approval
     * withdraws its pending requests, so they can never be executed.
     */
    cancel(runId: string): RunResult {
      const run = runs.get(runId);
      if (!run) return { ok: false, error: { code: 'not_found', message: 'No such run.' } };
      if (!ACTIVE_STATES.has(run.state)) {
        return {
          ok: false,
          error: { code: 'invalid_transition', message: `The run is already ${run.state}.` },
        };
      }
      if (run.state === 'waiting_for_approval') {
        const gateway = deps.gatewayFor(run.employeeId);
        const actions = run.actions.map((action) => {
          if (action.status !== 'awaiting_approval' || !action.executionId) return action;
          const approvalId = gateway.approvalFor(action.executionId);
          const withdrawn = approvalId ? gateway.cancel(approvalId) : null;
          return withdrawn?.ok ? { ...action, status: 'cancelled' as const } : action;
        });
        const done = finish(runId, 'cancelled', {
          actions,
          error: {
            code: 'cancelled',
            message: 'Cancelled while waiting for approval; pending requests were withdrawn.',
          },
        });
        active.delete(run.employeeId);
        return { ok: true, run: done };
      }
      active.get(run.employeeId)?.controller.abort('cancelled');
      return { ok: true, run: runOf(runId) };
    },

    /**
     * Re-reads the outcome of actions waiting for approval, using the Phase 1.8
     * idempotency key (a repeat returns the recorded result, it never re-runs).
     * Completes the run once nothing is pending any more.
     */
    refresh(runId: string): RunResult {
      const run = runs.get(runId);
      if (!run) return { ok: false, error: { code: 'not_found', message: 'No such run.' } };
      if (run.state !== 'waiting_for_approval') return { ok: true, run };
      const gateway = deps.gatewayFor(run.employeeId);
      const actions = run.actions.map((action) => {
        if (action.status !== 'awaiting_approval' || !action.executionId) return action;
        const status = gateway.statusOf(action.executionId);
        return status ? { ...action, status: status.status, error: status.error } : action;
      });
      update(runId, { actions });
      if (actions.some((action) => action.status === 'awaiting_approval'))
        return { ok: true, run: runOf(runId) };
      const done = finish(runId, 'completed', { stopReason: 'approval_resolved' });
      active.delete(run.employeeId);
      return { ok: true, run: done };
    },

    get: (runId: string): Run | undefined => runs.get(runId),
    list: (): readonly Run[] => [...runs.values()],
    activeRunFor: (employeeId: EmployeeId): Run | undefined => {
      const entry = active.get(employeeId);
      return entry ? runs.get(entry.runId) : undefined;
    },
    subscribe(listener: (run: Run) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type AgentRuntime = ReturnType<typeof createAgentRuntime>;
