import { notFound } from '@/domain/errors';
import type { NotificationId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import type { Notification } from '@/domain/types';
import { checkActor } from '../support';
import type { CommandHandler } from '../types';

/*
 * Reading a notification is not company activity, so these two commands do not
 * write to the activity log or raise further notifications. Both are idempotent.
 */

export interface MarkNotificationReadInput {
  readonly notificationId: NotificationId;
}

export const markNotificationRead: CommandHandler<MarkNotificationReadInput, Notification> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const current = state.notifications.find((item) => item.id === input.notificationId);
  if (!current) return err(notFound('notification', input.notificationId));
  if (current.isRead) return ok({ value: current, state });

  const updated: Notification = { ...current, isRead: true };
  return ok({
    value: updated,
    state: {
      ...state,
      notifications: state.notifications.map((item) => (item.id === updated.id ? updated : item)),
    },
  });
};

export interface MarkAllNotificationsReadOutput {
  /** How many notifications were unread before the call. */
  readonly markedCount: number;
}

export const markAllNotificationsRead: CommandHandler<undefined, MarkAllNotificationsReadOutput> = (
  state,
  _input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;

  const markedCount = state.notifications.filter((item) => !item.isRead).length;
  if (markedCount === 0) return ok({ value: { markedCount }, state });

  return ok({
    value: { markedCount },
    state: {
      ...state,
      notifications: state.notifications.map((item) =>
        item.isRead ? item : { ...item, isRead: true },
      ),
    },
  });
};
