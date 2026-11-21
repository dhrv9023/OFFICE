import { validationError, type DomainResult } from '../errors';
import { err, ok } from '../result';
import { PRIORITIES } from '../types/priority';
import { PROJECT_CATEGORIES, PROJECT_STATUSES, type ProjectFields } from '../types/project';
import type { TaskFields } from '../types/task';

export const LIMITS = {
  projectName: 100,
  taskTitle: 140,
  description: 4000,
  listItems: 50,
  listItemLength: 300,
  reason: 500,
  employeeName: 80,
  meetingTitle: 100,
  meetingParticipants: 20,
} as const;

/**
 * Field validators take `unknown` on purpose: callers are typed, but values can
 * also arrive from imports and (later) AI agents, so nothing is trusted at runtime.
 * Each returns the normalised value (trimmed text, de-blanked lists).
 */
function validateText(
  field: string,
  label: string,
  value: unknown,
  limits: { min: number; max: number },
): DomainResult<string> {
  if (typeof value !== 'string') return err(validationError(field, `${label} must be text.`));
  const text = value.trim();
  if (text.length < limits.min) return err(validationError(field, `${label} is required.`));
  if (text.length > limits.max) {
    return err(validationError(field, `${label} must be ${limits.max} characters or fewer.`));
  }
  return ok(text);
}

export function validateProjectName(value: unknown): DomainResult<string> {
  return validateText('name', 'Project name', value, { min: 1, max: LIMITS.projectName });
}

export function validateTaskTitle(value: unknown): DomainResult<string> {
  return validateText('title', 'Task title', value, { min: 1, max: LIMITS.taskTitle });
}

/**
 * A person's display name. Trimmed; 1–80 characters. Any characters are allowed
 * (spaces, hyphens, apostrophes, accents, non-Latin scripts) except control
 * characters such as line breaks, which cannot be shown on one line.
 */
export function validateEmployeeName(value: unknown): DomainResult<string> {
  const text = validateText('name', 'Name', value, { min: 1, max: LIMITS.employeeName });
  if (!text.ok) return text;
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(text.value)) {
    return err(validationError('name', 'Name must be on a single line.'));
  }
  return ok(text.value);
}

/** A message: 1–4000 characters after trimming; line breaks are fine. */
export function validateMessageBody(value: unknown): DomainResult<string> {
  return validateText('body', 'Message', value, { min: 1, max: LIMITS.description });
}

export function validateMeetingTitle(value: unknown): DomainResult<string> {
  return validateText('title', 'Meeting title', value, { min: 1, max: LIMITS.meetingTitle });
}

export function validateDescription(value: unknown): DomainResult<string> {
  return validateText('description', 'Description', value, { min: 0, max: LIMITS.description });
}

/** Optional long free text (an agenda, meeting notes) with its own field name and label. */
export function validateLongText(
  field: string,
  label: string,
  value: unknown,
): DomainResult<string> {
  return validateText(field, label, value, { min: 0, max: LIMITS.description });
}

/** Optional free-text reason attached to a status change. */
export function validateReason(value: unknown): DomainResult<string> {
  return validateText('reason', 'Reason', value, { min: 0, max: LIMITS.reason });
}

export function validateEnum<T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
): DomainResult<T> {
  const match = allowed.find((option) => option === value);
  if (match !== undefined) return ok(match);
  return err(validationError(field, `${field} must be one of: ${allowed.join(', ')}.`));
}

export function validateStringList(field: string, value: unknown): DomainResult<readonly string[]> {
  if (!Array.isArray(value)) return err(validationError(field, `${field} must be a list.`));
  if (value.length > LIMITS.listItems) {
    return err(validationError(field, `${field} can have at most ${LIMITS.listItems} entries.`));
  }
  const items: string[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'string') {
      return err(validationError(field, `Every entry in ${field} must be text.`));
    }
    const text = entry.trim();
    if (text.length === 0) {
      return err(validationError(field, `${field} cannot contain blank entries.`));
    }
    if (text.length > LIMITS.listItemLength) {
      return err(
        validationError(
          field,
          `Entries in ${field} must be ${LIMITS.listItemLength} characters or fewer.`,
        ),
      );
    }
    items.push(text);
  }
  return ok(items);
}

/** A deadline is a real calendar day written `YYYY-MM-DD`, or null for "none". */
export function validateDeadline(value: unknown): DomainResult<string | null> {
  if (value === null) return ok(null);
  const invalid = err(validationError('deadline', 'Deadline must be a date like 2026-12-31.'));
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return invalid;
  return ok(value);
}

export type FieldValidators<T> = {
  readonly [K in keyof T]: (value: unknown) => DomainResult<T[K]>;
};

/**
 * Validates the fields of `input` that are present (not `undefined`) and returns
 * them normalised. Keys without a validator are ignored, so unexpected properties
 * can never reach the state. Stops at the first invalid field.
 */
export function validateFields<T extends object>(
  validators: FieldValidators<T>,
  input: { readonly [K in keyof T]?: unknown },
): DomainResult<Partial<T>> {
  const output: Partial<T> = {};
  for (const key of Object.keys(validators) as (keyof T)[]) {
    const raw = input[key];
    if (raw === undefined) continue;
    const result = validators[key](raw);
    if (!result.ok) return result;
    output[key] = result.value;
  }
  return ok(output);
}

export const PROJECT_FIELD_VALIDATORS: FieldValidators<ProjectFields> = {
  name: validateProjectName,
  description: validateDescription,
  category: (value) => validateEnum('category', value, PROJECT_CATEGORIES),
  objectives: (value) => validateStringList('objectives', value),
  requirements: (value) => validateStringList('requirements', value),
  priority: (value) => validateEnum('priority', value, PRIORITIES),
  status: (value) => validateEnum('status', value, PROJECT_STATUSES),
  deadline: validateDeadline,
};

export const TASK_FIELD_VALIDATORS: FieldValidators<TaskFields> = {
  title: validateTaskTitle,
  description: validateDescription,
  priority: (value) => validateEnum('priority', value, PRIORITIES),
  deadline: validateDeadline,
};
