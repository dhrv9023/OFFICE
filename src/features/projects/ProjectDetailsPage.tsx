import { Archive, CalendarDays, CheckCircle2, FolderX, Link2, Plus } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ROUTES } from '@/app/navigation';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { cn } from '@/components/cn';
import { EmptyState } from '@/components/EmptyState';
import { DepartmentMark, PriorityIcon } from '@/components/Marks';
import { Page, Section } from '@/components/Page';
import { ProgressBar } from '@/components/ProgressBar';
import { StatusIndicator } from '@/components/StatusIndicator';
import { RelativeTime } from '@/components/time';
import type { ProjectId } from '@/domain/ids';
import { unresolvedDependencies } from '@/domain/rules/dependencies';
import { deriveEmployeeStatus } from '@/domain/rules/employeeStatus';
import { TASK_STATUSES, type TaskStatus, type WorkspaceState } from '@/domain/types';
import { ActorAvatar } from '@/features/common/ActorAvatar';
import { actorName } from '@/features/common/actors';
import {
  formatDate,
  formatDeadline,
  PRIORITY,
  PROJECT_CATEGORY,
  PROJECT_STATUS,
  TASK_STATUS,
  WORK_STATUS,
} from '@/features/common/presentation';
import { TaskFormDialog } from '@/features/tasks/TaskFormDialog';
import { useTaskLink } from '@/features/tasks/taskLink';
import { TaskStatusMenu } from '@/features/tasks/TaskStatusMenu';
import {
  selectProjectActivity,
  selectProjectSummaries,
  selectTasksByProject,
} from '@/stores/selectors';
import { useWorkspace } from '@/stores/workspace';
import { ProjectActions } from './ProjectActions';

const RECENT_ACTIVITY = 8;

export function ProjectDetailsPage() {
  const { projectId } = useParams();
  const workspace = useWorkspace((state) => state);
  const view = useMemo(
    () => (projectId ? buildView(workspace, projectId as ProjectId) : null),
    [workspace, projectId],
  );
  const [addingTask, setAddingTask] = useState(false);
  const { open } = useTaskLink();

  if (!view) {
    return (
      <Page title="Project not found" hideTitle>
        <EmptyState
          icon={FolderX}
          title="This project doesn't exist"
          description="It may have been deleted, or the link is out of date."
          action={
            <Link
              to={ROUTES.projects}
              className="text-sm font-medium text-accent-strong hover:underline"
            >
              Back to projects
            </Link>
          }
        />
      </Page>
    );
  }

  const { project, progress, assignees, departments, tasks, activity } = view;
  const canAddTasks = project.status !== 'archived' && project.status !== 'completed';
  const statusCounts = TASK_STATUSES.map((status) => ({
    status,
    count: tasks.filter((task) => task.status === status).length,
  }));

  return (
    <Page
      title={project.name}
      eyebrow={
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          <StatusIndicator
            variant="pill"
            tone={PROJECT_STATUS[project.status].tone}
            label={PROJECT_STATUS[project.status].label}
          />
          <span className="flex items-center gap-1.5">
            <PriorityIcon priority={project.priority} />
            {PRIORITY[project.priority].label} priority
          </span>
          <span>{PROJECT_CATEGORY[project.category]}</span>
          {project.deadline ? (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {formatDeadline(project.deadline)}
            </span>
          ) : null}
        </p>
      }
      description={
        <>
          <span className="block whitespace-pre-wrap">
            {project.description || 'No description yet.'}
          </span>
          <span className="mt-2 block text-xs text-subtle">
            Created {formatDate(project.createdAt)} · updated{' '}
            <RelativeTime iso={project.updatedAt} />
          </span>
        </>
      }
      actions={<ProjectActions project={project} />}
    >
      <div className="flex flex-col gap-8">
        {project.status === 'archived' ? (
          <Notice icon={Archive}>
            This project is archived and read-only. Restore it to plan, assign or move its tasks.
          </Notice>
        ) : null}
        {project.status === 'completed' ? (
          <Notice icon={CheckCircle2}>
            This project is completed. Reopen it to add more work.
          </Notice>
        ) : null}

        <div className="grid grid-cols-1 gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="flex min-w-0 flex-col gap-12">
            <Section
              id="project-tasks"
              title="Tasks"
              meta={`${String(tasks.length)} ${tasks.length === 1 ? 'task' : 'tasks'}`}
              action={
                <Button
                  size="sm"
                  icon={Plus}
                  disabled={!canAddTasks}
                  onClick={() => {
                    setAddingTask(true);
                  }}
                >
                  Add task
                </Button>
              }
            >
              <Card>
                {tasks.length === 0 ? (
                  <EmptyState
                    compact
                    headingLevel={3}
                    icon={Plus}
                    title="No tasks yet"
                    description={
                      canAddTasks
                        ? 'Break the project into tasks and give each to the right department.'
                        : 'This project cannot take new tasks right now.'
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {tasks.map((task) => {
                      const assignee = task.assigneeId
                        ? workspace.employees[task.assigneeId]
                        : undefined;
                      const department = workspace.departments[task.departmentId];
                      const waiting = unresolvedDependencies(task, workspace.tasks).length;
                      return (
                        <li key={task.id} className="flex items-center gap-3.5 px-4 py-3">
                          {assignee ? (
                            <Avatar
                              avatarId={assignee.avatarId}
                              color={department?.color}
                              size="md"
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="size-8 shrink-0 rounded-md border border-dashed border-line-strong"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => {
                                open(task.id);
                              }}
                              className={cn(
                                'block max-w-full truncate rounded-sm text-left text-sm font-medium transition-colors hover:text-accent-strong',
                                task.status === 'cancelled' && 'text-muted line-through',
                              )}
                            >
                              {task.title}
                            </button>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
                              <span>{assignee ? assignee.name : 'Unassigned'}</span>
                              <span className="flex items-center gap-1.5">
                                {department ? <DepartmentMark color={department.color} /> : null}
                                {department?.name}
                              </span>
                              <span className="flex items-center gap-1">
                                <PriorityIcon priority={task.priority} className="size-3" />
                                {PRIORITY[task.priority].label}
                              </span>
                              {waiting > 0 ? (
                                <span className="inline-flex items-center gap-1 text-warning">
                                  <Link2 className="size-3" aria-hidden="true" />
                                  Waiting on {waiting}
                                </span>
                              ) : null}
                            </p>
                          </div>
                          <TaskStatusMenu task={task} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </Section>

            <Section id="project-activity" title="Recent activity">
              {activity.length === 0 ? (
                <p className="text-sm text-muted">No activity yet.</p>
              ) : (
                <ol className="relative flex flex-col gap-5 before:absolute before:top-3 before:bottom-3 before:left-3 before:w-px before:bg-line">
                  {activity.map((event) => (
                    <li key={event.id} className="relative flex items-start gap-3">
                      <span className="relative flex rounded-md ring-4 ring-surface">
                        <ActorAvatar actorId={event.actorId} workspace={workspace} size="sm" />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-sm">{event.description}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {actorName(event.actorId, workspace)} ·{' '}
                          <RelativeTime iso={event.timestamp} />
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>

          <aside aria-label="Project summary" className="min-w-0">
            <Card className="divide-y divide-line">
              <RailBlock id="project-progress" title="Progress">
                <p className="text-3xl font-semibold tracking-[-0.022em] tabular-nums">
                  {progress.percent}%
                </p>
                <ProgressBar
                  className="mt-3"
                  value={progress.percent}
                  label={`${project.name} progress`}
                  valueText={`${String(progress.done)} of ${String(progress.counted)} tasks done`}
                />
                <p className="mt-2 text-xs text-muted">
                  {progress.counted === 0
                    ? 'No tasks count towards progress yet.'
                    : `${String(progress.done)} of ${String(progress.counted)} tasks done${progress.cancelled > 0 ? ` (${String(progress.cancelled)} cancelled not counted)` : ''}`}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
                  {statusCounts.map(({ status, count }) => (
                    <div key={status} className="flex items-baseline justify-between gap-2">
                      <dt className="flex items-center gap-2 text-xs text-muted">
                        <span
                          aria-hidden="true"
                          className={cn('size-1.5 rounded-full', STATUS_DOT[status])}
                        />
                        {TASK_STATUS[status].label}
                      </dt>
                      <dd className="text-sm font-medium tabular-nums">{count}</dd>
                    </div>
                  ))}
                </dl>
              </RailBlock>

              <RailBlock id="project-team" title="Team" meta="Everyone with a task here">
                {assignees.length === 0 ? (
                  <p className="text-sm text-muted">Nobody is assigned yet.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {assignees.map((employee) => {
                      const status = deriveEmployeeStatus(
                        employee.id,
                        Object.values(workspace.tasks),
                      );
                      const own = tasks.filter((task) => task.assigneeId === employee.id).length;
                      return (
                        <li key={employee.id} className="flex items-center gap-3">
                          <Avatar
                            avatarId={employee.avatarId}
                            color={workspace.departments[employee.departmentId]?.color}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{employee.name}</p>
                            <p className="truncate text-xs text-muted">
                              {own} {own === 1 ? 'task' : 'tasks'} here
                            </p>
                          </div>
                          <StatusIndicator
                            tone={WORK_STATUS[status].tone}
                            label={WORK_STATUS[status].label}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </RailBlock>

              <RailBlock id="project-departments" title="Departments involved">
                {departments.length === 0 ? (
                  <p className="text-sm text-muted">No department has work here yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {departments.map((department) => {
                      const own = tasks.filter((task) => task.departmentId === department.id);
                      const done = own.filter((task) => task.status === 'done').length;
                      return (
                        <li key={department.id} className="flex items-center gap-2.5 text-sm">
                          <DepartmentMark color={department.color} />
                          <span className="min-w-0 flex-1 truncate">{department.name}</span>
                          <span className="text-xs text-muted tabular-nums">
                            {done}/{own.length} done
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </RailBlock>

              <ListBlock id="project-objectives" title="Objectives" items={project.objectives} />
              <ListBlock
                id="project-requirements"
                title="Requirements"
                items={project.requirements}
              />
            </Card>
          </aside>
        </div>
      </div>

      <TaskFormDialog
        open={addingTask}
        projectId={project.id}
        onClose={() => {
          setAddingTask(false);
        }}
      />
    </Page>
  );
}

function buildView(workspace: WorkspaceState, projectId: ProjectId) {
  const summary = selectProjectSummaries(workspace).find((item) => item.project.id === projectId);
  if (!summary) return null;
  return {
    ...summary,
    tasks: selectTasksByProject(workspace, projectId),
    activity: selectProjectActivity(workspace, projectId, RECENT_ACTIVITY),
  };
}

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: 'bg-line-strong',
  in_progress: 'bg-accent',
  in_review: 'bg-secondary',
  blocked: 'bg-danger',
  done: 'bg-success',
  cancelled: 'bg-subtle',
};

function RailBlock({
  id,
  title,
  meta,
  children,
}: {
  id: string;
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="px-5 py-5">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      {meta ? <p className="text-xs text-muted">{meta}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Notice({ icon: Icon, children }: { icon: typeof Archive; children: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg bg-secondary-soft px-4 py-3 text-sm"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden="true" />
      {children}
    </div>
  );
}

function ListBlock({ id, title, items }: { id: string; title: string; items: readonly string[] }) {
  return (
    <RailBlock id={id} title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-muted">None listed.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {items.map((item, index) => (
            <li key={`${String(index)}-${item}`} className="flex gap-2.5">
              <span aria-hidden="true" className="mt-[8px] size-1 shrink-0 rounded-full bg-muted" />
              <span className="min-w-0 break-words">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </RailBlock>
  );
}
