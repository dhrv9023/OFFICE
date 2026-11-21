import { PRIORITY_RANK, type Priority, type ProjectStatus } from '@/domain/types';
import type { ProjectSummary } from '@/stores/selectors';

export const PROJECT_SORTS = {
  updated: 'Recently updated',
  created: 'Newest first',
  name: 'Name (A–Z)',
  deadline: 'Deadline (soonest)',
  progress: 'Progress (most done)',
  priority: 'Priority (highest)',
} as const;
export type ProjectSort = keyof typeof PROJECT_SORTS;

export interface ProjectFilters {
  readonly query: string;
  readonly status: ProjectStatus | 'all';
  readonly priority: Priority | 'all';
  readonly sort: ProjectSort;
}

export function readProjectFilters(params: URLSearchParams): ProjectFilters {
  const sort = params.get('sort');
  return {
    query: params.get('q') ?? '',
    status: (params.get('status') as ProjectStatus | null) ?? 'all',
    priority: (params.get('priority') as Priority | null) ?? 'all',
    sort: sort !== null && sort in PROJECT_SORTS ? (sort as ProjectSort) : 'updated',
  };
}

export function hasProjectFilters(filters: ProjectFilters): boolean {
  return filters.query.trim() !== '' || filters.status !== 'all' || filters.priority !== 'all';
}

const COMPARE: Record<ProjectSort, (a: ProjectSummary, b: ProjectSummary) => number> = {
  updated: (a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt),
  created: (a, b) => b.project.createdAt.localeCompare(a.project.createdAt),
  name: (a, b) => a.project.name.localeCompare(b.project.name),
  // Projects without a deadline go last.
  deadline: (a, b) =>
    (a.project.deadline ?? '9999-99-99').localeCompare(b.project.deadline ?? '9999-99-99'),
  progress: (a, b) => b.progress.percent - a.progress.percent,
  priority: (a, b) => PRIORITY_RANK[b.project.priority] - PRIORITY_RANK[a.project.priority],
};

/** View filtering and sorting for the projects list. Ties fall back to name. */
export function filterProjects(
  summaries: readonly ProjectSummary[],
  filters: ProjectFilters,
): ProjectSummary[] {
  const query = filters.query.trim().toLowerCase();
  return summaries
    .filter(({ project }) => filters.status === 'all' || project.status === filters.status)
    .filter(({ project }) => filters.priority === 'all' || project.priority === filters.priority)
    .filter(
      ({ project }) =>
        query === '' ||
        project.name.toLowerCase().includes(query) ||
        project.description.toLowerCase().includes(query),
    )
    .sort((a, b) => COMPARE[filters.sort](a, b) || a.project.name.localeCompare(b.project.name));
}
