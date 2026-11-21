import { notFound, validationError } from '@/domain/errors';
import type { EmployeeId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import { validateMessageBody } from '@/domain/rules/validation';
import type { ActorId, Message } from '@/domain/types';
import { checkActor, commit, notification } from '../support';
import type { CommandHandler } from '../types';

export interface SendMessageInput {
  /** The founder ('user') or an employee. */
  readonly to: ActorId;
  readonly body: string;
}

/**
 * Sends a message between the founder and one employee. The founder writes to an
 * employee; an employee (an agent, with `message.send`) writes to the founder,
 * who is notified. Authorization runs before this, in the command binding.
 */
export const sendMessage: CommandHandler<SendMessageInput, Message> = (state, input, context) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;
  const from = actor.value;
  if (from === 'system') {
    return err(validationError('from', 'System processes do not send messages.'));
  }
  const to = input.to;
  if (from === 'user') {
    if (typeof to !== 'string' || to === 'user' || !state.employees[to as EmployeeId]) {
      return err(notFound('employee', to));
    }
  } else if (to !== 'user') {
    return err(validationError('to', 'Employees can write to the founder only.'));
  }
  const body = validateMessageBody(input.body);
  if (!body.ok) return body;

  const now = context.clock.now();
  const message: Message = {
    id: context.ids.next('message'),
    from,
    to,
    body: body.value,
    createdAt: now,
  };
  const sender = from === 'user' ? null : state.employees[from];
  return ok({
    value: message,
    state: commit(
      state,
      { messages: [...state.messages, message].slice(-2000) },
      [],
      sender
        ? [
            notification(context, now, {
              type: 'info',
              title: `Message from ${sender.name}`,
              message: body.value.length > 140 ? `${body.value.slice(0, 137)}…` : body.value,
              relatedEntityId: sender.id,
            }),
          ]
        : [],
    ),
  });
};
