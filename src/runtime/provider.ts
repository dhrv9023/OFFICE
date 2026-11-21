import type { ActionType } from '@/domain/types';
import type { ActionProposal } from './proposal';

/*
 * The provider boundary (Phase 2.0). The runtime talks to models only through
 * these types; a provider adapter (Claude, Gemini, OpenAI, a local model) maps
 * them to its own API. No adapter ships in Phase 2.0.
 */

/** One turn of context sent to the model. */
export interface ModelMessage {
  readonly role: 'user' | 'assistant' | 'tool';
  readonly content: string;
}

/** An action the model may propose, described so it can fill in the input. */
export interface ToolDefinition {
  readonly action: ActionType;
  readonly description: string;
}

/** Model settings taken from the employee's AgentConfig for one call. */
export interface ModelConfiguration {
  readonly model: string;
  /** Upper bound on output tokens for this call. */
  readonly maxOutputTokens: number;
}

export interface ModelRequest {
  readonly config: ModelConfiguration;
  /** Standing instructions: the runtime's rules plus the employee's brief. */
  readonly system: string;
  readonly messages: readonly ModelMessage[];
  /** Actions this employee is permitted to propose (the pipeline still decides). */
  readonly tools: readonly ToolDefinition[];
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Cost of this call in US dollars, when the provider reports it. */
  readonly costUsd?: number | undefined;
}

export interface ModelResponse {
  /** Free text from the model (kept on the run record; never shown as a reply). */
  readonly text: string;
  /** Actions the model proposes. Unvalidated: the runtime checks every one. */
  readonly proposals: readonly unknown[];
  readonly usage: TokenUsage;
  /** `end`: done; `proposals`: wants the outcomes back; `max_tokens`: cut off. */
  readonly stopReason: 'end' | 'proposals' | 'max_tokens';
}

/** What a provider receives besides the request. The key never leaves the call. */
export interface ProviderCallContext {
  /** Aborted on cancellation or timeout; adapters must pass it to their transport. */
  readonly signal: AbortSignal;
  /** The provider's credential, if one is held for this session; null otherwise. */
  readonly credential: string | null;
}

export type ProviderErrorKind =
  'authentication' | 'rate_limited' | 'unavailable' | 'invalid_response' | 'cancelled' | 'unknown';

/** A failure reported by a provider adapter. `retryable` is advisory. */
export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** A model provider adapter. */
export interface ModelProvider {
  /** Stable ID used in AgentConfig.provider, e.g. "anthropic". */
  readonly id: string;
  readonly label: string;
  /** Whether a credential is required to call it (local models may not need one). */
  readonly requiresCredential: boolean;
  complete(request: ModelRequest, context: ProviderCallContext): Promise<ModelResponse>;
}

/** Registered providers by ID. Empty in Phase 2.0. */
export interface ProviderRegistry {
  get(id: string): ModelProvider | undefined;
  list(): readonly ModelProvider[];
}

export function createProviderRegistry(providers: readonly ModelProvider[] = []): ProviderRegistry {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  return {
    get: (id) => byId.get(id),
    list: () => [...byId.values()],
  };
}

export type { ActionProposal };
