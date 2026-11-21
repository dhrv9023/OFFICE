import type { Clock } from '@/domain/clock';
import type { DomainResult } from '@/domain/errors';
import type { IdGenerator } from '@/domain/ids';
import type { Actor, WorkspaceState } from '@/domain/types';

/** Everything a command needs besides its input and the current state. */
export interface CommandContext {
  readonly actor: Actor;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface CommandOutcome<T> {
  /** The complete next state. Committed in one step, or not at all. */
  readonly state: WorkspaceState;
  /** What the command returns to its caller. */
  readonly value: T;
}

/**
 * A command is a pure function: (current state, input, context) → next state or a
 * DomainError. It never mutates its arguments and has no side effects, which makes
 * every command atomic and directly testable.
 */
export type CommandHandler<Input, Output> = (
  state: WorkspaceState,
  input: Input,
  context: CommandContext,
) => DomainResult<CommandOutcome<Output>>;
