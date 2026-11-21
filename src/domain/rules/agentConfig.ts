import { validationError, type DomainResult } from '../errors';
import { err, ok } from '../result';
import { AGENT_CONFIG_LIMITS, AGENT_CONFIG_VERSION, type AgentConfig } from '../types/agentConfig';
import type { Employee } from '../types/employee';

/** Not configured: no provider, sensible limits. Nothing can run until a provider is set. */
export function defaultAgentConfig(employee: Pick<Employee, 'id'>, now: string): AgentConfig {
  return {
    employeeId: employee.id,
    configVersion: AGENT_CONFIG_VERSION,
    provider: null,
    model: '',
    systemInstructions: '',
    timeoutMs: 2 * 60_000,
    maxIterations: 8,
    maxTokens: 50_000,
    maxCostUsd: null,
    updatedAt: now,
  };
}

/** The editable part of a configuration. Anything else (e.g. a key) is refused. */
export type AgentConfigPatch = Partial<
  Pick<
    AgentConfig,
    | 'provider'
    | 'model'
    | 'systemInstructions'
    | 'timeoutMs'
    | 'maxIterations'
    | 'maxTokens'
    | 'maxCostUsd'
  >
>;

const EDITABLE = new Set<string>([
  'provider',
  'model',
  'systemInstructions',
  'timeoutMs',
  'maxIterations',
  'maxTokens',
  'maxCostUsd',
]);

/** Field names that look like credentials: refused loudly rather than silently dropped. */
const SECRET_LIKE = /key|secret|token$|password|credential|auth/i;

const PROVIDER_ID = /^[a-z][a-z0-9-]*$/;

function whole(
  field: string,
  value: unknown,
  limits: { min: number; max: number },
): DomainResult<number> {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < limits.min ||
    value > limits.max
  ) {
    return err(
      validationError(
        field,
        `${field} must be a whole number from ${String(limits.min)} to ${String(limits.max)}.`,
      ),
    );
  }
  return ok(value);
}

/**
 * Applies a patch to a configuration, validating every field. Unknown fields are
 * refused, and credential-like ones with a clear message: keys live outside the
 * workspace.
 */
export function applyAgentConfigPatch(
  current: AgentConfig,
  patch: unknown,
): DomainResult<AgentConfig> {
  if (typeof patch !== 'object' || patch === null) {
    return err(validationError('patch', 'The configuration change must be an object.'));
  }
  for (const key of Object.keys(patch)) {
    if (EDITABLE.has(key)) continue;
    if (SECRET_LIKE.test(key)) {
      return err(
        validationError(
          key,
          'Credentials are never stored in the workspace. Provide API keys through the credential store, not the configuration.',
        ),
      );
    }
    return err(validationError(key, `"${key}" is not part of an agent configuration.`));
  }
  const input = patch as Record<string, unknown>;
  const next = { ...current } as { -readonly [K in keyof AgentConfig]: AgentConfig[K] };
  const L = AGENT_CONFIG_LIMITS;

  if ('provider' in input) {
    const provider = input.provider;
    if (
      provider !== null &&
      (typeof provider !== 'string' || provider.length > L.provider || !PROVIDER_ID.test(provider))
    ) {
      return err(
        validationError('provider', 'Provider must be a provider ID like "my-provider", or none.'),
      );
    }
    next.provider = provider;
  }
  if ('model' in input) {
    if (typeof input.model !== 'string' || input.model.trim().length > L.model) {
      return err(
        validationError('model', `Model must be text of at most ${String(L.model)} characters.`),
      );
    }
    next.model = input.model.trim();
  }
  if ('systemInstructions' in input) {
    if (
      typeof input.systemInstructions !== 'string' ||
      input.systemInstructions.length > L.systemInstructions
    ) {
      return err(
        validationError(
          'systemInstructions',
          `Instructions must be at most ${String(L.systemInstructions)} characters.`,
        ),
      );
    }
    next.systemInstructions = input.systemInstructions.trim();
  }
  for (const field of ['timeoutMs', 'maxIterations', 'maxTokens'] as const) {
    if (field in input) {
      const value = whole(field, input[field], L[field]);
      if (!value.ok) return value;
      next[field] = value.value;
    }
  }
  if ('maxCostUsd' in input) {
    const cost = input.maxCostUsd;
    if (
      cost !== null &&
      (typeof cost !== 'number' ||
        !Number.isFinite(cost) ||
        cost < L.maxCostUsd.min ||
        cost > L.maxCostUsd.max)
    ) {
      return err(
        validationError(
          'maxCostUsd',
          `Cost budget must be from 0 to ${String(L.maxCostUsd.max)} dollars, or none.`,
        ),
      );
    }
    next.maxCostUsd = cost;
  }
  if (next.provider !== null && next.model === '') {
    return err(validationError('model', 'Choose a model for the provider.'));
  }
  return ok(next);
}

/** Integrity check for stored configurations (loading and import). */
export function validateAgentConfig(config: AgentConfig): DomainResult<AgentConfig> {
  if (config.configVersion !== AGENT_CONFIG_VERSION) {
    return err(
      validationError(
        'agentConfigs',
        `Unknown agent configuration version ${String(config.configVersion)}.`,
      ),
    );
  }
  const editable: AgentConfigPatch = {
    provider: config.provider,
    model: config.model,
    systemInstructions: config.systemInstructions,
    timeoutMs: config.timeoutMs,
    maxIterations: config.maxIterations,
    maxTokens: config.maxTokens,
    maxCostUsd: config.maxCostUsd,
  };
  return applyAgentConfigPatch(config, editable);
}

/** Whether the configuration names a provider and model, i.e. could run. */
export function isConfigured(config: AgentConfig | undefined): boolean {
  return config !== undefined && config.provider !== null && config.model !== '';
}
