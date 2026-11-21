import { describe, expect, it } from 'vitest';
import { expectError } from '../../test/harness';
import {
  LIMITS,
  PROJECT_FIELD_VALIDATORS,
  validateDeadline,
  validateDescription,
  validateEnum,
  validateFields,
  validateProjectName,
  validateStringList,
  validateTaskTitle,
} from './validation';

describe.each([
  ['project name', validateProjectName, 'name', LIMITS.projectName],
  ['task title', validateTaskTitle, 'title', LIMITS.taskTitle],
] as const)('%s', (_label, validate, field, max) => {
  it('accepts and trims text', () => {
    expect(validate('  Launch site  ')).toEqual({ ok: true, value: 'Launch site' });
  });

  it.each(['', '   ', '\n\t'])('rejects blank %j', (value) => {
    expect(expectError(validate(value), 'validation').field).toBe(field);
  });

  it('accepts exactly the maximum length and rejects one more', () => {
    expect(validate('x'.repeat(max)).ok).toBe(true);
    expectError(validate('x'.repeat(max + 1)), 'validation');
  });

  it.each([undefined, null, 42, {}, ['a']])('rejects non-text %j', (value) => {
    expectError(validate(value), 'validation');
  });
});

describe('validateDescription', () => {
  it('allows empty text', () => {
    expect(validateDescription('')).toEqual({ ok: true, value: '' });
  });

  it('rejects text over the limit', () => {
    expectError(validateDescription('x'.repeat(LIMITS.description + 1)), 'validation');
  });
});

describe('validateEnum', () => {
  const options = ['low', 'high'] as const;

  it('accepts a listed value', () => {
    expect(validateEnum('priority', 'high', options)).toEqual({ ok: true, value: 'high' });
  });

  it.each(['urgent', '', 1, null])('rejects %j', (value) => {
    expect(expectError(validateEnum('priority', value, options), 'validation').field).toBe(
      'priority',
    );
  });
});

describe('validateStringList', () => {
  it('trims entries', () => {
    expect(validateStringList('objectives', [' a ', 'b'])).toEqual({ ok: true, value: ['a', 'b'] });
  });

  it('accepts an empty list', () => {
    expect(validateStringList('objectives', [])).toEqual({ ok: true, value: [] });
  });

  it.each([
    ['not a list', 'a'],
    ['a blank entry', ['a', '  ']],
    ['a non-text entry', ['a', 3]],
    ['an over-long entry', ['x'.repeat(LIMITS.listItemLength + 1)]],
    ['too many entries', Array.from({ length: LIMITS.listItems + 1 }, () => 'x')],
  ])('rejects %s', (_label, value) => {
    expectError(validateStringList('objectives', value), 'validation');
  });
});

describe('validateDeadline', () => {
  it('accepts null and a real calendar day', () => {
    expect(validateDeadline(null)).toEqual({ ok: true, value: null });
    expect(validateDeadline('2026-12-31')).toEqual({ ok: true, value: '2026-12-31' });
    expect(validateDeadline('2028-02-29').ok).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', '31/12/2026', '2026-12-31T10:00:00Z', '', 20261231])(
    'rejects %j',
    (value) => {
      expect(expectError(validateDeadline(value), 'validation').field).toBe('deadline');
    },
  );
});

describe('validateFields', () => {
  it('validates only the fields that are present', () => {
    const result = validateFields(PROJECT_FIELD_VALIDATORS, {
      name: ' HQ ',
      priority: undefined,
    });
    expect(result).toEqual({ ok: true, value: { name: 'HQ' } });
  });

  it('drops properties that have no validator', () => {
    const input = { name: 'HQ', id: 'prj_evil', createdAt: 'never' };
    expect(validateFields(PROJECT_FIELD_VALIDATORS, input)).toEqual({
      ok: true,
      value: { name: 'HQ' },
    });
  });

  it('returns the first invalid field', () => {
    const result = validateFields(PROJECT_FIELD_VALIDATORS, { name: 'HQ', status: 'paused' });
    expect(expectError(result, 'validation').field).toBe('status');
  });
});
