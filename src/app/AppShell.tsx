import { LoaderCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Outlet } from 'react-router';
import { Toaster } from '@/components/toast/Toaster';
import { TaskDetailsDrawer } from '@/features/tasks/TaskDetailsDrawer';
import { BlockTaskDialog } from '@/features/tasks/BlockTaskDialog';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';
import { useAppStatus } from '@/stores/appStatus';
import { SaveStatusBanner } from './SaveStatusBanner';
import { DesktopSidebar, MobileNav } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';

/**
 * Persistent application frame: sidebar (desktop) or drawer (mobile), top bar,
 * save-status banner and the routed page.
 */
export function AppShell() {
  useUnsavedChangesGuard();
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => {
    setNavOpen(false);
  }, []);

  return (
    <div className="flex h-full bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-contrast"
      >
        Skip to content
      </a>

      <DesktopSidebar />
      <MobileNav open={navOpen} onClose={closeNav} />

      {/* The sheet: every page lives on one surface, inset from the frame on desktop. */}
      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface lg:rounded-2xl lg:border lg:border-line lg:shadow-sheet">
          <TopBar
            onOpenNavigation={() => {
              setNavOpen(true);
            }}
          />
          <SaveStatusBanner />
          <main
            id="main"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto focus:outline-none"
          >
            <Outlet />
          </main>
        </div>
      </div>

      <TaskDetailsDrawer />
      <BlockTaskDialog />
      <OperationOverlay />
      <Toaster />
    </div>
  );
}

/** Blocks the interface while the whole workspace is being replaced (import, reset). */
function OperationOverlay() {
  const operation = useAppStatus((state) => state.operation);
  if (operation === null) return null;
  return (
    <div className="fixed inset-0 z-[55] flex animate-fade-in items-center justify-center bg-overlay backdrop-blur-[2px]">
      <div
        role="status"
        className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 text-sm shadow-overlay"
      >
        <LoaderCircle className="size-5 animate-spin text-accent" aria-hidden="true" />
        {operation === 'importing' ? 'Importing workspace…' : 'Resetting workspace…'}
      </div>
    </div>
  );
}
