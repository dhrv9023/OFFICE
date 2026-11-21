import { describe, expect, it } from 'vitest';
import { addDays, isDueWithin, isOverdue } from './deadlines';

const task = (
  deadline: string | null,
  status: 'todo' | 'done' | 'cancelled' | 'blocked' = 'todo',
) => ({
  deadline,
  status,
});

describe('deadlines', () => {
  it('adds calendar days across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is overdue only after the day has passed and while work is open', () => {
    expect(isOverdue(task('2026-12-01'), '2026-12-02')).toBe(true);
    expect(isOverdue(task('2026-12-02'), '2026-12-02')).toBe(false);
    expect(isOverdue(task('2026-12-01', 'blocked'), '2026-12-02')).toBe(true);
    expect(isOverdue(task('2026-12-01', 'done'), '2026-12-02')).toBe(false);
    expect(isOverdue(task('2026-12-01', 'cancelled'), '2026-12-02')).toBe(false);
    expect(isOverdue(task(null), '2026-12-02')).toBe(false);
  });

  it('finds open work due within a window that includes today', () => {
    expect(isDueWithin(task('2026-12-02'), '2026-12-02', 7)).toBe(true);
    expect(isDueWithin(task('2026-12-09'), '2026-12-02', 7)).toBe(true);
    expect(isDueWithin(task('2026-12-10'), '2026-12-02', 7)).toBe(false);
    expect(isDueWithin(task('2026-12-01'), '2026-12-02', 7)).toBe(false);
    expect(isDueWithin(task('2026-12-03', 'done'), '2026-12-02', 7)).toBe(false);
  });
});
