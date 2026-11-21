import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cn } from '@/components/cn';
import { Tooltip } from '@/components/Tooltip';
import { useWorkspace } from '@/stores/workspace';
import { NAV_SECTIONS, ROUTES, SETTINGS_ITEM, type NavItem } from '../navigation';
import { TeamPresence } from './TeamPresence';

interface SidebarNavProps {
  collapsed: boolean;
  /** Called after a link is followed (closes the mobile drawer). */
  onNavigate?: () => void;
  /** Extra control shown beside Settings in the footer (the collapse toggle). */
  footerAction?: ReactNode;
}

/** Primary navigation, shared by the desktop sidebar and the mobile drawer. */
export function SidebarNav({ collapsed, onNavigate, footerAction }: SidebarNavProps) {
  return (
    <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-2.5 pt-2 pb-3">
        {NAV_SECTIONS.map((section, index) => (
          <div key={section.label} className={index > 0 ? 'mt-6' : undefined}>
            {collapsed ? (
              index > 0 ? (
                <div className="mx-2 mb-3 border-t border-line" aria-hidden="true" />
              ) : null
            ) : (
              <p className="mb-1.5 px-2.5 text-2xs font-medium text-subtle">{section.label}</p>
            )}
            <ul className="flex flex-col gap-px">
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavItemLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {collapsed ? null : <TeamPresence />}
      <div
        className={cn(
          'flex gap-1 px-2.5 pt-1 pb-3',
          collapsed ? 'flex-col items-center' : 'items-center',
        )}
      >
        <ul className={collapsed ? 'w-full' : 'min-w-0 flex-1'}>
          <li>
            <NavItemLink item={SETTINGS_ITEM} collapsed={collapsed} onNavigate={onNavigate} />
          </li>
        </ul>
        {footerAction}
      </div>
    </nav>
  );
}

function NavItemLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate: (() => void) | undefined;
}) {
  const Icon = item.icon;
  return (
    <Tooltip content={item.label} side="right" enabled={collapsed} className="flex">
      <NavLink
        to={item.path}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'group relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-150',
            collapsed && 'h-9 justify-center px-0',
            isActive
              ? 'bg-surface text-content shadow-[0_0_0_1px_var(--color-line),var(--hq-shadow)]'
              : 'text-muted hover:bg-surface-hover/60 hover:text-content',
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon
              className={cn(
                'size-4 shrink-0 transition-colors',
                isActive ? 'text-accent' : 'text-subtle group-hover:text-muted',
              )}
              strokeWidth={isActive ? 2.25 : 1.9}
              aria-hidden="true"
            />
            <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
            {item.path === ROUTES.approvals ? <PendingBadge collapsed={collapsed} /> : null}
          </>
        )}
      </NavLink>
    </Tooltip>
  );
}

/** Pending approval requests: a number to act on, never shown when there are none. */
function PendingBadge({ collapsed }: { collapsed: boolean }) {
  const pending = useWorkspace(
    (state) => state.approvals.filter((approval) => approval.status === 'pending').length,
  );
  if (pending === 0) return null;
  return collapsed ? (
    <>
      <span
        className="absolute top-1.5 right-1.5 size-2 rounded-full bg-warning"
        aria-hidden="true"
      />
      <span className="sr-only">{pending} pending</span>
    </>
  ) : (
    <span className="ml-auto rounded-full bg-warning/15 px-1.5 text-xs font-semibold text-warning tabular-nums">
      {pending}
      <span className="sr-only"> pending</span>
    </span>
  );
}
