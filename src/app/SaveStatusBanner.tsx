import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { workspaceLifecycle } from '@/commands';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppStatus } from '@/stores/appStatus';

/** Tells the user, persistently, whenever their changes are not reaching disk. */
export function SaveStatusBanner() {
  const phase = useAppStatus((state) => state.phase);
  const save = useAppStatus((state) => state.save);
  const [confirmKeep, setConfirmKeep] = useState(false);

  const unsaved = phase.status === 'ready' && phase.storage === 'memory';
  if (!unsaved && save.state !== 'error') return null;
  const conflict = save.state === 'error' && save.kind === 'conflict';

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning/10 px-5 py-2 text-sm"
    >
      <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
      {conflict ? (
        <>
          <span>
            Project HQ is open in another tab, and that tab saved newer changes. Your latest changes
            here are not saved. Choose which version to keep.
          </span>
          <button
            type="button"
            className="font-medium text-accent hover:text-accent-hover"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload (use the other tab’s version)
          </button>
          <button
            type="button"
            className="font-medium text-accent hover:text-accent-hover"
            onClick={() => {
              setConfirmKeep(true);
            }}
          >
            Keep this tab’s version
          </button>
          <ConfirmDialog
            open={confirmKeep}
            title="Keep this tab’s version?"
            description="The other tab’s newer changes will be replaced by what you see here. A backup of them is kept in this browser (Settings → Storage), so nothing is lost for good."
            confirmLabel="Keep this version"
            cancelLabel="Not now"
            onCancel={() => {
              setConfirmKeep(false);
            }}
            onConfirm={() => {
              setConfirmKeep(false);
              void workspaceLifecycle.keepThisVersion();
            }}
          />
        </>
      ) : save.state === 'error' ? (
        <>
          <span>Your latest changes have not been saved. {save.message}</span>
          <button
            type="button"
            className="font-medium text-accent hover:text-accent-hover"
            onClick={() => {
              void workspaceLifecycle.retrySave();
            }}
          >
            Retry
          </button>
        </>
      ) : (
        <span>
          Storage is unavailable, so this is a temporary workspace. Changes are lost when the page
          closes.
        </span>
      )}
    </div>
  );
}
