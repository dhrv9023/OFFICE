import { CalendarClock, FolderKanban } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { MEETING_STATUS_LABELS, type Meeting, type WorkspaceState } from '@/domain/types';
import { formatMeetingTime } from '@/features/common/presentation';

const TONE = {
  scheduled: 'neutral',
  in_progress: 'accent',
  completed: 'success',
  cancelled: 'neutral',
} as const;

/**
 * One meeting at a glance: title and status, when, what project, who. Shared by
 * the meeting room and employee profiles. Status is always written out, never
 * shown by colour alone.
 */
export function MeetingSummary({
  meeting,
  workspace,
  showNotes = false,
}: {
  meeting: Meeting;
  workspace: WorkspaceState;
  showNotes?: boolean;
}) {
  const people = meeting.participantIds
    .map((id) => workspace.employees[id])
    .filter((employee) => employee !== undefined);
  const project = meeting.projectId ? workspace.projects[meeting.projectId] : undefined;
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{meeting.title}</p>
        <Badge tone={TONE[meeting.status]}>{MEETING_STATUS_LABELS[meeting.status]}</Badge>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {formatMeetingTime(meeting.startsAt, meeting.durationMinutes)}
        </span>
        {project ? (
          <span className="inline-flex items-center gap-1.5">
            <FolderKanban className="size-3.5" aria-hidden="true" />
            {project.name}
          </span>
        ) : null}
      </p>
      {meeting.agenda ? <p className="mt-1 text-sm text-muted">{meeting.agenda}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <span className="flex -space-x-1" aria-hidden="true">
          {people.map((employee) => (
            <Avatar
              key={employee.id}
              avatarId={employee.avatarId}
              color={workspace.departments[employee.departmentId]?.color}
              size="sm"
              className="ring-2 ring-surface"
            />
          ))}
        </span>
        <span className="min-w-0 text-xs text-muted">
          {people.map((employee) => employee.name).join(', ')}
        </span>
      </div>
      {showNotes && meeting.notes ? (
        <div className="mt-2 rounded-md bg-surface-raised px-3 py-2">
          <p className="text-xs font-medium text-muted">Notes</p>
          <p className="mt-0.5 text-sm whitespace-pre-line">{meeting.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
