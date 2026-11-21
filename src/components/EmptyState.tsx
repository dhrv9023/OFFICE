import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Compact variant for use inside cards. */
  compact?: boolean;
  /** Heading level for the title, so it fits the surrounding outline. */
  headingLevel?: 2 | 3;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-1.5 px-4 py-9' : 'h-full min-h-64 gap-2 px-6 py-14',
      )}
    >
      <div
        className={cn(
          'mb-2 flex items-center justify-center rounded-full bg-surface-hover text-muted',
          compact ? 'size-10' : 'size-12',
        )}
      >
        <Icon className={compact ? 'size-[18px]' : 'size-5'} aria-hidden="true" />
      </div>
      <Heading className="text-base font-semibold tracking-[-0.006em]">{title}</Heading>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
