import { Skeleton } from '@/components/Skeleton';
import { Spinner } from '@/components/Spinner';
import { BootLayout } from './BootLayout';

export function LoadingScreen() {
  return (
    <BootLayout>
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex justify-center">
          <Spinner label="Opening your workspace…" />
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
        <Skeleton className="mt-3 h-24" />
      </div>
    </BootLayout>
  );
}
