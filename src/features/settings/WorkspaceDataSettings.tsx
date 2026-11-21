import { CircleAlert, Download, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { workspaceLifecycle, type ImportPreview, type LifecycleError } from '@/commands';
import { exportWorkspaceToFile } from '@/app/workspaceFiles';
import { Button } from '@/components/Button';
import { Card, CardHeader } from '@/components/Card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/toast/toastStore';
import { summarize } from '@/domain/snapshot/format';
import { useAppStatus } from '@/stores/appStatus';
import { getWorkspace } from '@/stores/workspace';

/** Files far larger than any real workspace are refused before being read. */
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

interface PendingImport {
  readonly fileName: string;
  readonly json: string;
  readonly preview: ImportPreview;
}

export function WorkspaceDataSettings() {
  const busy = useAppStatus((state) => state.operation !== null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<LifecycleError | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportError(null);

    if (file.size > MAX_IMPORT_BYTES) {
      setImportError({
        kind: 'malformed',
        message: `"${file.name}" is too large to be a Project HQ export.`,
        details: [],
      });
      return;
    }
    const json = await file.text();
    const preview = workspaceLifecycle.previewImport(json);
    if (!preview.ok) {
      setImportError(preview.error);
      return;
    }
    setPending({ fileName: file.name, json, preview: preview.value });
  };

  const confirmImport = async () => {
    if (!pending) return;
    setImporting(true);
    const result = await workspaceLifecycle.importWorkspace(pending.json);
    setImporting(false);
    setPending(null);
    if (result.ok) {
      toast.success('Workspace imported', `Loaded from ${pending.fileName}.`);
    } else {
      setImportError(result.error);
    }
  };

  const confirmReset = async () => {
    setResetting(true);
    const result = await workspaceLifecycle.resetWorkspace();
    setResetting(false);
    setConfirmingReset(false);
    if (result.ok) {
      toast.success('Workspace reset', 'You are back to the starting company.');
    } else {
      toast.error('Reset failed', `${result.error.message} Nothing was changed.`);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card aria-labelledby="settings-backup">
        <CardHeader
          id="settings-backup"
          title="Backup and restore"
          description="Your workspace is saved automatically. Files let you keep a copy or move it to another browser."
        />
        <div className="divide-y divide-line border-t border-line">
          <SettingRow
            title="Export workspace"
            description="Download a JSON file with every department, employee, project, task, activity event and notification."
            action={
              <Button icon={Download} disabled={busy} onClick={exportWorkspaceToFile}>
                Export
              </Button>
            }
          />
          <SettingRow
            title="Import workspace"
            description="Replace this workspace with a Project HQ export file. The file is checked first and you confirm before anything changes."
            action={
              <>
                <Button
                  icon={Upload}
                  disabled={busy}
                  onClick={() => {
                    fileInput.current?.click();
                  }}
                >
                  Import…
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/json,.json"
                  aria-label="Workspace file to import"
                  tabIndex={-1}
                  className="sr-only"
                  onChange={(event) => {
                    void onFileChosen(event);
                  }}
                />
              </>
            }
          >
            {importError ? <ImportErrorMessage error={importError} /> : null}
          </SettingRow>
        </div>
      </Card>

      <Card aria-labelledby="settings-danger" className="border-danger/30">
        <CardHeader
          id="settings-danger"
          title="Danger zone"
          description="Actions here cannot be undone."
        />
        <div className="border-t border-line">
          <SettingRow
            title="Reset workspace"
            description="Delete all projects, tasks, activity and notifications and return to the starting company of five employees."
            action={
              <Button
                variant="danger"
                icon={RotateCcw}
                disabled={busy}
                onClick={() => {
                  setConfirmingReset(true);
                }}
              >
                Reset…
              </Button>
            }
          />
        </div>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        title="Replace your workspace?"
        description={
          pending ? (
            <>
              Everything in your current workspace will be replaced with the contents of{' '}
              <span className="font-medium text-content">{pending.fileName}</span>. This cannot be
              undone.
            </>
          ) : null
        }
        confirmLabel="Replace workspace"
        tone="danger"
        busy={importing}
        onCancel={() => {
          setPending(null);
        }}
        onConfirm={() => {
          void confirmImport();
        }}
      >
        {pending ? <ImportComparison preview={pending.preview} /> : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmingReset}
        title="Reset the workspace?"
        description="All projects, tasks, activity and notifications will be permanently deleted, and the five starting employees restored. This cannot be undone."
        confirmLabel="Reset workspace"
        tone="danger"
        busy={resetting}
        onCancel={() => {
          setConfirmingReset(false);
        }}
        onConfirm={() => {
          void confirmReset();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-sm text-muted">
          Want a copy first?
          <Button size="sm" icon={Download} disabled={resetting} onClick={exportWorkspaceToFile}>
            Export workspace
          </Button>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function SettingRow({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="mt-0.5 text-sm text-muted">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      </div>
      {children}
    </div>
  );
}

function ImportErrorMessage({ error }: { error: LifecycleError }) {
  return (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-danger/35 bg-danger/10 px-3.5 py-3 text-sm"
    >
      <p className="flex items-start gap-2 font-medium text-danger">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>The file was not imported. {error.message} Your workspace has not been changed.</span>
      </p>
      {error.details.length > 0 ? (
        <details className="mt-2 pl-6 text-muted">
          <summary className="cursor-pointer text-content">
            {error.details.length} problem{error.details.length === 1 ? '' : 's'} found
          </summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 font-mono text-xs break-words">
            {error.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ImportComparison({ preview }: { preview: ImportPreview }) {
  const current = summarize(getWorkspace());
  const rows: readonly [string, number, number][] = [
    ['Employees', current.employees, preview.summary.employees],
    ['Projects', current.projects, preview.summary.projects],
    ['Tasks', current.tasks, preview.summary.tasks],
    ['Activity events', current.activityEvents, preview.summary.activityEvents],
    ['Notifications', current.notifications, preview.summary.notifications],
  ];
  return (
    <div>
      <table className="w-full text-sm">
        <caption className="sr-only">Current workspace compared with the file</caption>
        <thead>
          <tr className="text-left text-xs text-subtle">
            <th scope="col" className="pb-1.5 font-medium">
              <span className="sr-only">Item</span>
            </th>
            <th scope="col" className="pb-1.5 text-right font-medium">
              Now
            </th>
            <th scope="col" className="pb-1.5 text-right font-medium">
              In file
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-t border-line">
          {rows.map(([label, now, incoming]) => (
            <tr key={label}>
              <th scope="row" className="py-1.5 text-left font-normal text-muted">
                {label}
              </th>
              <td className="py-1.5 text-right tabular-nums">{now}</td>
              <td className="py-1.5 text-right font-medium tabular-nums">{incoming}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview.migrated ? (
        <p className="mt-3 text-xs text-muted">
          This file was made by an older version of Project HQ and will be upgraded as it is
          imported.
        </p>
      ) : null}
    </div>
  );
}
