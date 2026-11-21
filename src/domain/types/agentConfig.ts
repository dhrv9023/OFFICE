import type { EmployeeId } from '../ids';

/**
 * How an AI employee would run (Phase 2.0): which provider and model, its
 * standing instructions, and hard limits. Versioned so the shape can evolve.
 *
 * There is deliberately NO credential field. API keys never enter the workspace,
 * its exports or its backups; a provider looks its key up in a separate
 * credential source at run time (see services/credentials.ts). Whether the
 * employee may act at all is decided by their access profile, not here.
 */
export const AGENT_CONFIG_VERSION = 1;

export interface AgentConfig {
  readonly employeeId: EmployeeId;
  readonly configVersion: number;
  /** Registered provider ID (e.g. a future "anthropic" adapter), or null: not configured. */
  readonly provider: string | null;
  /** Model name as the provider knows it; empty when not configured. */
  readonly model: string;
  /** Standing instructions added to every run (the employee's brief). */
  readonly systemInstructions: string;
  /** Longest a single run may take, in milliseconds. */
  readonly timeoutMs: number;
  /** Most model round trips (each may propose actions) in one run. */
  readonly maxIterations: number;
  /** Most tokens (input + output) one run may use. */
  readonly maxTokens: number;
  /** Optional spending cap for one run, in US dollars; null for none. */
  readonly maxCostUsd: number | null;
  readonly updatedAt: string;
}

export const AGENT_CONFIG_LIMITS = {
  timeoutMs: { min: 5_000, max: 30 * 60_000 },
  maxIterations: { min: 1, max: 50 },
  maxTokens: { min: 1_000, max: 2_000_000 },
  maxCostUsd: { min: 0, max: 1_000 },
  systemInstructions: 8_000,
  model: 200,
  provider: 64,
} as const;
