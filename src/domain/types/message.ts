import type { MessageId } from '../ids';
import type { ActorId } from './actor';

/**
 * A message between the founder and an AI employee (Phase 2.0). Written only by
 * the `sendMessage` command. Messages are records, not a chat simulation: in
 * Phase 2.0 no AI is connected, so nothing replies on its own.
 *
 * Only founder ↔ employee threads exist for now; employee ↔ employee messaging
 * is a later phase (the model allows it: both ends are actor IDs).
 */
export interface Message {
  readonly id: MessageId;
  /** 'user' (the founder) or an employee ID. */
  readonly from: ActorId;
  readonly to: ActorId;
  readonly body: string;
  readonly createdAt: string;
}
