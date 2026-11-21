import { FilterX, History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ROUTES } from '@/app/navigation';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Select } from '@/components/Field';
import { Page } from '@/components/Page';
import { RelativeTime } from '@/components/time';
import type { ActivityEvent, WorkspaceState } from '@/domain/types';
import { ActorAvatar } from '@/features/common/ActorAvatar';
import { actorName } from '@/features/common/actors';
import { useTaskLink } from '@/features/tasks/taskLink';
import { useWorkspace } from '@/stores/workspace';
import {
  ACTIVITY_KIND_LABELS,
  ACTIVITY_KINDS,
  filterActivity,
  readActivityFilters,
} from './activityFilters';

/** Events rendered per page; "Show older" reveals the next page. */
const PAGE = 100;

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getFullYear())}-${String(date.getMonth())}-${String(date.getDate())}`;
}

function dayLabel(iso: string, now: Date): string {
  const key = dayKey(iso);
  if (key === dayKey(now.toISOString())) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(yesterday.toISOString())) return 'Yesterday';
  return dayFormat.format(new Date(iso));
}

/** Newest first, grouped by calendar day. */
function groupByDay(events: readonly ActivityEvent[]) {
  const now = new Date();
  const groups: { key: string; label: string; events: ActivityEvent[] }[] = [];
  for (const event of events) {
    const key = dayKey(event.timestamp);
    const last = groups.at(-1);
    if (last?.key === key) last.events.push(event);
    else groups.push({ key, label: dayLabel(event.timestamp, now), events: [event] });
  }
  return groups;
}

/** The company's history: every recorded change, attributed to who made it. */
export function ActivityPage() {
  const workspace = useWorkspace((state) => state);
  const [params, setParams] = useSearchParams();
  const filters = readActivityFilters(params);
  const [shown, setShown] = useState(PAGE);
  const total = workspace.activity.length;
  const { kind, employeeId, projectId } = filters;
  const matching = useMemo(
    () => filterActivity(workspace.activity, { kind, employeeId, projectId }, workspace.meetings),
    [workspace.activity, workspace.meetings, kind, employeeId, projectId],
  );

  const groups = useMemo(() => groupByDay(matching.slice(-shown).reverse()), [matching, shown]);
  const filtered =
    filters.kind !== 'all' || filters.employeeId !== 'all' || filters.projectId !== 'all';

  const setFilter = (key: string, value: string) => {
    setShown(PAGE);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === 'all') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <Page
      title="Activity"
      description={
        total === 0
          ? 'Every change to projects, tasks, people and meetings is recorded here, with who made it.'
          : `Every change to projects, tasks, people and meetings, attributed to who made it. ${String(total)} ${total === 1 ? 'event' : 'events'} recorded.`
      }
    >
      {total === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing has happened yet"
          description="Create a project or move a task, and it will appear here."
        />
      ) : (
        <div className="flex max-w-3xl flex-col gap-8">
          <div className="grid gap-2.5 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
            <Select
              label="Kind"
              hideLabel
              value={filters.kind}
              onChange={(event) => {
                setFilter('kind', event.target.value);
              }}
              options={[
                { value: 'all', label: 'Everything' },
                ...ACTIVITY_KINDS.map((kind) => ({
                  value: kind,
                  label: ACTIVITY_KIND_LABELS[kind],
                })),
              ]}
            />
            <Select
              label="Person"
              hideLabel
              value={filters.employeeId}
              onChange={(event) => {
                setFilter('employee', event.target.value);
              }}
              options={[
                { value: 'all', label: 'Anyone' },
                ...Object.values(workspace.employees).map((employee) => ({
                  value: employee.id,
                  label: employee.name,
                })),
              ]}
            />
            <Select
              label="Project"
              hideLabel
              value={filters.projectId}
              onChange={(event) => {
                setFilter('project', event.target.value);
              }}
              options={[
                { value: 'all', label: 'Any project' },
                ...Object.values(workspace.projects)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((project) => ({ value: project.id, label: project.name })),
              ]}
            />
            {filtered ? (
              <Button
                variant="ghost"
                icon={FilterX}
                onClick={() => {
                  setShown(PAGE);
                  setParams({}, { replace: true });
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <p className="-mt-4 text-sm text-muted" aria-live="polite">
            {filtered
              ? `${String(matching.length)} of ${String(total)} events match`
              : `${String(total)} ${total === 1 ? 'event' : 'events'}`}
          </p>

          {matching.length === 0 ? (
            <EmptyState
              compact
              icon={History}
              title="No matching events"
              description="Try another person, project or kind."
            />
          ) : (
            groups.map((group) => (
              <section key={group.key} aria-labelledby={`day-${group.key}`}>
                <h2
                  id={`day-${group.key}`}
                  className="sticky top-0 z-10 -mx-1 mb-3 bg-surface/90 px-1 py-1.5 text-sm font-semibold backdrop-blur"
                >
                  {group.label}
                </h2>
                <ol className="relative flex flex-col gap-1 before:absolute before:top-4 before:bottom-4 before:left-[15px] before:w-px before:bg-line">
                  {group.events.map((event) => (
                    <EventRow key={event.id} event={event} workspace={workspace} />
                  ))}
                </ol>
              </section>
            ))
          )}

          {matching.length > shown ? (
            <Button
              className="self-start"
              onClick={() => {
                setShown((current) => current + PAGE);
              }}
            >
              Show older ({String(matching.length - shown)} more)
            </Button>
          ) : null}
        </div>
      )}
    </Page>
  );
}

function EventRow({ event, workspace }: { event: ActivityEvent; workspace: WorkspaceState }) {
  const { open } = useTaskLink();
  const task = event.taskId ? workspace.tasks[event.taskId] : undefined;
  const project = event.projectId ? workspace.projects[event.projectId] : undefined;

  return (
    <li className="relative flex items-start gap-3.5 rounded-lg py-2">
      <span className="relative flex rounded-md ring-4 ring-surface">
        <ActorAvatar actorId={event.actorId} workspace={workspace} size="md" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm">{event.description}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className="font-medium text-content">{actorName(event.actorId, workspace)}</span>
          <span aria-hidden="true">·</span>
          <RelativeTime iso={event.timestamp} />
          {task || project ? <span aria-hidden="true">·</span> : null}
          {task ? (
            <button
              type="button"
              onClick={() => {
                open(task.id);
              }}
              className="rounded-sm font-medium text-muted underline-offset-2 transition-colors hover:text-content hover:underline"
            >
              Open task
            </button>
          ) : project ? (
            <Link
              to={`${ROUTES.projects}/${project.id}`}
              className="rounded-sm font-medium text-muted underline-offset-2 transition-colors hover:text-content hover:underline"
            >
              Open project
            </Link>
          ) : null}
        </p>
      </div>
    </li>
  );
}
