import { useId, useMemo, useState, type SyntheticEvent } from 'react';
import { commands } from '@/commands';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { Dialog } from '@/components/Dialog';
import { Input, Select, Textarea } from '@/components/Field';
import { StatusIndicator } from '@/components/StatusIndicator';
import { toast } from '@/components/toast/toastStore';
import type { DomainError } from '@/domain/errors';
import type { EmployeeId, ProjectId, RoomId } from '@/domain/ids';
import { findMeetingClash } from '@/domain/rules/meetings';
import { LIMITS } from '@/domain/rules/validation';
import { USER_ACTOR, type Meeting } from '@/domain/types';
import { errorTitle, fieldError } from '@/features/common/commandFeedback';
import {
  formatDuration,
  formatMeetingTime,
  localNow,
  WORK_STATUS,
} from '@/features/common/presentation';
import { selectEmployeeSummaries } from '@/stores/selectors';
import { useWorkspace } from '@/stores/workspace';

interface ScheduleMeetingDialogProps {
  open: boolean;
  roomId: RoomId;
  roomName: string;
  /** Invited from the start (e.g. the person you were talking to). */
  initialParticipants?: readonly EmployeeId[];
  onClose: () => void;
  onScheduled?: (meeting: Meeting) => void;
  /** Edit this scheduled meeting (through `updateMeeting`) instead of creating one. */
  meeting?: Meeting | undefined;
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240] as const;

/** The next half hour after `now` (local `YYYY-MM-DDTHH:mm`), as [day, time]. */
function nextSlot(now: string): [string, string] {
  const [day = '', clock = '00:00'] = now.split('T');
  const [hour = 0, minute = 0] = clock.split(':').map(Number);
  const total = hour * 60 + minute;
  const next = Math.ceil((total + 1) / 30) * 30;
  if (next >= 24 * 60) {
    const date = new Date(`${day}T00:00`);
    date.setDate(date.getDate() + 1);
    const pad = (value: number) => String(value).padStart(2, '0');
    return [
      `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      '09:00',
    ];
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return [day, `${pad(Math.floor(next / 60))}:${pad(next % 60)}`];
}

/** Schedules a meeting through the `scheduleMeeting` command. */
export function ScheduleMeetingDialog(props: ScheduleMeetingDialogProps) {
  return props.open ? <ScheduleForm {...props} /> : null;
}

function ScheduleForm({
  roomId,
  roomName,
  initialParticipants = [],
  onClose,
  onScheduled,
  meeting,
}: ScheduleMeetingDialogProps) {
  const workspace = useWorkspace((state) => state);
  const team = useMemo(() => selectEmployeeSummaries(workspace), [workspace]);
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [agenda, setAgenda] = useState(meeting?.agenda ?? '');
  const [participants, setParticipants] = useState<readonly EmployeeId[]>(
    meeting?.participantIds ?? initialParticipants,
  );
  const [initialDay, initialTime] = useMemo(
    () =>
      meeting?.startsAt ? (meeting.startsAt.split('T') as [string, string]) : nextSlot(localNow()),
    [meeting],
  );
  const [day, setDay] = useState(initialDay);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState<number>(meeting?.durationMinutes ?? 60);
  const [projectId, setProjectId] = useState<ProjectId | ''>(meeting?.projectId ?? '');
  const [error, setError] = useState<DomainError | null>(null);
  const startsAt = `${day}T${time}`;
  const inPast = day !== '' && time !== '' && startsAt < localNow();
  const projects = Object.values(workspace.projects)
    .filter((project) => project.status !== 'archived')
    .sort((a, b) => a.name.localeCompare(b.name));
  // A meeting being edited never clashes with itself.
  const others = Object.values(workspace.meetings).filter((other) => other.id !== meeting?.id);
  // Live availability from the same rule the command applies. Only people are
  // compared here (the room is checked when scheduling).
  const busyIn = (employeeId: EmployeeId) =>
    findMeetingClash(
      {
        startsAt,
        durationMinutes: duration,
        roomId: 'room_availability_check',
        participantIds: [employeeId],
      },
      others,
    )?.meeting;
  const formId = useId();

  const toggle = (id: EmployeeId, on: boolean) => {
    setParticipants((current) =>
      on ? [...current.filter((item) => item !== id), id] : current.filter((item) => item !== id),
    );
    setError(null);
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (inPast) {
      setError({
        code: 'validation',
        field: 'startsAt',
        message: 'Choose a time that has not passed yet.',
      });
      return;
    }
    const details = {
      title,
      agenda,
      participantIds: participants,
      startsAt,
      durationMinutes: duration,
      projectId: projectId === '' ? null : projectId,
    };
    const result = meeting
      ? commands.updateMeeting(USER_ACTOR, { meetingId: meeting.id, patch: details })
      : commands.scheduleMeeting(USER_ACTOR, { ...details, roomId });
    if (!result.ok) {
      if (meeting && result.error.code === 'conflict' && result.error.reason === 'no_change') {
        onClose();
        return;
      }
      setError(result.error);
      return;
    }
    toast.success(
      meeting ? 'Meeting updated' : 'Meeting scheduled',
      `"${result.value.title}", ${formatMeetingTime(result.value.startsAt, result.value.durationMinutes)}.`,
    );
    onScheduled?.(result.value);
    onClose();
  };

  const participantError = fieldError(error, 'participantIds');
  const otherError =
    error &&
    !['title', 'agenda', 'participantIds', 'startsAt', 'durationMinutes', 'projectId'].includes(
      error.code === 'validation' ? error.field : '',
    )
      ? error
      : null;
  const everyone = participants.length === team.length;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={meeting ? 'Edit meeting' : 'Schedule a meeting'}
      description={`In ${roomName}. You record what was decided when it has taken place.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary">
            {meeting ? 'Save changes' : 'Schedule meeting'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {otherError ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-sm"
          >
            <p className="font-medium text-danger">{errorTitle(otherError)}</p>
            <p className="mt-0.5 text-muted">{otherError.message}</p>
          </div>
        ) : null}
        <Input
          label="Title"
          value={title}
          maxLength={LIMITS.meetingTitle}
          data-autofocus
          error={fieldError(error, 'title')}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        <Textarea
          label="Agenda"
          hint="Optional. What the meeting is for."
          value={agenda}
          error={fieldError(error, 'agenda')}
          onChange={(event) => {
            setAgenda(event.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Date"
            type="date"
            value={day}
            min={localNow().slice(0, 10)}
            onChange={(event) => {
              setDay(event.target.value);
              setError(null);
            }}
          />
          <Input
            label="Start time"
            type="time"
            step={300}
            value={time}
            onChange={(event) => {
              setTime(event.target.value);
              setError(null);
            }}
          />
          <Select
            label="Duration"
            value={String(duration)}
            error={fieldError(error, 'durationMinutes')}
            options={DURATIONS.map((minutes) => ({
              value: String(minutes),
              label: formatDuration(minutes),
            }))}
            onChange={(event) => {
              setDuration(Number(event.target.value));
              setError(null);
            }}
          />
        </div>
        {fieldError(error, 'startsAt') ? (
          <p role="alert" className="-mt-2 text-xs text-danger">
            {fieldError(error, 'startsAt')}
          </p>
        ) : inPast ? (
          <p className="-mt-2 text-xs text-warning">This time has already passed.</p>
        ) : null}
        <Select
          label="Project"
          hint="Optional. What the meeting is about."
          value={projectId}
          error={fieldError(error, 'projectId')}
          options={[
            { value: '', label: 'No project' },
            ...projects.map((project) => ({ value: project.id, label: project.name })),
          ]}
          onChange={(event) => {
            setProjectId(event.target.value as ProjectId | '');
          }}
        />
        <fieldset aria-describedby={participantError ? `${formId}-participants-error` : undefined}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <legend className="text-sm font-medium">
              Invite{' '}
              <span className="font-normal text-muted">· {participants.length} selected</span>
            </legend>
            <button
              type="button"
              className="rounded-sm text-sm font-medium text-accent-strong hover:underline"
              onClick={() => {
                setParticipants(everyone ? [] : team.map((member) => member.employee.id));
                setError(null);
              }}
            >
              {everyone ? 'Clear' : 'Invite everyone'}
            </button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {team.map(({ employee, department, status }) => {
              const checked = participants.includes(employee.id);
              const busy = busyIn(employee.id);
              return (
                <li key={employee.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors hover:border-line-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                      checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface-raised',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        toggle(employee.id, event.target.checked);
                      }}
                      className="size-4 shrink-0 accent-[var(--color-accent)]"
                    />
                    <Avatar avatarId={employee.avatarId} color={department?.color} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{employee.name}</span>
                      {busy ? (
                        <span className="block truncate text-xs text-warning">
                          Busy: in “{busy.title}”
                        </span>
                      ) : (
                        <span className="block truncate text-xs text-muted">{employee.role}</span>
                      )}
                    </span>
                    <StatusIndicator
                      tone={WORK_STATUS[status].tone}
                      label={WORK_STATUS[status].label}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
          {participantError ? (
            <p id={`${formId}-participants-error`} className="mt-2 text-xs text-danger">
              {participantError}
            </p>
          ) : null}
        </fieldset>
      </form>
    </Dialog>
  );
}
