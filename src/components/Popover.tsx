import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';
import { useDismiss } from './overlay';

interface PopoverProps {
  /** Accessible name of the trigger button. */
  label: string;
  trigger: ReactNode;
  /** Receives a `close` function so content can dismiss the popover (e.g. after navigating). */
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  triggerClassName?: string;
  panelClassName?: string;
}

/** A button that discloses a non-modal panel. Escape or an outside click closes it. */
export function Popover({
  label,
  trigger,
  children,
  align = 'end',
  triggerClassName,
  panelClassName,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };
  useDismiss(root, open, (reason) => {
    close(reason === 'escape');
  });

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={label}
          className={cn(
            'absolute top-full z-40 mt-2 animate-pop-in overflow-hidden rounded-xl border border-line bg-popover shadow-overlay',
            align === 'end' ? 'right-0' : 'left-0',
            panelClassName,
          )}
        >
          {children(() => {
            setOpen(false);
          })}
        </div>
      ) : null}
    </div>
  );
}
