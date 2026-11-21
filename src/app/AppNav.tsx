import { NavLink } from 'react-router';
import { NAV_ITEMS } from './navigation';

interface AppNavProps {
  orientation: 'vertical' | 'horizontal';
}

export function AppNav({ orientation }: AppNavProps) {
  const vertical = orientation === 'vertical';

  return (
    <nav aria-label="Primary">
      <ul className={vertical ? 'flex flex-col gap-0.5 px-2' : 'flex justify-around px-1'}>
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <li key={path} className={vertical ? undefined : 'flex-1'}>
            <NavLink
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                [
                  'flex items-center rounded-md transition-colors hover:bg-surface-hover',
                  vertical
                    ? 'gap-2.5 px-3 py-2 text-sm'
                    : 'flex-col gap-1 px-1 py-2 text-xs leading-none',
                  isActive
                    ? 'bg-surface-raised font-medium text-accent'
                    : 'text-muted hover:text-content',
                ].join(' ')
              }
            >
              <Icon className="size-4.5 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
