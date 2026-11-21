import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '@/components/Button';
import { cn } from '@/components/cn';
import { useModalFocus } from '@/components/overlay';
import { usePreferences } from '@/stores/preferencesStore';
import { WorkspaceMenu } from './WorkspaceMenu';
import { SidebarNav } from './SidebarNav';

/** Desktop sidebar (≥ lg). Collapses to an icon rail; the choice is remembered. */
export function DesktopSidebar() {
  const collapsed = usePreferences((state) => state.sidebarCollapsed);
  const setCollapsed = usePreferences((state) => state.setSidebarCollapsed);

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col bg-canvas transition-[width] duration-200 ease-out lg:flex',
        collapsed ? 'w-[60px]' : 'w-60',
      )}
    >
      <div className={cn('flex h-16 items-center px-2.5', collapsed && 'justify-center')}>
        <WorkspaceMenu collapsed={collapsed} />
      </div>
      <SidebarNav
        collapsed={collapsed}
        footerAction={
          <IconButton
            icon={collapsed ? PanelLeftOpen : PanelLeftClose}
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            onClick={() => {
              setCollapsed(!collapsed);
            }}
          />
        }
      />
    </aside>
  );
}

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

/** Slide-in navigation drawer for small screens (< lg). Modal while open. */
export function MobileNav({ open, onClose }: MobileNavProps) {
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel, open, onClose);

  // Close if the viewport grows into desktop layout while the drawer is open.
  useEffect(() => {
    if (!open || typeof matchMedia !== 'function') return;
    const desktop = matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (desktop.matches) onClose();
    };
    desktop.addEventListener('change', onChange);
    return () => {
      desktop.removeEventListener('change', onChange);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 animate-fade-in bg-overlay"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="relative flex h-full w-72 max-w-[85vw] animate-slide-in-left flex-col border-r border-line bg-canvas shadow-overlay focus:outline-none"
      >
        <div className="flex h-16 items-center justify-between gap-2 px-2.5">
          <div className="min-w-0 flex-1">
            <WorkspaceMenu />
          </div>
          <IconButton icon={X} label="Close navigation" onClick={onClose} />
        </div>
        <SidebarNav collapsed={false} onNavigate={onClose} />
      </div>
    </div>,
    document.body,
  );
}
