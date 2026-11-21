import { describe, expect, it } from 'vitest';
import { lookSeed } from '@/art/characters';
import { employeePortrait } from '@/art/portrait';
import { SEED_EMPLOYEES, SEED_DEPARTMENTS } from '@/domain/seed';

/*
 * Phase 1.6 moved the appearance seed from the (now renamable) display name to the
 * stable avatar key. These tests pin that every existing character is unchanged.
 */
describe('seed characters keep their approved looks', () => {
  it.each(SEED_EMPLOYEES.map((employee) => [employee.name, employee] as const))(
    '%s is drawn from the same seed as before',
    (name, employee) => {
      // The look hash is unchanged and now runs over lookSeed(avatarId) instead of
      // the name; equal seeds mean pixel-identical characters.
      expect(lookSeed(employee.avatarId)).toBe(name);
      const color = SEED_DEPARTMENTS.find((dept) => dept.id === employee.departmentId)?.color ?? '';
      expect(employeePortrait(employee.avatarId, color, 'head').layers.length).toBeGreaterThan(0);
    },
  );
});
