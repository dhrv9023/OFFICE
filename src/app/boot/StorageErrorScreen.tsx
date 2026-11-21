import { DatabaseZap } from 'lucide-react';
import { Button } from '@/components/Button';
import { BootLayout } from './BootLayout';

interface StorageErrorScreenProps {
  message: string;
  onRetry: () => void;
  onContinueWithoutSaving: () => void;
}

/** Shown when browser storage itself cannot be used. Nothing has been changed on disk. */
export function StorageErrorScreen({
  message,
  onRetry,
  onContinueWithoutSaving,
}: StorageErrorScreenProps) {
  return (
    <BootLayout>
      <section
        role="alert"
        className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card"
        aria-labelledby="storage-error-title"
      >
        <DatabaseZap className="mx-auto size-8 text-danger" aria-hidden="true" />
        <h1 id="storage-error-title" className="mt-3 text-base font-semibold">
          Your workspace couldn’t be opened
        </h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <p className="mt-2 text-sm text-muted">Any saved data has been left as it is.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
          <Button onClick={onContinueWithoutSaving}>Continue without saving</Button>
        </div>
        <p className="mt-3 text-xs text-subtle">
          Continuing starts a temporary workspace. It is lost when you close or reload the page.
        </p>
      </section>
    </BootLayout>
  );
}
