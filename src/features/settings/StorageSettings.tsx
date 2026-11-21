import { Download, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { workspaceLifecycle } from '@/commands';
import { Button } from '@/components/Button';
import { Card, CardHeader } from '@/components/Card';
import { StatusIndicator } from '@/components/StatusIndicator';
import { RelativeTime } from '@/components/time';
import { downloadTextFile } from '@/services/download';
import { useAppStatus } from '@/stores/appStatus';

export function StorageSettings() {
  const phase = useAppStatus((state) => state.phase);
  const save = useAppStatus((state) => state.save);
  const [retrying, setRetrying] = useState(false);
  const temporary = phase.status === 'ready' && phase.storage === 'memory';

  const retry = async () => {
    setRetrying(true);
    await workspaceLifecycle.retrySave();
    setRetrying(false);
  };

  return (
    <Card aria-labelledby="settings-storage">
      <CardHeader
        id="settings-storage"
        title="Storage"
        description="Your workspace is kept in this browser, on this device. Clearing this site's data deletes it, so export a copy now and then."
      />
      <dl className="divide-y divide-line border-t border-line text-sm">
        <Row label="Workspace">
          {temporary ? (
            <StatusIndicator tone="warning" label="Temporary — not saved in this browser" />
          ) : (
            <StatusIndicator tone="success" label="Ready" />
          )}
        </Row>
        <Row label="Saving">
          {temporary ? (
            <span className="text-sm text-muted">
              Browser storage could not be opened, so changes are lost when the page closes. Reload
              the page to try again.
            </span>
          ) : save.state === 'error' ? (
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <span role="alert" className="text-sm text-danger sm:text-right">
                Your latest changes have not been saved. {save.message}
              </span>
              <Button
                size="sm"
                icon={RotateCcw}
                loading={retrying}
                onClick={() => {
                  void retry();
                }}
              >
                Retry saving
              </Button>
            </div>
          ) : save.state === 'saving' ? (
            <StatusIndicator tone="secondary" label="Saving…" pulse />
          ) : save.state === 'saved' ? (
            <span className="text-sm text-muted">
              All changes saved automatically · last saved <RelativeTime iso={save.at} />
            </span>
          ) : (
            <span className="text-sm text-muted">Changes are saved automatically.</span>
          )}
        </Row>
        <Row label="Backups">
          <Backups refreshKey={save.state} />
        </Row>
      </dl>
    </Card>
  );
}

const REASONS: Readonly<Record<string, string>> = {
  'pre-migration': 'Before an upgrade',
  'pre-repair': 'Before a repair',
  'pre-overwrite': 'Replaced by another tab’s choice',
};

/**
 * Safety copies kept in this browser before an upgrade, a repair, or keeping one
 * tab's version over another's. Download one and import it from "Workspace data"
 * to go back to it.
 */
function Backups({ refreshKey }: { refreshKey: string }) {
  const [backups, setBackups] = useState<
    | readonly {
        createdAt: string;
        reason: string;
        download: { filename: string; contents: string };
      }[]
    | null
  >(null);
  useEffect(() => {
    let live = true;
    void workspaceLifecycle.listBackups().then((result) => {
      if (live) setBackups(result.ok ? result.value : []);
    });
    return () => {
      live = false;
    };
  }, [refreshKey]);

  if (backups === null) return <span className="text-sm text-muted">Checking…</span>;
  if (backups.length === 0) {
    return <span className="text-sm text-muted">None. Backups are made before risky changes.</span>;
  }
  return (
    <ul className="flex flex-col gap-2 sm:items-end">
      {backups.map((backup) => (
        <li key={backup.download.filename} className="flex items-center gap-3">
          <span className="text-sm">
            {REASONS[backup.reason] ?? backup.reason} ·{' '}
            <RelativeTime iso={backup.createdAt} className="text-muted" />
          </span>
          <Button
            size="sm"
            icon={Download}
            onClick={() => {
              downloadTextFile(backup.download.filename, backup.download.contents);
            }}
          >
            Download
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="sm:text-right">{children}</dd>
    </div>
  );
}
