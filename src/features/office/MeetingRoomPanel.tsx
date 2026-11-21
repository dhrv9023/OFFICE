import { CalendarPlus, Presentation } from 'lucide-react';
import { useMemo, useState } from 'react';
import { commands } from '@/commands';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { RoomId } from '@/domain/ids';
import { OFFICE_LAYOUT } from '@/domain/seed';
import { USER_ACTOR, type Meeting, type WorkspaceState } from '@/domain/types';
import { reportCommand } from '@/features/common/commandFeedback';
import { CompleteMeetingDialog } from '@/features/meetings/CompleteMeetingDialog';
import { MeetingSummary } from '@/features/meetings/MeetingSummary';
import { ScheduleMeetingDialog } from '@/features/meetings/ScheduleMeetingDialog';
import { Header, Section } from './inspectorParts';

const RECENT = 3;

/** Earliest first; meetings without a time (created before times existed) last. */
function byStart(a: Meeting, b: Meeting): number {
  if (a.startsAt === b.startsAt) return a.createdAt.localeCompare(b.createdAt);
  if (a.startsAt === null) return 1;
  if (b.startsAt === null) return -1;
  return a.startsAt.localeCompare(b.startsAt);
}

/**
 * The meeting room, as a working space: schedule a meeting with chosen people,
 * see what is coming up, and record the outcome afterwards. Meetings are records
 * the founder keeps; nobody walks to the room or speaks on their own (no agents
 * and no movement in this phase).
 */
export function MeetingRoomPanel({
  roomId,
  workspace,
}: {
  roomId: RoomId;
  workspace: WorkspaceState;
}) {
  const room = OFFICE_LAYOUT.rooms.find((candidate) => candidate.id === roomId);
  const [scheduling, setScheduling] = useState(false);
  const [completing, setCompleting] = useState<Meeting | null>(null);
  const [cancelling, setCancelling] = useState<Meeting | null>(null);

  const seats = OFFICE_LAYOUT.furniture.filter(
    (item) => item.roomId === roomId && item.kind === 'chair',
  ).length;
  const { running, upcoming, past } = useMemo(() => {
    const here = Object.values(workspace.meetings).filter((meeting) => meeting.roomId === roomId);
    return {
      running: here.filter((meeting) => meeting.status === 'in_progress'),
      upcoming: here
        .filter((meeting) => meeting.status === 'scheduled')
        .sort((a, b) => byStart(a, b)),
      past: here
        .filter((meeting) => meeting.status !== 'scheduled')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, RECENT),
    };
  }, [workspace.meetings, roomId]);

  if (!room)
    return <Header icon={Presentation} title="Room" subtitle="This room no longer exists." />;

  return (
    <>
      <Header
        icon={Presentation}
        title={room.name}
        subtitle={`${String(seats)} seats around a shared table, with a screen for presentations.`}
      />
      <Section>
        <Button
          variant="primary"
          icon={CalendarPlus}
          className="w-full justify-start"
          onClick={() => {
            setScheduling(true);
          }}
        >
          Schedule a meeting
        </Button>
        <p className="mt-2 text-xs text-muted">
          Pick a time and who to invite. Start it when it begins, and record what was decided
          afterwards. Nothing starts or ends on its own.
        </p>
      </Section>

      {running.length > 0 ? (
        <Section title="In progress">
          <ul className="flex flex-col gap-4">
            {running.map((meeting) => (
              <li key={meeting.id}>
                <MeetingSummary meeting={meeting} workspace={workspace} />
                <Button
                  size="sm"
                  variant="primary"
                  className="mt-2.5"
                  onClick={() => {
                    setCompleting(meeting);
                  }}
                >
                  Mark as held
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={`Upcoming · ${String(upcoming.length)}`}>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">Nothing scheduled in this room.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {upcoming.map((meeting) => (
              <li key={meeting.id}>
                <MeetingSummary meeting={meeting} workspace={workspace} />
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      reportCommand(commands.startMeeting(USER_ACTOR, { meetingId: meeting.id }), {
                        title: 'Meeting started',
                        description: `"${meeting.title}". Participants are shown in the meeting room.`,
                      });
                    }}
                  >
                    Start
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCompleting(meeting);
                    }}
                  >
                    Mark as held
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCancelling(meeting);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {past.length > 0 ? (
        <Section title="Recent">
          <ul className="flex flex-col gap-4">
            {past.map((meeting) => (
              <li key={meeting.id}>
                <MeetingSummary meeting={meeting} workspace={workspace} showNotes />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <ScheduleMeetingDialog
        open={scheduling}
        roomId={room.id}
        roomName={room.name}
        onClose={() => {
          setScheduling(false);
        }}
      />
      <CompleteMeetingDialog
        meeting={completing}
        onClose={() => {
          setCompleting(null);
        }}
      />
      <ConfirmDialog
        open={cancelling !== null}
        title="Cancel this meeting?"
        description={`"${cancelling?.title ?? ''}" will be marked as cancelled. The record stays in the history.`}
        confirmLabel="Cancel meeting"
        cancelLabel="Keep it"
        tone="danger"
        onCancel={() => {
          setCancelling(null);
        }}
        onConfirm={() => {
          if (cancelling) {
            reportCommand(commands.cancelMeeting(USER_ACTOR, { meetingId: cancelling.id }), {
              title: 'Meeting cancelled',
              description: `"${cancelling.title}"`,
            });
          }
          setCancelling(null);
        }}
      />
    </>
  );
}
