import { ChevronsUpDown, Download, Settings } from 'lucide-react';
import { useNavigate } from 'react-router';
import { cn } from '@/components/cn';
import { DropdownMenu } from '@/components/DropdownMenu';
import { useAppStatus } from '@/stores/appStatus';
import { ROUTES } from '../navigation';
import { exportWorkspaceToFile } from '../workspaceFiles';
import { BrandMark } from './Brand';

/**
 * The workspace switcher at the top of the sidebar: which company this is and
 * where it is stored. There are no accounts in Phase 1.
 */
export function WorkspaceMenu({ collapsed = false }: { collapsed?: boolean }) {
  const navigate = useNavigate();
  const storage = useAppStatus((state) =>
    state.phase.status === 'ready' ? state.phase.storage : null,
  );

  return (
    <DropdownMenu
      label="Workspace menu"
      align="start"
      triggerClassName={cn(
        'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-surface-hover/60',
        collapsed && 'justify-center',
      )}
      trigger={
        <>
          <BrandMark className="size-8" />
          <span className={cn('min-w-0 flex-1', collapsed && 'sr-only')}>
            <span className="block truncate text-sm leading-5 font-semibold tracking-[-0.006em]">
              My company
            </span>
            <span className="block truncate text-2xs text-subtle">
              Project HQ · {storage === 'memory' ? 'Not saved' : 'Saved locally'}
            </span>
          </span>
          {collapsed ? null : (
            <ChevronsUpDown className="size-4 shrink-0 text-subtle" aria-hidden="true" />
          )}
        </>
      }
      header={
        <div>
          <p className="text-sm font-medium">My company</p>
          <p className="text-xs text-subtle">
            {storage === 'memory'
              ? 'Temporary workspace · not saved'
              : 'Local workspace · saved on this device'}
          </p>
        </div>
      }
      items={[
        {
          label: 'Settings',
          icon: Settings,
          onSelect: () => {
            void navigate(ROUTES.settings);
          },
        },
        { label: 'Export workspace', icon: Download, onSelect: exportWorkspaceToFile },
      ]}
    />
  );
}
