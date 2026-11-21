import { workspaceLifecycle } from '@/commands';
import { toast } from '@/components/toast/toastStore';
import { downloadTextFile } from '@/services/download';

/** Exports the current workspace as a JSON download and reports the outcome. */
export function exportWorkspaceToFile(): void {
  const result = workspaceLifecycle.exportWorkspace();
  if (!result.ok) {
    toast.error('Export failed', result.error.message);
    return;
  }
  downloadTextFile(result.value.filename, result.value.contents);
  toast.success('Workspace exported', `Saved as ${result.value.filename}.`);
}
