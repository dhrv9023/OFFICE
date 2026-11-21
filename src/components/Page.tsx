import type { ReactNode } from 'react';
import { cn } from './cn';

interface PageProps {
  /** The page's one h1, set in the display size. */
  title: ReactNode;
  /** Visually hide the title (the office, where the canvas is the page). */
  hideTitle?: boolean;
  /** A short line under the title: what this page is, or a live summary. */
  description?: ReactNode;
  /** Small line above the title, e.g. the project's status. */
  eyebrow?: ReactNode;
  /** Page-level actions, aligned with the title. */
  actions?: ReactNode;
  children: ReactNode;
  /** `default` keeps a readable measure; `wide` is for boards that need every pixel. */
  width?: 'default' | 'wide';
}

/**
 * Standard page frame: display title, supporting line and actions, then content
 * on the sheet with consistent gutters and measure.
 */
export function Page({
  title,
  hideTitle = false,
  description,
  eyebrow,
  actions,
  children,
  width = 'default',
}: PageProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full animate-rise-in px-4 pt-7 pb-16 sm:px-6 lg:px-10 lg:pt-10',
        width === 'default' ? 'max-w-page' : 'max-w-none',
      )}
    >
      <header
        className={cn(
          'mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4',
          hideTitle && 'sr-only',
        )}
      >
        <div className="min-w-0 max-w-measure">
          {eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
          <h1 className="text-3xl font-semibold tracking-[-0.022em] text-balance">{title}</h1>
          {description ? <p className="mt-2 text-base text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

interface SectionProps {
  /** Heading text (an h2 unless `level` says otherwise). */
  title: ReactNode;
  id?: string;
  /** Quiet count or summary shown beside the title. */
  meta?: ReactNode;
  /** A link or button aligned to the right of the heading. */
  action?: ReactNode;
  level?: 2 | 3;
  className?: string;
  children: ReactNode;
}

/**
 * A titled region of a page. Sections sit directly on the sheet — no box — so
 * hierarchy comes from type and space instead of nested borders.
 */
export function Section({ title, id, meta, action, level = 2, className, children }: SectionProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <Heading
            id={id}
            className={cn(
              'font-semibold tracking-[-0.012em]',
              level === 2 ? 'text-lg' : 'text-base',
            )}
          >
            {title}
          </Heading>
          {meta ? <span className="truncate text-sm text-muted">{meta}</span> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
