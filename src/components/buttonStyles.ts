import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,filter] duration-150 disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0';

export const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-contrast shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.2)] hover:bg-accent-hover active:brightness-95',
  secondary:
    'border border-line-strong/70 bg-card text-content shadow-card hover:border-line-strong hover:bg-surface-hover',
  ghost: 'text-muted hover:bg-surface-hover hover:text-content',
  danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/15',
};

export const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-9 gap-2 px-3.5 text-sm',
};

/** Button styling for things that are not buttons (router links that look like one). */
export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md') {
  return cn(BASE, VARIANTS[variant], SIZES[size]);
}
