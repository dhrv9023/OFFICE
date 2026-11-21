import { expect } from 'vitest';
import { createCommands, type Commands } from '@/commands/createCommands';
import type { Clock } from '@/domain/clock';
import type { DomainError, DomainErrorCode, DomainResult } from '@/domain/errors';
import { createSequentialIdGenerator } from '@/domain/ids';
import type { Result } from '@/domain/result';
import { validateWorkspace } from '@/domain/rules/workspaceIntegrity';
import { createSeedWorkspace, OFFICE_LAYOUT } from '@/domain/seed';
import type { WorkspaceState } from '@/domain/types';

/** Recursively freezes a value so any accidental mutation throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Deterministic clock: starts at 2026-02-01T09:00Z and advances one minute per reading. */
export function createTestClock(): Clock {
  let minutes = 0;
  return {
    now() {
      const time = new Date(Date.UTC(2026, 1, 1, 9, minutes)).toISOString();
      minutes += 1;
      return time;
    },
  };
}

export interface Harness {
  readonly commands: Commands;
  /** The AI execution pipeline (Phase 1.8). */
  readonly executor: ReturnType<typeof createCommands>['executor'];
  /** Identity-bound handle for an AI employee's runner. */
  readonly gatewayFor: ReturnType<typeof createCommands>['gatewayFor'];
  /** Scoped reads for an AI employee (Phase 2.0). */
  readonly readerFor: ReturnType<typeof createCommands>['readerFor'];
  /** Current state (deep-frozen, so handlers that mutate would throw). */
  state(): WorkspaceState;
  /** How many times a command committed. */
  commits(): number;
  /** Asserts every workspace invariant holds. */
  expectConsistent(): void;
}

/** Commands bound to an in-memory store with deterministic IDs and time. */
export function createHarness(initial: WorkspaceState = createSeedWorkspace()): Harness {
  let state = deepFreeze(initial);
  let commits = 0;
  const { commands, executor, gatewayFor, readerFor } = createCommands({
    store: {
      getState: () => state,
      setState: (next) => {
        state = deepFreeze(next);
        commits += 1;
      },
    },
    clock: createTestClock(),
    ids: createSequentialIdGenerator(),
  });

  return {
    commands,
    executor,
    gatewayFor,
    readerFor,
    state: () => state,
    commits: () => commits,
    expectConsistent: () => {
      expect(validateWorkspace(state, OFFICE_LAYOUT)).toEqual([]);
    },
  };
}

/** The success value, or a test failure describing the rejection. */
export function unwrap<T>(result: Result<T, { readonly message: string }>): T {
  if (!result.ok) {
    throw new Error(`Expected success but got: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** Narrows away null/undefined, failing the test if the value is missing. */
export function present<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what} to be present.`);
  return value;
}

/** Asserts the result is a rejection with the given code and returns the narrowed error. */
export function expectError<C extends DomainErrorCode>(
  result: DomainResult<unknown>,
  code: C,
): Extract<DomainError, { code: C }> {
  if (result.ok) throw new Error(`Expected a "${code}" error but the operation succeeded.`);
  expect(result.error.code).toBe(code);
  expect(result.error.message.length).toBeGreaterThan(0);
  return result.error as Extract<DomainError, { code: C }>;
}
