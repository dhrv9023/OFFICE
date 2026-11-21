import { LoaderCircle } from 'lucide-react';

interface SpinnerProps {
  /** Announced to assistive technology. */
  label: string;
}

export function Spinner({ label }: SpinnerProps) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
