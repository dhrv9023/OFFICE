import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../cn';
import { useToastStore, type Toast, type ToastTone } from './toastStore';

const AUTO_DISMISS_MS = 6000;

const ICONS: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  success: { icon: CircleCheck, className: 'text-success' },
  error: { icon: CircleAlert, className: 'text-danger' },
  info: { icon: Info, className: 'text-secondary' },
};

/**
 * Renders toasts in two live regions: errors are assertive, the rest polite.
 * Hovering or focusing a toast pauses its timer; errors never auto-dismiss.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const errors = toasts.filter((item) => item.tone === 'error');
  const others = toasts.filter((item) => item.tone !== 'error');

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5">
      <div role="alert" aria-live="assertive" className="flex w-full flex-col items-end gap-2">
        {errors.map((item) => (
          <ToastCard key={item.id} toast={item} />
        ))}
      </div>
      <div role="status" aria-live="polite" className="flex w-full flex-col items-end gap-2">
        {others.map((item) => (
          <ToastCard key={item.id} toast={item} />
        ))}
      </div>
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const [paused, setPaused] = useState(false);
  const { icon: Icon, className } = ICONS[toast.tone];

  useEffect(() => {
    if (paused || toast.tone === 'error') return;
    const timer = setTimeout(() => {
      dismiss(toast.id);
    }, AUTO_DISMISS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [paused, toast.id, toast.tone, dismiss]);

  return (
    <div
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        setPaused(false);
      }}
      onFocus={() => {
        setPaused(true);
      }}
      onBlur={() => {
        setPaused(false);
      }}
      className="pointer-events-auto flex w-full animate-toast-in items-start gap-3 rounded-xl border border-line bg-popover p-3.5 shadow-overlay sm:w-96"
    >
      <Icon className={cn('mt-0.5 size-[18px] shrink-0', className)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-sm text-muted">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => {
          dismiss(toast.id);
        }}
        className="-m-1 rounded-md p-1 text-subtle transition-colors hover:bg-surface-hover hover:text-content"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
