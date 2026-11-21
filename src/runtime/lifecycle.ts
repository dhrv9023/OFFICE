/**
 * The life of one agent run. Terminal states never change again.
 *
 *   idle → preparing → running ⇄ (proposals) → completed
 *                         │  └→ waiting_for_approval → completed | cancelled | failed
 *                         └→ failed | cancelled | timed_out
 */
export const RUN_STATES = [
  'idle',
  'preparing',
  'running',
  'waiting_for_approval',
  'completed',
  'failed',
  'cancelled',
  'timed_out',
] as const;
export type RunState = (typeof RUN_STATES)[number];

export const RUN_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
  idle: ['preparing'],
  preparing: ['running', 'failed', 'cancelled', 'timed_out'],
  running: ['waiting_for_approval', 'completed', 'failed', 'cancelled', 'timed_out'],
  waiting_for_approval: ['completed', 'cancelled', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
  timed_out: [],
};

export const ACTIVE_STATES: ReadonlySet<RunState> = new Set([
  'preparing',
  'running',
  'waiting_for_approval',
]);

export function isTerminal(state: RunState): boolean {
  return RUN_TRANSITIONS[state].length === 0;
}

export function canTransition(from: RunState, to: RunState): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}
