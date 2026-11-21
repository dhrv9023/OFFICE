import { ArrowRight, Building2, PencilLine, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ROUTES } from '@/app/navigation';
import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/Button';
import { buttonClasses } from '@/components/buttonStyles';
import { Card } from '@/components/Card';
import { cn } from '@/components/cn';
import { DepartmentMark } from '@/components/Marks';
import { Page, Section } from '@/components/Page';
import { StatusIndicator } from '@/components/StatusIndicator';
import type { EmployeeId } from '@/domain/ids';
import type { Department, WorkspaceState } from '@/domain/types';
import { TASK_STATUS, WORK_STATUS } from '@/features/common/presentation';
import { useTaskLink } from '@/features/tasks/taskLink';
import {
  selectDepartmentOverview,
  selectEmployeeSummaries,
  type EmployeeSummary,
} from '@/stores/selectors';
import { useWorkspace } from '@/stores/workspace';
import { AccessDialog } from './AccessDialog';
import { RenameEmployeeDialog } from './RenameEmployeeDialog';
import { FOCUS_LABEL, focusOf, statusBreakdown, workloadOf, type Focus } from './workforce';
import { MIN_WORKLOAD_SCALE, WorkloadBar } from './WorkloadBar';

/** The workforce: who works here, what each person is doing, and how loaded they are. */
export function EmployeesPage() {
  const workspace = useWorkspace((state) => state);
  const view = useMemo(() => buildView(workspace), [workspace]);
  const { hash } = useLocation();
  const [renaming, setRenaming] = useState<EmployeeId | null>(null);
  const [accessFor, setAccessFor] = useState<EmployeeId | null>(null);

  // Department links (e.g. from the dashboard) land on that department.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [hash]);

  const people = view.people.length;
  return (
    <Page
      title="Employees"
      description={`${plural(people, 'person', 'people')} across ${plural(view.departments.length, 'department')}. Each has a role, a desk in the office and a queue of work.`}
      actions={
        <Link to={ROUTES.office} className={buttonClasses('secondary')}>
          <Building2 aria-hidden="true" />
          Visit the office
        </Link>
      }
    >
      <div className="flex flex-col gap-12">
        <WorkforceOverview view={view} />

        <Section id="team-heading" title="Team" meta={plural(people, 'person', 'people')}>
          {/* Equal columns at every width, so cards stay the same size however
              the team divides into rows. Each card is a subgrid over five
              shared tracks: its sections line up with its neighbours' whatever
              their content (a longer task title, more skills). */}
          <ul className="grid grid-cols-1 gap-x-4 md:grid-cols-2 xl:grid-cols-3">
            {view.people.map((person) => (
              <li
                key={person.summary.employee.id}
                className="row-span-5 grid grid-rows-subgrid gap-y-0 pb-4"
              >
                <EmployeeCard
                  person={person}
                  scale={view.workloadScale}
                  onRename={() => {
                    setRenaming(person.summary.employee.id);
                  }}
                  onAccess={() => {
                    setAccessFor(person.summary.employee.id);
                  }}
                />
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="departments-heading"
          title="Departments"
          meta={plural(view.departments.length, 'department')}
        >
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line lg:grid lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto_auto] lg:gap-x-8">
              {view.departments.map((entry) => (
                <DepartmentRow key={entry.department.id} entry={entry} view={view} />
              ))}
            </ul>
          </Card>
        </Section>
      </div>
      <AccessDialog
        employeeId={accessFor}
        onClose={() => {
          setAccessFor(null);
        }}
      />
      <RenameEmployeeDialog
        employeeId={renaming}
        onClose={() => {
          setRenaming(null);
        }}
      />
    </Page>
  );
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

interface Person {
  readonly summary: EmployeeSummary;
  readonly focus: Focus;
  readonly workload: ReturnType<typeof workloadOf>;
}

type View = ReturnType<typeof buildView>;

function buildView(workspace: WorkspaceState) {
  const tasks = Object.values(workspace.tasks);
  const departments = selectDepartmentOverview(workspace);
  const order = new Map(departments.map((entry, index) => [entry.department.id, index]));
  const people: Person[] = selectEmployeeSummaries(workspace)
    .sort(
      (a, b) =>
        (order.get(a.employee.departmentId) ?? 0) - (order.get(b.employee.departmentId) ?? 0) ||
        a.employee.name.localeCompare(b.employee.name),
    )
    .map((summary) => ({
      summary,
      focus: focusOf(workspace, summary.employee.id, summary.status),
      workload: workloadOf(tasks, summary.employee.id),
    }));
  const open = tasks.filter((task) => !['done', 'cancelled'].includes(task.status));
  return {
    people,
    workloadScale: Math.max(
      MIN_WORKLOAD_SCALE,
      ...people.map((person) => person.workload.segments.length),
    ),
    departments,
    openAssigned: open.filter((task) => task.assigneeId !== null).length,
    unassigned: open.filter((task) => task.assigneeId === null).length,
  };
}

const BAR: Record<string, string> = {
  working: 'bg-accent',
  reviewing: 'bg-secondary',
  blocked: 'bg-danger',
  idle: 'bg-line-strong',
};

function WorkforceOverview({ view }: { view: View }) {
  const breakdown = statusBreakdown(view.people.map((person) => person.summary.status));
  const total = view.people.length;
  const working = breakdown.find((entry) => entry.status === 'working')?.count ?? 0;

  return (
    <Card aria-labelledby="overview-heading" className="p-5">
      <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 id="overview-heading" className="text-sm font-medium text-muted">
              Right now
            </h2>
            <p className="text-xl font-semibold tracking-[-0.02em] tabular-nums">
              {working} of {total} working
            </p>
          </div>
          {total > 0 ? (
            <div
              className="mt-3.5 flex h-2 gap-0.5 overflow-hidden rounded-full"
              aria-hidden="true"
            >
              {breakdown
                .filter((entry) => entry.count > 0)
                .map((entry) => (
                  <span
                    key={entry.status}
                    className={cn(
                      'h-full first:rounded-l-full last:rounded-r-full',
                      BAR[entry.status],
                    )}
                    style={{ flexGrow: entry.count }}
                  />
                ))}
            </div>
          ) : null}
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
            {breakdown.map((entry) => (
              <li key={entry.status} className="flex items-center gap-2">
                <span aria-hidden="true" className={cn('size-2 rounded-full', BAR[entry.status])} />
                <span className="text-muted">{WORK_STATUS[entry.status].label}</span>
                <span className="font-medium tabular-nums">{entry.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <dl className="grid grid-cols-2 gap-x-10 gap-y-4 border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
          <Figure label="Assigned tasks" value={view.openAssigned} hint="Open, with an owner" />
          <Figure
            label="Unassigned"
            value={view.unassigned}
            hint={view.unassigned > 0 ? 'Waiting for an owner' : 'Every task has an owner'}
            to={view.unassigned > 0 ? `${ROUTES.tasks}?assignee=unassigned` : undefined}
          />
        </dl>
      </div>
    </Card>
  );
}

function Figure({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: number;
  hint: string;
  /** Where the figure's tasks are listed, when there is anything to see. */
  to?: string | undefined;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tracking-[-0.02em] tabular-nums">
        {to ? (
          <Link
            to={to}
            aria-label={`${String(value)} unassigned: view them`}
            className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-accent-strong"
          >
            {value}
            <ArrowRight className="size-4 text-subtle" aria-hidden="true" />
          </Link>
        ) : (
          value
        )}
      </dd>
      <dd className="text-sm text-muted">{hint}</dd>
    </div>
  );
}

const FOCUS_TONE: Record<Focus['kind'], string> = {
  working: 'text-accent-strong',
  reviewing: 'text-secondary',
  blocked: 'text-danger',
  next: 'text-muted',
  none: 'text-muted',
};

const MAX_SKILLS = 3;

function EmployeeCard({
  person,
  scale,
  onRename,
  onAccess,
}: {
  person: Person;
  scale: number;
  onRename: () => void;
  onAccess: () => void;
}) {
  const { employee, department, status } = person.summary;
  const { focus, workload } = person;
  const { open } = useTaskLink();
  const nameId = `${employee.id}-name`;
  const skills = employee.skills.slice(0, MAX_SKILLS);
  const moreSkills = employee.skills.length - skills.length;

  return (
    <article
      aria-labelledby={nameId}
      className="row-span-5 grid grid-rows-subgrid gap-y-0 rounded-xl border border-line bg-card p-6 shadow-card transition-colors duration-150 hover:border-line-strong"
    >
      {/* Five direct children = five shared row tracks (see the list above). */}
      <div className="-mt-1.5 -mr-2 flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-start gap-2 pt-1.5 text-sm text-muted">
          {department ? (
            <>
              <DepartmentMark color={department.color} className="mt-1.5" />
              <span>{department.name}</span>
            </>
          ) : (
            'No department'
          )}
        </p>
        <div className="flex">
          <IconButton
            icon={ShieldCheck}
            label={`AI access for ${employee.name}`}
            onClick={onAccess}
          />
          <IconButton icon={PencilLine} label={`Rename ${employee.name}`} onClick={onRename} />
        </div>
      </div>

      {/* The name has the full width beside the avatar: no badge competes with it. */}
      <header className="mt-5 flex items-center gap-5">
        <Avatar avatarId={employee.avatarId} color={department?.color} size="xl" />
        <div className="min-w-0 flex-1">
          <h3
            id={nameId}
            className="text-lg leading-snug font-semibold tracking-[-0.01em] break-words"
          >
            {employee.name}
          </h3>
          <p className="mt-0.5 text-sm break-words text-muted">{employee.role}</p>
          <StatusIndicator
            variant="pill"
            tone={WORK_STATUS[status].tone}
            label={WORK_STATUS[status].label}
            pulse={status === 'working'}
            className="mt-2 -ml-0.5"
          />
        </div>
      </header>

      <div className="mt-6 border-t border-line pt-5">
        <p className={cn('text-xs font-semibold', FOCUS_TONE[focus.kind])}>
          {FOCUS_LABEL[focus.kind]}
        </p>
        {focus.task ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (focus.task) open(focus.task.id);
              }}
              className="mt-1.5 line-clamp-2 max-w-full rounded-sm text-left text-sm font-medium transition-colors hover:text-accent-strong"
            >
              {focus.task.title}
            </button>
            <p className="mt-0.5 text-sm text-muted">
              {focus.project?.name ?? 'Unknown project'}
              <span className="text-subtle"> · </span>
              {TASK_STATUS[focus.task.status].label}
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-muted">Free to take on new work.</p>
        )}
      </div>

      <WorkloadBar workload={workload} scale={scale} className="pt-6" />

      <footer className="mt-5 flex items-start justify-between gap-4 border-t border-line pt-4">
        <p className="min-w-0 text-sm text-muted" title={employee.skills.join(', ')}>
          <span className="sr-only">Skills: </span>
          {skills.join(' · ')}
          {moreSkills > 0 ? <span> +{moreSkills}</span> : null}
        </p>
        <Link
          to={`${ROUTES.tasks}?assignee=${employee.id}`}
          aria-label={`View ${employee.name}'s tasks`}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-medium text-content transition-colors hover:text-accent-strong"
        >
          Tasks
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </footer>
    </article>
  );
}

function DepartmentRow({ entry, view }: { entry: View['departments'][number]; view: View }) {
  const { department, openTasks } = entry;
  const members = view.people.filter(
    (person) => person.summary.employee.departmentId === department.id,
  );
  return (
    <li
      id={department.id}
      tabIndex={-1}
      aria-labelledby={`${department.id}-heading`}
      // From lg, rows share the list's columns (subgrid), so names, descriptions,
      // people and links line up whatever the size of each department. Below lg a
      // row stacks: name, description, then people and the tasks link.
      className="grid scroll-mt-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8 gap-y-2 px-5 py-4 focus:outline-none focus-visible:bg-surface-hover lg:col-span-4 lg:grid-cols-subgrid"
    >
      <h3
        id={`${department.id}-heading`}
        className="col-span-2 flex items-center gap-2.5 text-sm font-medium lg:col-span-1"
      >
        <DepartmentMark color={department.color} />
        <span className="truncate">{department.name}</span>
      </h3>
      <p className="col-span-2 text-sm text-pretty text-muted lg:col-span-1">
        {department.description}
      </p>
      <DepartmentMembers department={department} members={members} />
      <Link
        to={`${ROUTES.tasks}?department=${department.id}`}
        aria-label={`${plural(openTasks, 'open task')} in ${department.name}`}
        className="inline-flex items-center gap-1 justify-self-end rounded-sm text-sm font-medium whitespace-nowrap tabular-nums transition-colors hover:text-accent-strong"
      >
        {plural(openTasks, 'open task')}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Faces shown before the stack collapses into "+n". */
const MAX_FACES = 4;

function DepartmentMembers({
  department,
  members,
}: {
  department: Department;
  members: readonly Person[];
}) {
  if (members.length === 0) return <span className="text-sm text-subtle">No one yet</span>;
  const faces = members.slice(0, MAX_FACES);
  const hidden = members.length - faces.length;
  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap">
      <span className="flex -space-x-1" aria-hidden="true">
        {faces.map((person) => (
          <Avatar
            key={person.summary.employee.id}
            avatarId={person.summary.employee.avatarId}
            color={department.color}
            size="sm"
            className="ring-2 ring-card"
          />
        ))}
        {hidden > 0 ? (
          <span className="z-10 flex size-6 items-center justify-center rounded-md bg-surface-hover text-xs font-medium text-muted ring-2 ring-card">
            +{hidden}
          </span>
        ) : null}
      </span>
      <span className="text-sm text-muted tabular-nums">
        {plural(members.length, 'person', 'people')}
      </span>
    </span>
  );
}
