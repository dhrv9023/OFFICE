import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { cn } from './cn';
import { useModalFocus } from './overlay';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** `alertdialog` for confirmations that interrupt the user. */
  role?: 'dialog' | 'alertdialog';
  /** Disable closing by Escape / backdrop while an action is running. */
  dismissible?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Modal dialog: rendered in a portal, focus moved inside and trapped, Escape and
 * backdrop close it, focus returns to the trigger afterwards. Put `data-autofocus`
 * on the element that should receive focus first.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  role = 'dialog',
  dismissible = true,
  size = 'md',
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const close = () => {
    if (dismissible) onClose();
  };
  useModalFocus(panel, open, close);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-overlay backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={close}
      />
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[calc(100dvh-1.5rem)] w-full animate-pop-in flex-col rounded-2xl border border-line bg-popover shadow-overlay focus:outline-none',
          { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-[-0.012em]">
              {title}
            </h2>
            {description ? (
              <div id={descriptionId} className="mt-1.5 text-sm text-muted">
                {description}
              </div>
            ) : null}
          </div>
          {dismissible ? (
            <IconButton icon={X} label="Close" onClick={onClose} className="-mt-1.5 -mr-2" />
          ) : null}
        </div>
        {children ? <div className="overflow-y-auto px-6 pt-5">{children}</div> : null}
        {footer ? (
          <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line bg-surface-sunken/60 px-6 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : (
          <div className="pb-6" />
        )}
      </div>
    </div>,
    document.body,
  );
}
