import { describe, expect, it } from 'vitest';
import { createSequentialIdGenerator } from './ids';

describe('createSequentialIdGenerator', () => {
  it('produces prefixed IDs with one counter per kind', () => {
    const ids = createSequentialIdGenerator();
    expect(ids.next('task')).toBe('task_0001');
    expect(ids.next('task')).toBe('task_0002');
    expect(ids.next('project')).toBe('prj_0001');
    expect(ids.next('notification')).toBe('ntf_0001');
  });

  it('is reproducible across instances', () => {
    const run = () => {
      const ids = createSequentialIdGenerator();
      return [ids.next('activity'), ids.next('activity'), ids.next('employee')];
    };
    expect(run()).toEqual(run());
  });
});
