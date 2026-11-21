import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * The one container. Use it for a single object or a single list — never inside
 * another Card. Separate things inside it with hairlines, not more boxes.
 */
export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn('rounded-xl border border-line bg-card shadow-card', className)}
      {...rest}
    />
  );
}

interface CardHeaderProps {
  title: string;
  /** Heading id, so the card can be labelled with aria-labelledby. */
  id?: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export function CardHeader({ title, id, description, action, icon }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon}
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold tracking-[-0.006em]">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...rest} />;
}
