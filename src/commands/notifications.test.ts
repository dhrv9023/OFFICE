import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { USER_ACTOR } from '@/domain/types';
import { createHarness, expectError, unwrap, type Harness } from '@/test/harness';

let h: Harness;
beforeEach(() => {
  h = createHarness();
  unwrap(h.commands.createProject(USER_ACTOR, { name: 'One' }));
  unwrap(h.commands.createProject(USER_ACTOR, { name: 'Two' }));
  unwrap(h.commands.createProject(USER_ACTOR, { name: 'Three' }));
});
afterEach(() => {
  h.expectConsistent();
});

describe('markNotificationRead', () => {
  it('marks exactly one notification as read', () => {
    const read = unwrap(
      h.commands.markNotificationRead(USER_ACTOR, { notificationId: 'ntf_0002' }),
    );
    expect(read).toMatchObject({ id: 'ntf_0002', isRead: true });
    expect(h.state().notifications.map((item) => item.isRead)).toEqual([false, true, false]);
  });

  it('is idempotent and does not commit again', () => {
    unwrap(h.commands.markNotificationRead(USER_ACTOR, { notificationId: 'ntf_0001' }));
    const before = h.state();
    const again = unwrap(
      h.commands.markNotificationRead(USER_ACTOR, { notificationId: 'ntf_0001' }),
    );
    expect(again.isRead).toBe(true);
    expect(h.state()).toBe(before);
  });

  it('rejects an unknown notification', () => {
    const error = expectError(
      h.commands.markNotificationRead(USER_ACTOR, { notificationId: 'ntf_missing' }),
      'not_found',
    );
    expect(error.entity).toBe('notification');
  });

  it('does not add activity events or further notifications', () => {
    const { activity, notifications } = h.state();
    unwrap(h.commands.markNotificationRead(USER_ACTOR, { notificationId: 'ntf_0001' }));
    expect(h.state().activity).toBe(activity);
    expect(h.state().notifications).toHaveLength(notifications.length);
  });
});

describe('markAllNotificationsRead', () => {
  it('marks everything read and reports how many changed', () => {
    unwrap(h.commands.markNotificationRead(USER_ACTOR, { notificationId: 'ntf_0001' }));
    expect(unwrap(h.commands.markAllNotificationsRead(USER_ACTOR))).toEqual({ markedCount: 2 });
    expect(h.state().notifications.every((item) => item.isRead)).toBe(true);
  });

  it('is a harmless no-op when nothing is unread', () => {
    unwrap(h.commands.markAllNotificationsRead(USER_ACTOR));
    const before = h.state();
    expect(unwrap(h.commands.markAllNotificationsRead(USER_ACTOR))).toEqual({ markedCount: 0 });
    expect(h.state()).toBe(before);
  });
});
