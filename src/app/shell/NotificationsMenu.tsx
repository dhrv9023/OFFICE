import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { commands } from '@/commands';
import { cn } from '@/components/cn';
import { EmptyState } from '@/components/EmptyState';
import { Popover } from '@/components/Popover';
import { RelativeTime } from '@/components/time';
import { toast } from '@/components/toast/toastStore';
import { USER_ACTOR, type Notification } from '@/domain/types';
import { useTaskLink } from '@/features/tasks/taskLink';
import { targetOf } from './notificationTarget';
import { NOTIFICATION_ICONS } from '@/features/common/presentation';
import { selectUnreadNotificationCount } from '@/stores/selectors';
import { useWorkspace } from '@/stores/workspace';
import { ROUTES } from '../navigation';

const VISIBLE = 8;

/** Bell with unread count; opens the most recent notifications. */
export function NotificationsMenu() {
  const notifications = useWorkspace((state) => state.notifications);
  const unread = useWorkspace(selectUnreadNotificationCount);
  const recent = notifications.slice(-VISIBLE).reverse();

  const navigate = useNavigate();
  const { open: openTask } = useTaskLink();
  /** Marks it read and goes to what it is about (if that still exists). */
  const open = (id: Notification['id'], isRead: boolean, target: ReturnType<typeof targetOf>) => {
    if (!isRead) {
      const result = commands.markNotificationRead(USER_ACTOR, { notificationId: id });
      if (!result.ok) toast.error('Could not mark the notification as read', result.error.message);
    }
    if (!target) return;
    if (target.taskId) openTask(target.taskId);
    else void navigate(target.path);
  };

  const markAllRead = () => {
    const result = commands.markAllNotificationsRead(USER_ACTOR);
    if (!result.ok) toast.error('Could not mark notifications as read', result.error.message);
  };

  return (
    <Popover
      label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      panelClassName="w-[min(22rem,calc(100vw-1.5rem))] -right-12 sm:right-0"
      triggerClassName="relative inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-content"
      trigger={
        <>
          <Bell className="size-4" aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-surface"
            />
          ) : null}
        </>
      }
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Notifications</h2>
              <p className="text-xs text-subtle">
                {unread > 0 ? `${unread} unread` : 'You are all caught up'}
              </p>
            </div>
            <button
              type="button"
              disabled={unread === 0}
              onClick={markAllRead}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-accent-strong transition-colors hover:bg-accent-soft disabled:pointer-events-none disabled:text-subtle"
            >
              <CheckCheck className="size-3.5" aria-hidden="true" />
              Mark all read
            </button>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              compact
              headingLevel={3}
              icon={BellOff}
              title="No notifications yet"
              description="Assignments, reviews and blocked work will show up here."
            />
          ) : (
            <ul className="max-h-[min(24rem,60vh)] divide-y divide-line overflow-y-auto">
              {recent.map((notification) => {
                const { icon: Icon, className } = NOTIFICATION_ICONS[notification.type];
                const target = targetOf(notification.relatedEntityId);
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => {
                        open(notification.id, notification.isRead, target);
                        close();
                      }}
                      className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover"
                    >
                      <Icon
                        className={cn('mt-0.5 size-4 shrink-0', className)}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span className="truncate">{notification.title}</span>
                          {notification.isRead ? null : (
                            <span className="size-1.5 shrink-0 rounded-full bg-accent">
                              <span className="sr-only">Unread</span>
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-sm text-muted">
                          {notification.message}
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-xs text-subtle">
                          <RelativeTime iso={notification.createdAt} />
                          {target ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-muted">{target.label}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-line px-4 py-2.5">
            <Link
              to={ROUTES.activity}
              onClick={close}
              className="text-xs font-medium text-accent-strong hover:underline"
            >
              View all activity
            </Link>
          </div>
        </>
      )}
    </Popover>
  );
}
