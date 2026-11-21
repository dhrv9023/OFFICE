import { ShieldAlert } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import type { WorkspaceLifecycle } from '@/commands';
import { Button } from '@/components/Button';
import { downloadTextFile } from '@/services/download';
import { BootLayout } from './BootLayout';

interface RecoveryScreenProps {
  message: string;
  details: readonly string[];
  /** Fixes the user may choose to apply; the section is hidden when empty. */
  repairs?: readonly string[];
  lifecycle: Pick<
    WorkspaceLifecycle,
    'retry' | 'exportRecoveryData' | 'importWorkspace' | 'resetWorkspace' | 'repairWorkspace'
  >;
}

interface Feedback {
  tone: 'error' | 'info';
  text: string;
  details: readonly string[];
}

/**
 * Shown when saved data exists but cannot be loaded. The saved data has NOT been
 * touched; every way forward here is an explicit choice by the user.
 */
export function RecoveryScreen({ message, details, repairs = [], lifecycle }: RecoveryScreenProps) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingRepair, setConfirmingRepair] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const guarded = async (action: () => Promise<Feedback | null>): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback(await action());
    } finally {
      setBusy(false);
    }
  };

  const download = () =>
    guarded(async () => {
      const result = await lifecycle.exportRecoveryData();
      if (!result.ok) return { tone: 'error', text: result.error.message, details: [] };
      downloadTextFile(result.value.filename, result.value.contents);
      return { tone: 'info', text: `Downloaded ${result.value.filename}.`, details: [] };
    });

  const importFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void guarded(async () => {
      const result = await lifecycle.importWorkspace(await file.text());
      // On success the app becomes ready and this screen is replaced.
      return result.ok
        ? null
        : { tone: 'error', text: result.error.message, details: result.error.details };
    });
  };

  const repair = () =>
    guarded(async () => {
      const result = await lifecycle.repairWorkspace();
      setConfirmingRepair(false);
      // On success the app becomes ready and this screen is replaced.
      return result.ok
        ? null
        : { tone: 'error', text: result.error.message, details: result.error.details };
    });

  const reset = () =>
    guarded(async () => {
      const result = await lifecycle.resetWorkspace();
      setConfirmingReset(false);
      return result.ok ? null : { tone: 'error', text: result.error.message, details: [] };
    });

  return (
    <BootLayout>
      <section
        className="rounded-2xl border border-line bg-surface p-6 shadow-card"
        aria-labelledby="recovery-title"
      >
        <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
        <h1 id="recovery-title" className="mt-3 text-base font-semibold">
          Your saved workspace needs attention
        </h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <p className="mt-2 text-sm text-muted">
          Nothing has been deleted or replaced. Choose how to continue.
        </p>

        {details.length > 0 ? (
          <details className="mt-3 text-sm text-muted">
            <summary className="cursor-pointer text-content">Technical details</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">
              {details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </details>
        ) : null}

        {repairs.length > 0 ? (
          <div className="mt-4 rounded-lg border border-secondary/30 bg-secondary-soft p-3.5">
            <h2 className="text-sm font-semibold">A repair is available</h2>
            <p className="mt-1 text-sm text-muted">
              This data was saved before the current project rules. It can be fixed without losing
              anything:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {repairs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              The data exactly as saved now is kept as a backup in this browser first. Download it
              too if you want your own copy.
            </p>
            {confirmingRepair ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => {
                    void repair();
                  }}
                >
                  Apply repair and open
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setConfirmingRepair(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                className="mt-3"
                disabled={busy}
                onClick={() => {
                  setConfirmingRepair(true);
                }}
              >
                Repair…
              </Button>
            )}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              void download();
            }}
          >
            Download the saved data
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              fileInput.current?.click();
            }}
          >
            Restore from an export file…
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Workspace export file"
            tabIndex={-1}
            onChange={importFile}
          />
          <Button
            disabled={busy}
            onClick={() => {
              void guarded(async () => {
                await lifecycle.retry();
                return null;
              });
            }}
          >
            Try loading again
          </Button>

          {confirmingReset ? (
            <div className="rounded-md border border-danger/50 p-3">
              <p className="text-sm">
                This permanently erases the saved workspace and starts a new, empty company.
                Download the saved data first if you might want it.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    void reset();
                  }}
                >
                  Erase and start fresh
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setConfirmingReset(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setConfirmingReset(true);
              }}
            >
              Start fresh…
            </Button>
          )}
        </div>

        {feedback ? (
          <div
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={`mt-4 text-sm ${feedback.tone === 'error' ? 'text-danger' : 'text-success'}`}
          >
            <p>{feedback.text}</p>
            {feedback.details.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                {feedback.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </BootLayout>
  );
}
