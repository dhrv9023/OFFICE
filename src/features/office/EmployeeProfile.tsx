import {
  ArrowLeft,
  CalendarPlus,
  ListChecks,
  ListPlus,
  MessageSquare,
  PencilLine,
  Presentation,
  ShieldCheck,
  Plus,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ROUTES } from '@/app/navigation';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button, IconButton } from '@/components/Button';
import { cn } from '@/components/cn';
import { StatusIndicator } from '@/components/StatusIndicator';
import { RelativeTime } from '@/components/time';
import { OFFICE_LAYOUT } from '@/domain/seed';
import { deriveEmployeePresence } from '@/domain/rules/meetings';
import { isOpenMeeting, isTerminalStatus, type Task, type WorkspaceState } from '@/domain/types';
import { formatDeadline, TASK_STATUS, WORK_STATUS } from '@/features/common/presentation';
import { AccessDialog } from '@/features/employees/AccessDialog';
import { RenameEmployeeDialog } from '@/features/employees/RenameEmployeeDialog';
import { FOCUS_LABEL, focusOf, workloadOf } from '@/features/employees/workforce';
import { MIN_WORKLOAD_SCALE, WorkloadBar } from '@/features/employees/WorkloadBar';
import { MeetingSummary } from '@/features/meetings/MeetingSummary';
import { ScheduleMeetingDialog } from '@/features/meetings/ScheduleMeetingDialog';
import { AssignExistingTaskDialog } from '@/features/tasks/AssignExistingTaskDialog';
import { AssignTaskDialog } from '@/features/tasks/AssignTaskDialog';
import { useTaskLink } from '@/features/tasks/taskLink';
import { TaskFormDialog } from '@/features/tasks/TaskFormDialog';
import type { EmployeeSummary } from '@/stores/selectors';
import { Section } from './inspectorParts';

const MEETING_ROOM = OFFICE_LAYOUT.rooms.find((room) => room.kind === 'meeting');
const RECENT_ACTIVITY = 5;
const ACCESS_LABEL = { disabled: 'Disabled', active: 'Active', suspended: 'Suspended' } as const;
const PAST_MEETINGS = 3;

const FOCUS_TONE = {
  working: 'text-accent-strong',
  reviewing: 'text-secondary',
  blocked: 'text-danger',
  next: 'text-muted',
  none: 'text-muted',
} as const;

type Dialog =
  | { kind: 'new-task' }
  | { kind: 'assign-existing' }
  | { kind: 'reassign'; task: Task }
  | { kind: 'rename' }
  | { kind: 'access' }
  | { kind: 'meeting' }
  | null;

/**
 * An employee, as the founder sees them when they walk up and interact: who they
 * are, what they are doing, how loaded they are, and what you can do about it.
 * Every action runs an existing command (through the same dialogs as the rest of
 * the app), so the office and the management pages always agree.
 */
export function EmployeeProfile({
  member,
  team,
  workspace,
}: {
  member: EmployeeSummary;
  team: readonly EmployeeSummary[];
  workspace: WorkspaceState;
}) {
  const navigate = useNavigate();
  const { open } = useTaskLink();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [talking, setTalking] = useState(false);
  const { employee, department, status } = member;
  const close = () => {
    setDialog(null);
  };

  const view = useMemo(() => {
    const tasks = Object.values(workspace.tasks);
    const mine = tasks
      .filter((task) => task.assigneeId === employee.id && !isTerminalStatus(task.status))
      .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
    return {
      focus: focusOf(workspace, employee.id, status),
      workload: workloadOf(tasks, employee.id),
      scale: Math.max(
        MIN_WORKLOAD_SCALE,
        ...team.map((other) => workloadOf(tasks, other.employee.id).segments.length),
      ),
      openTasks: mine,
      unassigned: tasks.filter((task) => task.assigneeId === null && !isTerminalStatus(task.status))
        .length,
      meetings: Object.values(workspace.meetings)
        .filter(
          (meeting) =>
            isOpenMeeting(meeting.status) && meeting.participantIds.includes(employee.id),
        )
        .sort((a, b) => (a.startsAt ?? '9999').localeCompare(b.startsAt ?? '9999')),
      pastMeetings: Object.values(workspace.meetings)
        .filter(
          (meeting) =>
            meeting.status === 'completed' && meeting.participantIds.includes(employee.id),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, PAST_MEETINGS),
      presence: deriveEmployeePresence(employee.id, Object.values(workspace.meetings)),
      // Their own events, plus meetings they were part of.
      activity: workspace.activity
        .filter(
          (event) =>
            event.employeeId === employee.id ||
            (event.meetingId !== null &&
              (workspace.meetings[event.meetingId]?.participantIds.includes(employee.id) ?? false)),
        )
        .slice(-RECENT_ACTIVITY)
        .reverse(),
    };
  }, [workspace, employee.id, status, team]);
  if (talking) {
    return (
      <TalkPanel
        member={member}
        activity={view.activity}
        onBack={() => {
          setTalking(false);
        }}
      />
    );
  }

  const { focus } = view;
  return (
    <>
      <Section>
        <div className="flex items-start gap-4">
          <Avatar avatarId={employee.avatarId} color={department?.color} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="-mt-1 -mr-2 flex items-start justify-between gap-1">
              <h2
                id="inspector-title"
                className="pt-1 text-lg leading-snug font-semibold break-words"
              >
                {employee.name}
              </h2>
              <IconButton
                icon={PencilLine}
                label={`Rename ${employee.name}`}
                onClick={() => {
                  setDialog({ kind: 'rename' });
                }}
              />
            </div>
            <p className="text-sm text-muted">
              {employee.role} · {department?.name}
            </p>
            <StatusIndicator
              variant="pill"
              tone={WORK_STATUS[status].tone}
              label={WORK_STATUS[status].label}
              pulse={status === 'working'}
              className="mt-2 -ml-0.5"
            />
            {view.presence.kind === 'in_meeting' ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-secondary">
                <Presentation className="size-3.5" aria-hidden="true" />
                In a meeting: {workspace.meetings[view.presence.meetingId]?.title}
              </p>
            ) : null}
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              AI access: {ACCESS_LABEL[workspace.accessProfiles[employee.id]?.status ?? 'disabled']}
              <button
                type="button"
                className="ml-1 rounded-sm font-medium text-accent-strong hover:underline"
                onClick={() => {
                  setDialog({ kind: 'access' });
                }}
              >
                Manage
              </button>
            </p>
          </div>
        </div>
      </Section>

      <Section>
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
              className="mt-1.5 block max-w-full rounded-sm text-left text-sm font-medium transition-colors hover:text-accent-strong"
            >
              {focus.task.title}
            </button>
            <p className="mt-0.5 text-sm text-muted">
              {focus.project?.name ?? 'Unknown project'} · {TASK_STATUS[focus.task.status].label}
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-muted">Free to take on new work.</p>
        )}
        <WorkloadBar workload={view.workload} scale={view.scale} className="mt-5" />
      </Section>

      <Section title="Manage">
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            icon={Plus}
            className="justify-start"
            onClick={() => {
              setDialog({ kind: 'new-task' });
            }}
          >
            Assign a new task
          </Button>
          <Button
            icon={ListPlus}
            className="justify-start"
            onClick={() => {
              setDialog({ kind: 'assign-existing' });
            }}
          >
            Assign an existing task
            <span className="ml-auto text-xs text-muted tabular-nums">
              {view.unassigned} unassigned
            </span>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              icon={MessageSquare}
              className="justify-start"
              onClick={() => {
                setTalking(true);
              }}
            >
              Talk
            </Button>
            <Button
              icon={CalendarPlus}
              className="justify-start"
              disabled={!MEETING_ROOM}
              onClick={() => {
                setDialog({ kind: 'meeting' });
              }}
            >
              Meet
            </Button>
          </div>
        </div>
      </Section>

      <Section title={`Open tasks · ${String(view.openTasks.length)}`}>
        {view.openTasks.length === 0 ? (
          <p className="text-sm text-muted">Nothing assigned right now.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {view.openTasks.map((task) => (
              <li
                key={task.id}
                className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-surface-hover"
              >
                <button
                  type="button"
                  onClick={() => {
                    open(task.id);
                  }}
                  className="min-w-0 flex-1 rounded-sm text-left"
                >
                  <span className="block text-sm font-medium">{task.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <Badge tone={TASK_STATUS[task.status].tone}>
                      {TASK_STATUS[task.status].label}
                    </Badge>
                    <span>{workspace.projects[task.projectId]?.name}</span>
                    {task.deadline ? <span>{formatDeadline(task.deadline)}</span> : null}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => {
                    setDialog({ kind: 'reassign', task });
                  }}
                >
                  Reassign
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-col gap-2">
          <Button
            icon={ListChecks}
            className="justify-start"
            onClick={() => {
              void navigate(`${ROUTES.tasks}?assignee=${employee.id}`);
            }}
          >
            All their tasks on the board
          </Button>
          <Button
            icon={Users}
            className="justify-start"
            onClick={() => {
              void navigate({ pathname: ROUTES.employees, hash: employee.departmentId });
            }}
          >
            See the {department?.name ?? 'department'} team
          </Button>
        </div>
      </Section>

      {view.meetings.length > 0 ? (
        <Section title="Meetings">
          <ul className="flex flex-col gap-4">
            {view.meetings.map((meeting) => (
              <li key={meeting.id}>
                <MeetingSummary meeting={meeting} workspace={workspace} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {view.pastMeetings.length > 0 ? (
        <Section title="Past meetings">
          <ul className="flex flex-col gap-4">
            {view.pastMeetings.map((meeting) => (
              <li key={meeting.id}>
                <MeetingSummary meeting={meeting} workspace={workspace} showNotes />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {employee.skills.length > 0 ? (
        <Section title="Skills">
          <ul className="flex flex-wrap gap-1.5">
            {employee.skills.map((skill) => (
              <li
                key={skill}
                className="rounded-md bg-surface-raised px-2 py-0.5 text-xs text-muted"
              >
                {skill}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Recent activity">
        <ActivityList activity={view.activity} />
      </Section>

      <TaskFormDialog open={dialog?.kind === 'new-task'} onClose={close} assigneeId={employee.id} />
      <AssignExistingTaskDialog
        employeeId={dialog?.kind === 'assign-existing' ? employee.id : null}
        onClose={close}
      />
      {dialog?.kind === 'reassign' ? (
        <AssignTaskDialog task={dialog.task} open onClose={close} />
      ) : null}
      <AccessDialog employeeId={dialog?.kind === 'access' ? employee.id : null} onClose={close} />
      <RenameEmployeeDialog
        employeeId={dialog?.kind === 'rename' ? employee.id : null}
        onClose={close}
      />
      {MEETING_ROOM ? (
        <ScheduleMeetingDialog
          open={dialog?.kind === 'meeting'}
          roomId={MEETING_ROOM.id}
          roomName={MEETING_ROOM.name}
          initialParticipants={[employee.id]}
          onClose={close}
        />
      ) : null}
    </>
  );
}

const ORDER: readonly Task['status'][] = ['in_progress', 'in_review', 'blocked', 'todo'];

function ActivityList({ activity }: { activity: WorkspaceState['activity'] }) {
  if (activity.length === 0) {
    return <p className="text-sm text-muted">Nothing recorded yet.</p>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {activity.map((event) => (
        <li key={event.id} className="text-sm">
          <p>{event.description}</p>
          <p className="mt-0.5 text-xs text-muted">
            <RelativeTime iso={event.timestamp} />
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * The foundation for talking to an employee. Phase 1 has no AI agents, so nobody
 * can reply and nothing is generated: this shows the real record of your work
 * together and says plainly what is coming.
 */
function TalkPanel({
  member,
  activity,
  onBack,
}: {
  member: EmployeeSummary;
  activity: WorkspaceState['activity'];
  onBack: () => void;
}) {
  const { employee, department } = member;
  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
        <IconButton icon={ArrowLeft} label={`Back to ${employee.name}`} onClick={onBack} />
        <span className="text-sm text-muted">Talk</span>
      </div>
      <Section>
        <div className="flex items-center gap-3">
          <Avatar avatarId={employee.avatarId} color={department?.color} size="lg" />
          <div className="min-w-0">
            <h2 id="inspector-title" className="text-base font-semibold break-words">
              {employee.name}
            </h2>
            <p className="text-sm text-muted">{employee.role}</p>
          </div>
        </div>
      </Section>
      <Section title="Your work together">
        <ActivityList activity={activity} />
      </Section>
      <Section title="Message">
        <div
          role="note"
          className="rounded-lg border border-dashed border-line bg-surface-raised p-3 text-sm"
        >
          <p className="font-medium">Conversations arrive with AI employees</p>
          <p className="mt-1 text-muted">
            {employee.name} is not connected to an AI agent yet, so they cannot read or answer
            messages. Nothing here is simulated. Until then, give them work through tasks and
            meetings.
          </p>
        </div>
        <label className="mt-3 block">
          <span className="sr-only">Message to {employee.name} (not available yet)</span>
          <textarea
            disabled
            rows={2}
            placeholder={`Message ${employee.name}…`}
            className="w-full cursor-not-allowed resize-none rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm opacity-60"
          />
        </label>
        <Button className="mt-2 w-full" disabled>
          Send (available with AI employees)
        </Button>
      </Section>
    </>
  );
}
