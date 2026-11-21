import { openTasks } from '../rules/projectTransitions';
import type { WorkspaceRecords } from '../rules/workspaceIntegrity';
import type { ProjectId } from '../ids';

export interface RepairChange {
  readonly projectId: ProjectId;
  /** One sentence for the user, e.g. `Reopen "Website" (completed, 2 open tasks) as active.` */
  readonly description: string;
}

/**
 * The only repair offered for data that predates the current rules, and only when
 * the user asks for it: a project marked completed that still has open tasks is
 * reopened as active. That is the domain's own "reopen" transition
 * (completed → active), it loses nothing (every task, its status and its history
 * stay as they are), and it is deterministic. Nothing else is ever changed.
 */
export function repairRecords(
  records: WorkspaceRecords,
  now: string,
): { records: WorkspaceRecords; changes: RepairChange[] } {
  const changes: RepairChange[] = [];
  const projects = records.projects.map((project) => {
    if (project.status !== 'completed') return project;
    const open = openTasks(records.tasks.filter((task) => task.projectId === project.id));
    if (open.length === 0) return project;
    changes.push({
      projectId: project.id,
      description: `Reopen "${project.name}" as active (it is marked completed but has ${open.length} open task${open.length === 1 ? '' : 's'}).`,
    });
    return { ...project, status: 'active' as const, updatedAt: now };
  });
  return { records: { ...records, projects }, changes };
}
