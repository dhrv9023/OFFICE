import { CalendarDays, FilterX, FolderKanban, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ROUTES } from '@/app/navigation';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { EmptyState } from '@/components/EmptyState';
import { Input, Select } from '@/components/Field';
import { PriorityIcon } from '@/components/Marks';
import { Page } from '@/components/Page';
import { ProgressBar } from '@/components/ProgressBar';
import { StatusIndicator } from '@/components/StatusIndicator';
import { PRIORITIES, PROJECT_STATUSES } from '@/domain/types';
import { AvatarStack } from '@/features/common/AvatarStack';
import {
  formatDate,
  formatDeadline,
  PRIORITY,
  PROJECT_CATEGORY,
  PROJECT_STATUS,
  todayIso,
} from '@/features/common/presentation';
import { selectProjectSummaries, type ProjectSummary } from '@/stores/selectors';
import { useWorkspace } from '@/stores/workspace';
import { ProjectFormDialog } from './ProjectFormDialog';
import {
  filterProjects,
  hasProjectFilters,
  PROJECT_SORTS,
  readProjectFilters,
  type ProjectSort,
} from './projectFilters';

export function ProjectsPage() {
  const workspace = useWorkspace((state) => state);
  const summaries = useMemo(() => selectProjectSummaries(workspace), [workspace]);
  const [params, setParams] = useSearchParams();
  const filters = readProjectFilters(params);
  const visible = filterProjects(summaries, filters);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const setFilter = (key: string, value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === '' || value === 'all' || (key === 'sort' && value === 'updated')) {
          next.delete(key);
        } else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  const newProject = (
    <Button
      variant="primary"
      icon={Plus}
      onClick={() => {
        setCreating(true);
      }}
    >
      New project
    </Button>
  );

  return (
    <Page
      title="Projects"
      description="Everything your company is building, with live progress from each project's tasks."
      actions={summaries.length > 0 ? newProject : undefined}
    >
      {summaries.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="A project groups the work your departments do towards one goal. Start with your first one."
          action={newProject}
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2.5 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
            <div className="relative col-span-2 lg:col-span-1">
              <Search
                className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-subtle"
                aria-hidden="true"
              />
              <Input
                label="Search projects"
                hideLabel
                type="search"
                placeholder="Search projects…"
                className="pl-9"
                value={filters.query}
                onChange={(event) => {
                  setFilter('q', event.target.value);
                }}
              />
            </div>
            <Select
              label="Status"
              hideLabel
              value={filters.status}
              onChange={(event) => {
                setFilter('status', event.target.value);
              }}
              options={[
                { value: 'all', label: 'All statuses' },
                ...PROJECT_STATUSES.map((value) => ({
                  value,
                  label: PROJECT_STATUS[value].label,
                })),
              ]}
            />
            <Select
              label="Priority"
              hideLabel
              value={filters.priority}
              onChange={(event) => {
                setFilter('priority', event.target.value);
              }}
              options={[
                { value: 'all', label: 'All priorities' },
                ...PRIORITIES.map((value) => ({ value, label: PRIORITY[value].label })),
              ]}
            />
            <div className="col-span-2 lg:col-span-1">
              <Select
                label="Sort by"
                hideLabel
                value={filters.sort}
                onChange={(event) => {
                  setFilter('sort', event.target.value);
                }}
                options={(Object.keys(PROJECT_SORTS) as ProjectSort[]).map((value) => ({
                  value,
                  label: `Sort: ${PROJECT_SORTS[value]}`,
                }))}
              />
            </div>
            {hasProjectFilters(filters) ? (
              <Button
                variant="ghost"
                icon={FilterX}
                onClick={() => {
                  setParams(filters.sort === 'updated' ? {} : { sort: filters.sort }, {
                    replace: true,
                  });
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            {hasProjectFilters(filters)
              ? `Showing ${visible.length} of ${summaries.length} projects`
              : `${summaries.length} ${summaries.length === 1 ? 'project' : 'projects'}`}
          </p>
          {visible.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No projects match"
              description="Try a different search, or clear the filters."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((summary) => (
                <li key={summary.project.id}>
                  <ProjectCard summary={summary} departments={workspace.departments} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <ProjectFormDialog
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onSaved={(project) => {
          void navigate(`${ROUTES.projects}/${project.id}`);
        }}
      />
    </Page>
  );
}

function ProjectCard({
  summary,
  departments,
}: {
  summary: ProjectSummary;
  departments: Parameters<typeof AvatarStack>[0]['departments'];
}) {
  const { project, progress, assignees } = summary;
  const overdue =
    project.deadline !== null &&
    project.deadline < todayIso() &&
    project.status !== 'completed' &&
    project.status !== 'archived';

  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-line bg-card p-5 shadow-card transition-colors duration-150 hover:border-line-strong">
      <div className="flex items-center justify-between gap-3">
        <StatusIndicator
          variant="pill"
          tone={PROJECT_STATUS[project.status].tone}
          label={PROJECT_STATUS[project.status].label}
        />
        {project.deadline ? (
          <span
            className={cn(
              'flex items-center gap-1.5 text-xs',
              overdue ? 'font-medium text-danger' : 'text-muted',
            )}
          >
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {overdue ? 'Overdue · ' : ''}
            {formatDeadline(project.deadline)}
          </span>
        ) : null}
      </div>
      <h2 className="mt-4 min-w-0 text-lg font-semibold tracking-[-0.012em]">
        <Link
          to={`${ROUTES.projects}/${project.id}`}
          className="break-words transition-colors after:absolute after:inset-0 after:rounded-xl group-hover:text-accent-strong focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus"
        >
          {project.name}
        </Link>
      </h2>
      <p className="mt-1 line-clamp-2 text-sm text-muted">
        {project.description || 'No description yet.'}
      </p>

      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <PriorityIcon priority={project.priority} />
          {PRIORITY[project.priority].label} priority
        </span>
        <span aria-hidden="true" className="text-line-strong">
          /
        </span>
        <span>{PROJECT_CATEGORY[project.category]}</span>
      </p>

      <div aria-hidden="true" className="min-h-5 flex-1" />
      <div className="flex items-center gap-3">
        <ProgressBar
          value={progress.percent}
          label={`${project.name} progress`}
          valueText={`${String(progress.done)} of ${String(progress.counted)} tasks done`}
        />
        <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
          {progress.percent}%
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {progress.total === 0
          ? 'No tasks yet'
          : `${String(progress.done)} of ${String(progress.total)} ${progress.total === 1 ? 'task' : 'tasks'} completed`}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5">
        <AvatarStack people={assignees} departments={departments} />
        <span className="text-xs text-subtle">Created {formatDate(project.createdAt)}</span>
      </div>
    </article>
  );
}
