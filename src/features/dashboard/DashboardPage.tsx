import { ArrowRight, BellOff, Building2, FolderOpen, History } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ROUTES } from '@/app/navigation';
import { Avatar } from '@/components/Avatar';
import { buttonClasses } from '@/components/buttonStyles';
import { Card } from '@/components/Card';
import { cn } from '@/components/cn';
import { EmptyState } from '@/components/EmptyState';
import { DepartmentMark, PriorityIcon } from '@/components/Marks';
import { Page, Section } from '@/components/Page';
import { ProgressBar } from '@/components/ProgressBar';
import { StatusIndicator } from '@/components/StatusIndicator';
import { RelativeTime } from '@/components/time';
import type { WorkspaceState } from '@/domain/types';
import { ActorAvatar } from '@/features/common/ActorAvatar';
import { actorName } from '@/features/common/actors';
import {
  formatDeadline,
  NOTIFICATION_ICONS,
  PRIORITY,
  PROJECT_STATUS,
  todayIso,
  WORK_STATUS,
} from '@/features/common/presentation';
import {
  selectCurrentProjects,
  selectDashboardMetrics,
  selectDepartmentOverview,
  selectEmployeeSummaries,
  selectNotifications,
  selectRecentActivity,
} from '@/stores/selectors';
import { tasksUrl } from '@/features/tasks/taskFilters';
import { useWorkspace } from '@/stores/workspace';

const RECENT_ACTIVITY = 6;
const RECENT_NOTIFICATIONS = 5;
const CURRENT_PROJECTS = 5;

/** Live overview of the company. Every figure is derived from the workspace state. */
export function DashboardPage() {
  // One subscription to the immutable state; derived views recompute only when it changes.
  const workspace = useWorkspace((state) => state);
  const view = useMemo(() => buildView(workspace), [workspace]);
  const { metrics } = view;
  const counted = metrics.tasks - metrics.tasksCancelled;

  return (
    <Page
      title="Dashboard"
      description={summary(view)}
      actions={
        <Link to={ROUTES.office} className={buttonClasses('secondary')}>
          <Building2 aria-hidden="true" />
          Visit the office
        </Link>
      }
    >
      <div className="flex flex-col gap-12">
        <section aria-labelledby="metrics-title">
          <h2 id="metrics-title" className="sr-only">
            Company at a glance
          </h2>
          <Card className="overflow-hidden">
            {/* Ten cells: what the company is doing, then what needs attention. Every
                figure with a matching view links to it. */}
            <dl className="grid grid-cols-2 gap-px bg-line lg:grid-cols-5">
              <Metric
                label="Working"
                value={metrics.peopleWorking}
                tone="accent"
                hint={`of ${String(metrics.employees)} people`}
                to={ROUTES.employees}
              />
              <Metric
                label="Available"
                value={metrics.peopleAvailable}
                hint={
                  metrics.peopleAvailable === 1
                    ? 'person with no open work'
                    : 'people with no open work'
                }
                to={ROUTES.employees}
              />
              <Metric
                label="Active projects"
                value={metrics.activeProjects}
                tone="accent"
                hint={`of ${String(metrics.projects)} projects`}
                to={ROUTES.projects}
              />
              <Metric
                label="In progress"
                value={metrics.tasksInProgress}
                tone="accent"
                hint={
                  metrics.tasksInProgress === 1 ? 'task being worked on' : 'tasks being worked on'
                }
                to={tasksUrl(ROUTES.tasks, { status: 'in_progress' })}
              />
              <Metric
                label="Completed"
                value={metrics.tasksDone}
                tone="success"
                hint={counted > 0 ? `of ${String(counted)} tasks` : 'No tasks yet'}
                to={tasksUrl(ROUTES.tasks, { status: 'done' })}
              />
              <Metric
                label="Awaiting review"
                value={metrics.tasksInReview}
                tone="secondary"
                hint={metrics.tasksInReview > 0 ? 'Ready for sign-off' : 'Review queue empty'}
                to={tasksUrl(ROUTES.tasks, { status: 'in_review' })}
              />
              <Metric
                label="Blocked"
                value={metrics.tasksBlocked}
                tone={metrics.tasksBlocked > 0 ? 'danger' : 'neutral'}
                hint={metrics.tasksBlocked > 0 ? 'Needs attention' : 'Nothing blocked'}
                to={tasksUrl(ROUTES.tasks, { status: 'blocked' })}
              />
              <Metric
                label="Overdue"
                value={metrics.tasksOverdue}
                tone={metrics.tasksOverdue > 0 ? 'danger' : 'neutral'}
                hint={metrics.tasksOverdue > 0 ? 'Past their deadline' : 'Nothing overdue'}
                to={tasksUrl(ROUTES.tasks, { due: 'overdue' })}
              />
              <Metric
                label="Unassigned"
                value={metrics.tasksUnassigned}
                tone={metrics.tasksUnassigned > 0 ? 'warning' : 'neutral'}
                hint={
                  metrics.tasksUnassigned > 0 ? 'Waiting for an owner' : 'Every task has an owner'
                }
                to={tasksUrl(ROUTES.tasks, { assignee: 'unassigned', status: 'open' })}
              />
              <Metric
                label="Meetings"
                value={metrics.meetingsOpen}
                hint={metrics.meetingsOpen > 0 ? 'Scheduled or running' : 'None planned'}
                to={ROUTES.office}
              />
            </dl>
          </Card>
        </section>

        <div className="grid grid-cols-1 gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <CurrentProjects view={view} />
          <TeamOverview view={view} />
          <RecentActivity view={view} workspace={workspace} />
          <RecentNotifications view={view} />
        </div>

        <Departments view={view} />
      </div>
    </Page>
  );
}

type DashboardView = ReturnType<typeof buildView>;

function buildView(workspace: WorkspaceState) {
  const team = selectEmployeeSummaries(workspace);
  return {
    metrics: selectDashboardMetrics(workspace, todayIso()),
    projects: selectCurrentProjects(workspace),
    team,
    working: team.filter((member) => member.status === 'working').length,
    activity: selectRecentActivity(workspace, RECENT_ACTIVITY),
    notifications: selectNotifications(workspace).slice(0, RECENT_NOTIFICATIONS),
    departments: selectDepartmentOverview(workspace),
  };
}

/** One honest sentence about the company right now. */
function summary(view: DashboardView): string {
  const { metrics, team, working } = view;
  const people = `${String(working)} of ${String(team.length)} ${team.length === 1 ? 'person is' : 'people are'} working`;
  const projects =
    metrics.activeProjects === 0
      ? 'no project is active yet'
      : `${String(metrics.activeProjects)} ${metrics.activeProjects === 1 ? 'project is' : 'projects are'} active`;
  const blocked =
    metrics.tasksBlocked > 0
      ? ` ${String(metrics.tasksBlocked)} ${metrics.tasksBlocked === 1 ? 'task is' : 'tasks are'} blocked.`
      : '';
  return `${people} and ${projects}.${blocked}`;
}

type MetricTone = 'neutral' | 'accent' | 'secondary' | 'success' | 'danger' | 'warning';

/** Tone only colours the small marker; values stay neutral so the strip reads calmly. */
const METRIC_TONES: Record<MetricTone, string> = {
  neutral: 'bg-line-strong',
  accent: 'bg-accent',
  secondary: 'bg-secondary',
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
};

function Metric({
  label,
  value,
  hint,
  tone = 'neutral',
  to,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: MetricTone;
  /** Where the figure's items are listed. */
  to?: string;
}) {
  const body = (
    <>
      <dt className="flex items-center gap-2 text-xs whitespace-nowrap text-muted">
        <span
          aria-hidden="true"
          className={cn('size-1.5 shrink-0 rounded-full', METRIC_TONES[tone])}
        />
        <span>{label}</span>
      </dt>
      <dd className="mt-2 text-2xl font-semibold tracking-[-0.02em] tabular-nums">{value}</dd>
      <dd className="mt-0.5 truncate text-xs text-subtle">{hint}</dd>
    </>
  );
  return to ? (
    <div className="group relative flex min-w-0 flex-col bg-card px-4 py-5 transition-colors hover:bg-surface-hover">
      {body}
      {/* The whole cell is the link; the definition list keeps its structure. */}
      <Link
        to={to}
        aria-label={`${label}: ${String(value)}. ${hint}. Show them`}
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      />
      <ArrowRight
        className="absolute top-5 right-4 size-3.5 text-subtle opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      />
    </div>
  ) : (
    <div className="flex min-w-0 flex-col bg-card px-4 py-5">{body}</div>
  );
}

function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-muted transition-colors hover:text-content"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

function CurrentProjects({ view }: { view: DashboardView }) {
  const projects = view.projects.slice(0, CURRENT_PROJECTS);
  return (
    <Section
      id="dash-projects"
      title="Current projects"
      meta={view.projects.length > 0 ? `${String(view.projects.length)} in play` : undefined}
      action={<SectionLink to={ROUTES.projects}>All projects</SectionLink>}
    >
      <Card>
        {projects.length === 0 ? (
          <EmptyState
            compact
            headingLevel={3}
            icon={FolderOpen}
            title="No projects yet"
            description="Projects you start will appear here with live progress from their tasks."
          />
        ) : (
          <ul className="divide-y divide-line">
            {projects.map(({ project, progress }) => (
              <li key={project.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    to={`${ROUTES.projects}/${project.id}`}
                    className="min-w-0 flex-1 truncate text-base font-medium tracking-[-0.006em] transition-colors hover:text-accent-strong"
                  >
                    {project.name}
                  </Link>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <PriorityIcon priority={project.priority} />
                    {PRIORITY[project.priority].label}
                  </span>
                  <StatusIndicator
                    variant="pill"
                    tone={PROJECT_STATUS[project.status].tone}
                    label={PROJECT_STATUS[project.status].label}
                  />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <ProgressBar
                    value={progress.percent}
                    label={`${project.name} progress`}
                    valueText={`${String(progress.done)} of ${String(progress.counted)} tasks done`}
                  />
                  <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums">
                    {progress.percent}%
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {progress.counted === 0
                    ? 'No tasks yet'
                    : `${String(progress.done)} of ${String(progress.counted)} tasks done`}
                  {project.deadline ? ` · ${formatDeadline(project.deadline)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Section>
  );
}

function TeamOverview({ view }: { view: DashboardView }) {
  return (
    <Section
      id="dash-team"
      title="Team"
      meta={`${String(view.working)} of ${String(view.team.length)} working`}
      action={<SectionLink to={ROUTES.employees}>Everyone</SectionLink>}
    >
      <Card>
        <ul className="divide-y divide-line">
          {view.team.map(({ employee, department, status, currentTask }) => (
            <li key={employee.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar avatarId={employee.avatarId} color={department?.color} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{employee.name}</p>
                <p className="truncate text-xs text-muted">
                  {currentTask ? currentTask.title : employee.role}
                </p>
              </div>
              <StatusIndicator
                tone={WORK_STATUS[status].tone}
                label={WORK_STATUS[status].label}
                pulse={status === 'working'}
              />
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}

function RecentActivity({ view, workspace }: { view: DashboardView; workspace: WorkspaceState }) {
  return (
    <Section
      id="dash-activity"
      title="Recent activity"
      action={<SectionLink to={ROUTES.activity}>Full history</SectionLink>}
    >
      <Card>
        {view.activity.length === 0 ? (
          <EmptyState
            compact
            headingLevel={3}
            icon={History}
            title="No activity yet"
            description="Every project and task change is recorded here, with who made it."
          />
        ) : (
          <ol className="divide-y divide-line">
            {view.activity.map((event) => (
              <li key={event.id} className="flex items-start gap-3 px-5 py-3.5">
                <ActorAvatar actorId={event.actorId} workspace={workspace} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{event.description}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {actorName(event.actorId, workspace)} · <RelativeTime iso={event.timestamp} />
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </Section>
  );
}

function RecentNotifications({ view }: { view: DashboardView }) {
  return (
    <Section id="dash-notifications" title="Notifications">
      <Card>
        {view.notifications.length === 0 ? (
          <EmptyState
            compact
            headingLevel={3}
            icon={BellOff}
            title="No notifications"
            description="Assignments, reviews and blocked work will show up here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {view.notifications.map((notification) => {
              const { icon: Icon, className } = NOTIFICATION_ICONS[notification.type];
              return (
                <li key={notification.id} className="flex gap-3 px-4 py-3.5">
                  <Icon className={cn('mt-0.5 size-4 shrink-0', className)} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {notification.title}
                      {notification.isRead ? null : <span className="sr-only"> (unread)</span>}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{notification.message}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Section>
  );
}

function Departments({ view }: { view: DashboardView }) {
  return (
    <Section
      id="dash-departments"
      title="Departments"
      action={<SectionLink to={ROUTES.office}>Open the office</SectionLink>}
    >
      <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {view.departments.map(({ department, employees, openTasks }) => (
          <li key={department.id}>
            <Link
              to={{ pathname: ROUTES.employees, hash: department.id }}
              className="group flex h-full flex-col rounded-xl border border-line bg-card p-4 shadow-card transition-colors hover:border-line-strong"
            >
              <span className="flex items-start gap-2.5 text-sm font-medium">
                <DepartmentMark className="mt-1.5" color={department.color} />
                <span className="min-w-0 flex-1 leading-snug">{department.name}</span>
                <ArrowRight
                  className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-content"
                  aria-hidden="true"
                />
              </span>
              <span className="mt-2 pl-5 text-xs text-muted">
                {employees} {employees === 1 ? 'person' : 'people'} · {openTasks} open{' '}
                {openTasks === 1 ? 'task' : 'tasks'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
