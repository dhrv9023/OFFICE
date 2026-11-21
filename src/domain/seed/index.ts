import { defaultAccessProfile } from '../rules/access';
import { defaultAgentConfig } from '../rules/agentConfig';
import { buildWorkspace } from '../rules/workspaceIntegrity';
import type { WorkspaceState } from '../types/workspace';
import { SEED_DEPARTMENTS } from './departments';
import { SEED_EMPLOYEES, SEED_TIMESTAMP } from './employees';
import { OFFICE_LAYOUT } from './officeLayout';

export { SEED_DEPARTMENTS } from './departments';
export { SEED_EMPLOYEES, SEED_TIMESTAMP } from './employees';
export { OFFICE_LAYOUT } from './officeLayout';

/**
 * A brand-new company: five departments, five employees, no projects or tasks.
 * Deterministic — every call returns an equal value. Goes through the same
 * integrity gate as any other data entering the workspace.
 */
export function createSeedWorkspace(): WorkspaceState {
  const result = buildWorkspace(
    {
      departments: SEED_DEPARTMENTS,
      employees: SEED_EMPLOYEES,
      projects: [],
      tasks: [],
      meetings: [],
      activity: [],
      notifications: [],
      // Every AI employee starts disabled, with role-based default grants.
      accessProfiles: SEED_EMPLOYEES.map((employee) =>
        defaultAccessProfile(employee, SEED_TIMESTAMP),
      ),
      approvals: [],
      executions: [],
      agentConfigs: SEED_EMPLOYEES.map((employee) => defaultAgentConfig(employee, SEED_TIMESTAMP)),
      messages: [],
    },
    OFFICE_LAYOUT,
  );
  if (!result.ok) {
    const details = result.error.map((error) => error.message).join(' ');
    throw new Error(`Seed data is inconsistent: ${details}`);
  }
  return result.value;
}
