import { toast } from '@/components/toast/toastStore';
import type { DomainError, DomainResult } from '@/domain/errors';

const TITLES: Partial<Record<DomainError['code'], string>> = {
  validation: 'Please check the details',
  not_found: 'It no longer exists',
  invalid_reference: 'Something it refers to is missing',
  invalid_transition: 'That move is not allowed',
  invalid_project_transition: 'That status change is not allowed',
  assignment_rejected: 'That assignment is not possible',
  dependency_cycle: 'Dependencies would form a loop',
  dependencies_incomplete: 'Waiting on other tasks',
  workspace_unavailable: 'The workspace is busy',
};

/** A short heading for a rejected command; the domain's own message is the detail. */
export function errorTitle(error: DomainError, fallback = 'That did not work'): string {
  if (error.code === 'conflict') {
    if (error.reason === 'no_change') return 'Nothing changed';
    if (error.reason === 'project_archived') return 'This project is archived';
    if (error.reason === 'project_completed') return 'This project is completed';
    if (error.reason === 'project_open_tasks') return 'The project still has open work';
    if (error.reason === 'meeting_closed') return 'This meeting is closed';
    return 'This task is closed';
  }
  return TITLES[error.code] ?? fallback;
}

/**
 * Shows the outcome of a command: a toast with the domain's explanation on
 * failure, and an optional confirmation on success. Returns the result unchanged.
 */
export function reportCommand<T>(
  result: DomainResult<T>,
  success?: { title: string; description?: string },
): DomainResult<T> {
  if (!result.ok) toast.error(errorTitle(result.error), result.error.message);
  else if (success) toast.success(success.title, success.description);
  return result;
}

/** The message for `field` if the error is a validation error about it. */
export function fieldError(error: DomainError | null, field: string): string | undefined {
  return error?.code === 'validation' && error.field === field ? error.message : undefined;
}
