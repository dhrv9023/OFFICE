import { cn } from './cn';

/** A placeholder block for content that is still loading. Hidden from assistive technology. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-shimmer rounded-md bg-surface-hover', className)}
    />
  );
}
