import { ChevronDown } from 'lucide-react';
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

interface FieldProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  /** Hide the label visually (it is still the accessible name). */
  hideLabel?: boolean | undefined;
  children: (control: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': true | undefined;
  }) => ReactNode;
}

/** Label, hint and error wiring shared by every form control. */
export function Field({ label, hint, error, hideLabel = false, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cn('text-sm font-medium', hideLabel && 'sr-only')}>
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  'w-full rounded-md border border-line-strong/80 bg-surface-sunken px-3 text-sm text-content shadow-[inset_0_1px_1px_rgb(0_0_0/0.04)] placeholder:text-subtle transition-colors hover:border-line-strong focus:border-focus focus-visible:outline-offset-0 aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60';

interface ControlProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  hideLabel?: boolean | undefined;
}

export function Input({
  label,
  hint,
  error,
  hideLabel,
  className,
  ...rest
}: ControlProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {(control) => <input className={cn(CONTROL, 'h-9', className)} {...control} {...rest} />}
    </Field>
  );
}

export function Textarea({
  label,
  hint,
  error,
  hideLabel,
  className,
  ...rest
}: ControlProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {(control) => (
        <textarea className={cn(CONTROL, 'min-h-24 py-2', className)} {...control} {...rest} />
      )}
    </Field>
  );
}

interface SelectProps extends ControlProps, SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly { value: string; label: string }[];
}

/** A native select (best keyboard and screen-reader support), styled to match. */
export function Select({
  label,
  hint,
  error,
  hideLabel,
  options,
  className,
  ...rest
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {(control) => (
        <div className="relative">
          <select
            className={cn(CONTROL, 'h-9 appearance-none pr-9', className)}
            {...control}
            {...rest}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-subtle"
            aria-hidden="true"
          />
        </div>
      )}
    </Field>
  );
}
