import { describe, expect, it } from 'vitest';
import { makeTask } from '../../test/factories';
import { SEED_EMPLOYEES } from '../seed';
import { contentVersion, defaultGrants, validateGrants } from './access';

describe('target versions', () => {
  it('change with any edit, even within the same millisecond', () => {
    const task = makeTask({ title: 'Moodboard' });
    const renamed = { ...task, title: 'Moodboard v2' }; // same updatedAt
    expect(contentVersion(renamed)).not.toBe(contentVersion(task));
    expect(contentVersion({ ...task })).toBe(contentVersion(task));
  });
});

describe('default profiles', () => {
  it('grant only valid, grantable permissions to every seed role', () => {
    for (const employee of SEED_EMPLOYEES) {
      const grants = defaultGrants(employee);
      expect(validateGrants(grants).ok).toBe(true);
      const names = grants.map((grant) => grant.permission);
      expect(names).not.toContain('project.delete');
      expect(names).not.toContain('task.delete');
      expect(names).not.toContain('employee.rename');
    }
  });

  it('give the project manager organising powers and specialists their own work', () => {
    const [manager, designer] = SEED_EMPLOYEES;
    expect(
      defaultGrants(manager ?? { departmentId: 'dept_management' }).find(
        (g) => g.permission === 'task.assign',
      )?.scope,
    ).toBe('any');
    expect(
      defaultGrants(designer ?? { departmentId: 'dept_design' }).find(
        (g) => g.permission === 'task.change_status',
      )?.scope,
    ).toBe('own');
  });
});
