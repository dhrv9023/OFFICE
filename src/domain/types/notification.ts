import type { EntityId, NotificationId } from '../ids';

export const NOTIFICATION_TYPES = ['info', 'success', 'warning', 'error'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification {
  readonly id: NotificationId;
  readonly title: string;
  readonly message: string;
  readonly type: NotificationType;
  /** What the notification is about; null when that entity has been deleted or there is none. */
  readonly relatedEntityId: EntityId | null;
  readonly isRead: boolean;
  readonly createdAt: string;
}
