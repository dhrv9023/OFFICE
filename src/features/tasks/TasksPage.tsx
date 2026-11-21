import { FilterX, ListChecks, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ROUTES } from '@/app/navigation';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Input, Select } from '@/components/Field';
import { Page } from '@/components/Page';
import { cn } from '@/components/cn';
import { PRIORITIES, TASK_STATUSES } from '@/domain/types';
import { PRIORITY, TASK_STATUS, todayIso } from '@/features/common/presentation';
import { useWorkspace } from '@/stores/workspace';
import { KanbanBoard } from './KanbanBoard';
import { useTaskLink } from './taskLink';
import { TaskFormDialog } from './TaskFormDialog';
import {
  filterTasks,
  hasTaskFilters,
  NO_TASK_FILTERS,
  QUICK_VIEWS,
  readTaskFilters,
  type QuickView,
} from './taskFilters';

export function TasksPage() {
  const workspace = useWorkspace((state) => state);
  const [params, setParams] = useSearchParams();
  const filters = readTaskFilters(params);
  const { open } = useTaskLink();
  const [creating, setCreating] = useState(false);

  const all = useMemo(() => Object.values(workspace.tasks), [workspace]);
  const today = todayIso();
  const visible = filterTasks(all, filters, workspace.projects, today);
  const viewCount = (view: QuickView) =>
    filterTasks(
      all,
      { ...NO_TASK_FILTERS, ...readTaskFilters(new URLSearchParams(view.params)) },
      workspace.projects,
      today,
    ).length;
  const activeView = QUICK_VIEWS.find(
    (view) =>
      JSON.stringify(readTaskFilters(new URLSearchParams(view.params))) ===
        JSON.stringify({ ...filters, query: '' }) && filters.query === '',
  );
  const canCreate = Object.values(workspace.projects).some(
    (project) => project.status !== 'archived' && project.status !== 'completed',
  );

  const setFilter = (key: string, value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === '' || value === 'all') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  const newTask = (
    <Button
      variant="primary"
      icon={Plus}
      disabled={!canCreate}
      onClick={() => {
        setCreating(true);
      }}
    >
      New task
    </Button>
  );

  return (
    <Page
      title="Tasks"
      width="wide"
      description="Every piece of work across your projects. Drag a card, or use its menu, to move it through review to done."
      actions={newTask}
    >
      {all.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No tasks yet"
          description={
            canCreate
              ? 'Create the first task and assign it to someone in the right department.'
              : 'Tasks belong to projects. Create a project first, then add its tasks.'
          }
          action={
            canCreate ? (
              newTask
            ) : (
              <Link
                to={ROUTES.projects}
                className="text-sm font-medium text-accent-strong hover:underline"
              >
                Go to projects
              </Link>
            )
          }
        />
      ) : (
        <>
          <div
            role="group"
            aria-label="Quick views"
            className="mb-4 flex flex-wrap items-center gap-2"
          >
            {QUICK_VIEWS.map((view) => {
              const active = activeView?.id === view.id;
              const count = viewCount(view);
              return (
                <button
                  key={view.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setParams(active ? {} : { ...view.params }, { replace: true });
                  }}
                  className={cn(
                    'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors',
                    active
                      ? 'border-accent bg-accent-soft font-medium text-content'
                      : 'border-line text-muted hover:border-line-strong hover:text-content',
                  )}
                >
                  {view.label}
                  <span className="text-xs tabular-nums text-subtle">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="mb-5 flex flex-wrap items-end gap-2.5 [&>*]:min-w-0 [&>*]:basis-[calc(50%-0.3125rem)] sm:[&>*]:basis-[11rem]">
            <div className="relative !basis-full sm:!basis-[16rem] sm:grow">
              <Search
                className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-subtle"
                aria-hidden="true"
              />
              <Input
                label="Search tasks"
                hideLabel
                type="search"
                placeholder="Search tasks…"
                className="pl-9"
                value={filters.query}
                onChange={(event) => {
                  setFilter('q', event.target.value);
                }}
              />
            </div>
            <Select
              label="Project"
              hideLabel
              value={filters.projectId}
              onChange={(event) => {
                setFilter('project', event.target.value);
              }}
              options={[
                { value: 'all', label: 'All projects' },
                ...Object.values(workspace.projects)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((project) => ({ value: project.id, label: project.name })),
              ]}
            />
            <Select
              label="Department"
              hideLabel
              value={filters.departmentId}
              onChange={(event) => {
                setFilter('department', event.target.value);
              }}
              options={[
                { value: 'all', label: 'All departments' },
                ...Object.values(workspace.departments).map((department) => ({
                  value: department.id,
                  label: department.name,
                })),
              ]}
            />
            <Select
              label="Assignee"
              hideLabel
              value={filters.assignee}
              onChange={(event) => {
                setFilter('assignee', event.target.value);
              }}
              options={[
                { value: 'all', label: 'Anyone' },
                { value: 'unassigned', label: 'Unassigned' },
                ...Object.values(workspace.employees).map((employee) => ({
                  value: employee.id,
                  label: employee.name,
                })),
              ]}
            />
            <Select
              label="Status"
              hideLabel
              value={filters.status}
              onChange={(event) => {
                setFilter('status', event.target.value);
              }}
              options={[
                { value: 'all', label: 'Any status' },
                { value: 'open', label: 'Open work' },
                ...TASK_STATUSES.map((status) => ({
                  value: status,
                  label: TASK_STATUS[status].label,
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
                { value: 'all', label: 'Any priority' },
                ...PRIORITIES.map((priority) => ({
                  value: priority,
                  label: PRIORITY[priority].label,
                })),
              ]}
            />
            <Select
              label="Deadline"
              hideLabel
              value={filters.due}
              onChange={(event) => {
                setFilter('due', event.target.value);
              }}
              options={[
                { value: 'all', label: 'Any deadline' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'week', label: 'Due within 7 days' },
                { value: 'none', label: 'No deadline' },
              ]}
            />
            {hasTaskFilters(filters) ? (
              <Button
                variant="ghost"
                icon={FilterX}
                onClick={() => {
                  setParams({}, { replace: true });
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            {hasTaskFilters(filters)
              ? `Showing ${visible.length} of ${all.length} tasks`
              : `${all.length} ${all.length === 1 ? 'task' : 'tasks'}`}
          </p>
          <KanbanBoard tasks={visible} onOpenTask={open} />
        </>
      )}
      <TaskFormDialog
        open={creating}
        projectId={filters.projectId === 'all' ? undefined : filters.projectId}
        onClose={() => {
          setCreating(false);
        }}
      />
    </Page>
  );
}
