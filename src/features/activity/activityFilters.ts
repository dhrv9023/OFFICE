import type { EmployeeId, ProjectId } from '@/domain/ids';
import type { ActivityEvent, WorkspaceState } from '@/domain/types';

export const ACTIVITY_KINDS = ['task', 'project', 'employee', 'meeting'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_KIND_LABELS: Readonly<Record<ActivityKind, string>> = {
  task: 'Tasks',
  project: 'Projects',
  employee: 'People',
  meeting: 'Meetings',
};

export interface ActivityFilters {
  readonly kind: ActivityKind | 'all';
  /** Events about this person: their own, or meetings they were part of. */
  readonly employeeId: EmployeeId | 'all';
  readonly projectId: ProjectId | 'all';
}

export const NO_ACTIVITY_FILTERS: ActivityFilters = {
  kind: 'all',
  employeeId: 'all',
  projectId: 'all',
};

/** The kind of an event, from its type (`task.assigned` → task). */
export function activityKind(event: ActivityEvent): ActivityKind {
  return event.eventType.split('.')[0] as ActivityKind;
}

export function readActivityFilters(params: URLSearchParams): ActivityFilters {
  const kind = params.get('kind');
  return {
    kind: ACTIVITY_KINDS.find((option) => option === kind) ?? 'all',
    employeeId: (params.get('employee') as EmployeeId | null) ?? 'all',
    projectId: (params.get('project') as ProjectId | null) ?? 'all',
  };
}

/**
 * Filters the history without changing it. Matching uses the references stored on
 * each event (and, for meetings, who was invited), so renaming someone never
 * hides or rewrites their past.
 */
export function filterActivity(
  events: readonly ActivityEvent[],
  filters: ActivityFilters,
  meetings: WorkspaceState['meetings'],
): ActivityEvent[] {
  return events.filter((event) => {
    if (filters.kind !== 'all' && activityKind(event) !== filters.kind) return false;
    if (filters.projectId !== 'all' && event.projectId !== filters.projectId) return false;
    if (filters.employeeId !== 'all') {
      const invited =
        event.meetingId !== null &&
        (meetings[event.meetingId]?.participantIds.includes(filters.employeeId) ?? false);
      if (event.employeeId !== filters.employeeId && !invited) return false;
    }
    return true;
  });
}
