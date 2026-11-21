import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/components/cn';

/* Building blocks shared by the office inspector's views. */

/** One band of the inspector, separated from the next by a hairline. */
export function Section({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-b border-line px-5 py-4 last:border-b-0', className)}>
      {title ? <h2 className="mb-3 text-xs font-medium text-muted">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Header({
  icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <Section>
      <div className="flex items-start gap-3">
        <IconTile icon={icon} />
        <div className="min-w-0">
          <h2 id="inspector-title" className="text-lg font-semibold">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        </div>
      </div>
    </Section>
  );
}

export function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-muted">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
