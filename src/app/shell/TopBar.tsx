import { ChevronRight, Menu } from 'lucide-react';
import { Link, matchPath, useLocation } from 'react-router';
import { IconButton } from '@/components/Button';
import type { ProjectId } from '@/domain/ids';
import { useWorkspace } from '@/stores/workspace';
import { findNavItem, ROUTES } from '../navigation';
import { NotificationsMenu } from './NotificationsMenu';
import { ThemeToggle } from './ThemeToggle';

interface TopBarProps {
  onOpenNavigation: () => void;
}

/**
 * The sheet's header: where you are (a breadcrumb that starts at the section's
 * page) and the global actions. The page title itself is the page's h1.
 */
export function TopBar({ onOpenNavigation }: TopBarProps) {
  const { pathname } = useLocation();
  const projectMatch = matchPath(`${ROUTES.projects}/:projectId`, pathname);
  const projectId = projectMatch?.params.projectId as ProjectId | undefined;
  const projectName = useWorkspace((state) =>
    projectId ? state.projects[projectId]?.name : undefined,
  );
  const page = projectMatch ? findNavItem(ROUTES.projects) : findNavItem(pathname);
  const Icon = page?.icon;

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-4 lg:px-5">
      <IconButton
        icon={Menu}
        label="Open navigation"
        onClick={onOpenNavigation}
        className="lg:hidden"
      />

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          <li className="flex min-w-0 items-center gap-2">
            {Icon ? <Icon className="size-4 shrink-0 text-subtle" aria-hidden="true" /> : null}
            {page && projectMatch ? (
              <Link
                to={page.path}
                className="truncate rounded-sm text-muted transition-colors hover:text-content"
              >
                {page.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate font-medium">
                {page?.label ?? 'Page not found'}
              </span>
            )}
          </li>
          {projectMatch ? (
            <>
              <li aria-hidden="true">
                <ChevronRight className="size-3.5 text-subtle" />
              </li>
              <li className="min-w-0">
                <span aria-current="page" className="block truncate font-medium">
                  {projectName ?? 'Project not found'}
                </span>
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      <div className="flex items-center gap-0.5">
        <NotificationsMenu />
        <ThemeToggle />
      </div>
    </header>
  );
}
