import { describe, expect, it } from 'vitest';
import { roomAt } from '../rules/officeLayout';
import { validateWorkspace } from '../rules/workspaceIntegrity';
import {
  createSeedWorkspace,
  OFFICE_LAYOUT,
  SEED_DEPARTMENTS,
  SEED_EMPLOYEES,
  SEED_TIMESTAMP,
} from './index';

describe('seed company', () => {
  it('has the five Phase 1 departments', () => {
    expect(SEED_DEPARTMENTS.map((department) => department.name)).toEqual([
      'Management',
      'UI/UX Design',
      'Frontend Development',
      'Backend Development',
      'Quality Assurance',
    ]);
  });

  it('has the five employees in their roles and departments', () => {
    expect(
      SEED_EMPLOYEES.map(({ name, role, departmentId }) => [name, role, departmentId]),
    ).toEqual([
      ['Alex Morgan', 'Project Manager', 'dept_management'],
      ['Sarah Chen', 'UI/UX Designer', 'dept_design'],
      ['Ryan Miller', 'Frontend Developer', 'dept_frontend'],
      ['Daniel Kim', 'Backend Developer', 'dept_backend'],
      ['Emma Wilson', 'QA Engineer', 'dept_qa'],
    ]);
  });

  it('gives every employee skills, a description, an avatar and a unique desk', () => {
    for (const employee of SEED_EMPLOYEES) {
      expect(employee.skills.length).toBeGreaterThan(0);
      expect(employee.description.length).toBeGreaterThan(0);
      expect(employee.avatarId).toMatch(/^avatar_/);
      expect(employee.currentTaskId).toBeNull();
      expect(employee.createdAt).toBe(SEED_TIMESTAMP);
    }
    expect(new Set(SEED_EMPLOYEES.map((employee) => employee.deskId)).size).toBe(5);
    expect(new Set(SEED_EMPLOYEES.map((employee) => employee.avatarId)).size).toBe(5);
  });

  it('seats every employee inside their own department room', () => {
    for (const employee of SEED_EMPLOYEES) {
      const desk = OFFICE_LAYOUT.desks.find((candidate) => candidate.id === employee.deskId);
      if (!desk) throw new Error(`${employee.name} has no desk`);
      expect(roomAt(OFFICE_LAYOUT, desk.seat)?.departmentId).toBe(employee.departmentId);
    }
  });

  it('uses valid department colours', () => {
    for (const department of SEED_DEPARTMENTS) expect(department.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('seed office layout', () => {
  it('contains all nine rooms plus the corridor', () => {
    expect(OFFICE_LAYOUT.rooms.map((room) => room.name).sort()).toEqual(
      [
        'Backend Development',
        'Break Room',
        'Corridor',
        'Frontend Development',
        'Lounge',
        'Management',
        'Meeting Room',
        'Quality Assurance',
        'Reception',
        'UI/UX Design',
      ].sort(),
    );
  });

  it('tiles the whole office with no gaps', () => {
    const area = OFFICE_LAYOUT.rooms.reduce(
      (sum, room) => sum + room.bounds.cols * room.bounds.rows,
      0,
    );
    expect(area).toBe(OFFICE_LAYOUT.size.cols * OFFICE_LAYOUT.size.rows);
  });

  it('connects every room to the corridor', () => {
    const connected = new Set(OFFICE_LAYOUT.doors.map((door) => door.roomId));
    for (const room of OFFICE_LAYOUT.rooms) {
      if (room.kind !== 'corridor') expect(connected.has(room.id)).toBe(true);
    }
    for (const door of OFFICE_LAYOUT.doors) expect(door.connectsTo).toBe('room_corridor');
  });
});

describe('createSeedWorkspace', () => {
  it('is deterministic', () => {
    expect(createSeedWorkspace()).toEqual(createSeedWorkspace());
    expect(JSON.stringify(createSeedWorkspace())).toBe(JSON.stringify(createSeedWorkspace()));
  });

  it('starts with the company and no work', () => {
    const state = createSeedWorkspace();
    expect(Object.keys(state.departments)).toHaveLength(5);
    expect(Object.keys(state.employees)).toHaveLength(5);
    expect(state.projects).toEqual({});
    expect(state.tasks).toEqual({});
    expect(state.activity).toEqual([]);
    expect(state.notifications).toEqual([]);
  });

  it('satisfies every workspace invariant', () => {
    expect(validateWorkspace(createSeedWorkspace(), OFFICE_LAYOUT)).toEqual([]);
  });
});
