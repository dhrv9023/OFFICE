import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

interface TooltipProps {
  content: string;
  side?: 'right' | 'bottom';
  /** When false the tooltip is not shown (e.g. the label is already visible). */
  enabled?: boolean;
  children: ReactNode;
  /** Layout of the wrapper around the trigger. */
  className?: string;
}

interface Position {
  top: number;
  left: number;
}

/**
 * Shows a short label on hover and keyboard focus, positioned in a portal so it is
 * never clipped by scrolling containers. It describes its trigger via
 * aria-describedby; the trigger must still have its own accessible name.
 */
export function Tooltip({
  content,
  side = 'bottom',
  enabled = true,
  children,
  className = 'inline-flex',
}: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const id = useId();

  const show = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!enabled || !rect) return;
    setPosition(
      side === 'right'
        ? { top: rect.top + rect.height / 2, left: rect.right + 10 }
        : { top: rect.bottom + 8, left: rect.left + rect.width / 2 },
    );
  };
  const hide = () => {
    setPosition(null);
  };

  return (
    <span
      ref={anchor}
      className={className}
      aria-describedby={position ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide();
      }}
    >
      {children}
      {position
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              style={position}
              className={cn(
                'pointer-events-none fixed z-50 animate-fade-in rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-xs font-medium whitespace-nowrap text-content shadow-overlay',
                side === 'right' ? '-translate-y-1/2' : '-translate-x-1/2',
              )}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
