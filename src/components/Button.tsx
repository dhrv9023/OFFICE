import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { BASE, SIZES, VARIANTS, type ButtonSize, type ButtonVariant } from './buttonStyles';
import { cn } from './cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled,
  className,
  type,
  children,
  ...rest
}: ButtonProps) {
  const Leading = loading ? LoaderCircle : Icon;
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {Leading ? (
        <Leading className={cn('size-4 shrink-0', loading && 'animate-spin')} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Accessible name; also used as the native tooltip. */
  label: string;
}

/** A square icon-only button. Always has an accessible name. */
export function IconButton({ icon: Icon, label, className, type, ...rest }: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-content disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
