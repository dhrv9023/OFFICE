import type { WorkspaceState } from '@/domain/types';

const LABELS: Record<string, string> = {
  taskId: 'Task',
  projectId: 'Project',
  meetingId: 'Meeting',
  employeeId: 'Employee',
  assigneeId: 'Assignee',
  departmentId: 'Department',
  participantIds: 'Participants',
  allowCrossDepartment: 'Across departments',
  status: 'Status',
  title: 'Title',
  name: 'Name',
  description: 'Description',
  agenda: 'Agenda',
  priority: 'Priority',
  deadline: 'Deadline',
  startsAt: 'Starts',
  durationMinutes: 'Duration (minutes)',
  reason: 'Reason',
  notes: 'Notes',
  dependencies: 'Depends on',
};

/** A readable name for an ID, as it is now (or the ID itself if it is gone). */
function nameOf(value: string, workspace: WorkspaceState): string {
  if (value.startsWith('task_'))
    return workspace.tasks[value as keyof WorkspaceState['tasks']]?.title ?? value;
  if (value.startsWith('prj_'))
    return workspace.projects[value as keyof WorkspaceState['projects']]?.name ?? value;
  if (value.startsWith('emp_'))
    return workspace.employees[value as keyof WorkspaceState['employees']]?.name ?? value;
  if (value.startsWith('mtg_'))
    return workspace.meetings[value as keyof WorkspaceState['meetings']]?.title ?? value;
  if (value.startsWith('dept_')) {
    return workspace.departments[value as keyof WorkspaceState['departments']]?.name ?? value;
  }
  return value;
}

function show(value: unknown, workspace: WorkspaceState): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') return nameOf(value, workspace);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => show(item, workspace)).join(', ') || 'None';
  return JSON.stringify(value);
}

/**
 * The proposed change as label/value lines the founder can review: IDs become
 * names, a `patch` is listed field by field. Shows what was requested — not a
 * prediction of the outcome.
 */
export function describeInput(
  input: unknown,
  workspace: WorkspaceState,
): { label: string; value: string }[] {
  if (typeof input !== 'object' || input === null) return [];
  const lines: { label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === 'patch' && typeof value === 'object' && value !== null) {
      for (const [field, change] of Object.entries(value as Record<string, unknown>)) {
        lines.push({
          label: `New ${(LABELS[field] ?? field).toLowerCase()}`,
          value: show(change, workspace),
        });
      }
      continue;
    }
    lines.push({ label: LABELS[key] ?? key, value: show(value, workspace) });
  }
  return lines;
}
