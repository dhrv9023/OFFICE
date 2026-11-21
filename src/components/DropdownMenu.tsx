import type { LucideIcon } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';
import { useDismiss } from './overlay';

export interface MenuItem {
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly onSelect: () => void;
  readonly tone?: 'default' | 'danger';
  /** Shown but not selectable; `description` should say why. */
  readonly disabled?: boolean;
  /** A second line of smaller text, e.g. why the item is unavailable. */
  readonly description?: string;
}

interface DropdownMenuProps {
  /** Accessible name of the trigger button. */
  label: string;
  /** Visible contents of the trigger button. */
  trigger: ReactNode;
  /** Optional non-interactive header (e.g. who/what the menu is about). */
  header?: ReactNode;
  items: readonly MenuItem[];
  align?: 'start' | 'end';
  triggerClassName?: string;
  /** Width of the menu panel. */
  menuClassName?: string;
}

/**
 * WAI-ARIA menu button: Enter/Space/ArrowDown open it on the first item, ArrowUp on
 * the last; arrows, Home and End move; Escape closes and returns focus; Tab closes.
 */
export function DropdownMenu({
  label,
  trigger,
  header,
  items,
  align = 'end',
  triggerClassName,
  menuClassName = 'w-60',
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const focusItem = (index: number) => {
    const count = items.length;
    itemRefs.current[((index % count) + count) % count]?.focus();
  };

  const openAt = (index: number) => {
    setOpen(true);
    requestAnimationFrame(() => {
      focusItem(index);
    });
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };

  useDismiss(root, open, (reason) => {
    close(reason === 'escape');
  });

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(items.length - 1);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    const moves: Record<string, number> = {
      ArrowDown: current + 1,
      ArrowUp: current - 1,
      Home: 0,
      End: items.length - 1,
    };
    const target = moves[event.key];
    if (target !== undefined) {
      event.preventDefault();
      focusItem(target);
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (open) close(false);
          else openAt(0);
        }}
        onKeyDown={onTriggerKeyDown}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          className={cn(
            'absolute top-full z-40 mt-2 max-w-[calc(100vw-1.5rem)] animate-pop-in overflow-hidden rounded-xl border border-line bg-popover shadow-overlay',
            menuClassName,
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {header ? <div className="border-b border-line px-3.5 py-3">{header}</div> : null}
          <div
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            className="p-1.5"
          >
            {items.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={item.disabled === true || undefined}
                  onClick={() => {
                    if (item.disabled === true) return;
                    close(true);
                    item.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-hover focus:bg-surface-hover focus:outline-none',
                    item.tone === 'danger' ? 'text-danger' : 'text-content',
                    item.disabled === true && 'cursor-not-allowed text-subtle',
                  )}
                >
                  {Icon ? (
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block">{item.label}</span>
                    {item.description ? (
                      <span className="mt-0.5 block text-xs text-muted">{item.description}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
