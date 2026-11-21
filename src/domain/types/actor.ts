import type { EmployeeId } from '../ids';

/**
 * Who is asking for a change. Every command receives one.
 *  - `user`   the human operator (the only actor the Phase 1 UI uses)
 *  - `agent`  an AI employee acting through the same commands (Phase 2+)
 *  - `system` automated housekeeping
 */
export type Actor =
  | { readonly kind: 'user' }
  | { readonly kind: 'agent'; readonly employeeId: EmployeeId }
  | { readonly kind: 'system' };

/** Flat form stored on activity events. An employee ID means an agent acted. */
export type ActorId = 'user' | 'system' | EmployeeId;

export const USER_ACTOR: Actor = { kind: 'user' };
export const SYSTEM_ACTOR: Actor = { kind: 'system' };

export function actorIdOf(actor: Actor): ActorId {
  return actor.kind === 'agent' ? actor.employeeId : actor.kind;
}
