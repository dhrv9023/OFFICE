import { CalendarDays, CalendarPlus, FilterX, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { commands } from '@/commands';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/Field';
import { Page } from '@/components/Page';
import { Tabs } from '@/components/Tabs';
import { RelativeTime } from '@/components/time';
import { OFFICE_LAYOUT } from '@/domain/seed';
import { USER_ACTOR, type Meeting, type WorkspaceState } from '@/domain/types';
import { reportCommand } from '@/features/common/commandFeedback';
import { useWorkspace } from '@/stores/workspace';
import { CompleteMeetingDialog } from './CompleteMeetingDialog';
import {
  filterMeetings,
  MEETING_TABS,
  readMeetingFilters,
  type MeetingTab,
} from './meetingFilters';
import { MeetingSummary } from './MeetingSummary';
import { ScheduleMeetingDialog } from './ScheduleMeetingDialog';

const MEETING_ROOM = OFFICE_LAYOUT.rooms.find((room) => room.kind === 'meeting');

const TAB_LABELS: Record<MeetingTab, string> = {
  upcoming: 'Upcoming',
  past: 'Held',
  cancelled: 'Cancelled',
};

/**
 * Every meeting, outside the office: the same records and the same commands as
 * the meeting room, so both always show the same state.
 */
export function MeetingsPage() {
  const workspace = useWorkspace((state) => state);
  const [params, setParams] = useSearchParams();
  const filters = readMeetingFilters(params);
  const [scheduling, setScheduling] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [completing, setCompleting] = useState<Meeting | null>(null);
  const [cancelling, setCancelling] = useState<Meeting | null>(null);
  const [details, setDetails] = useState<Meeting | null>(null);

  const all = Object.values(workspace.meetings);
  const { query, from, to, tab } = filters;
  const counts = useMemo(
    () =>
      Object.fromEntries(
        MEETING_TABS.map((id) => [
          id,
          filterMeetings(all, { query: '', from: '', to: '', tab: id }, workspace).length,
        ]),
      ) as Record<MeetingTab, number>,
    [all, workspace],
  );
  const visible = useMemo(
    () => filterMeetings(all, { query, from, to, tab }, workspace),
    [all, query, from, to, tab, workspace],
  );

  const set = (key: string, value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === '') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };
  const filtered = query !== '' || from !== '' || to !== '';
  const live = (meeting: Meeting | null) =>
    meeting ? (workspace.meetings[meeting.id] ?? null) : null;

  const list = (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_11rem_11rem_auto] sm:items-end">
        <div className="relative">
          <Search
            className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-subtle"
            aria-hidden="true"
          />
          <Input
            label="Search meetings"
            hideLabel
            type="search"
            placeholder="Search title, agenda, notes, people…"
            className="pl-9"
            value={query}
            onChange={(event) => {
              set('q', event.target.value);
            }}
          />
        </div>
        <Input
          label="From"
          type="date"
          value={from}
          onChange={(event) => {
            set('from', event.target.value);
          }}
        />
        <Input
          label="To"
          type="date"
          value={to}
          onChange={(event) => {
            set('to', event.target.value);
          }}
        />
        {filtered ? (
          <Button
            variant="ghost"
            icon={FilterX}
            onClick={() => {
              setParams(tab === 'upcoming' ? {} : { tab }, { replace: true });
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {filtered
          ? `${String(visible.length)} of ${String(counts[tab])} match`
          : `${String(visible.length)} ${visible.length === 1 ? 'meeting' : 'meetings'}`}
      </p>
      {visible.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarDays}
          title={filtered ? 'No matching meetings' : `No ${TAB_LABELS[tab].toLowerCase()} meetings`}
          description={
            filtered
              ? 'Try other words or dates.'
              : tab === 'upcoming'
                ? 'Schedule one here, or from the meeting room in the office.'
                : 'They appear here once they happen.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((meeting) => (
            <li key={meeting.id}>
              <Card className="p-4 sm:p-5">
                <MeetingSummary
                  meeting={meeting}
                  workspace={workspace}
                  showNotes={meeting.status === 'completed'}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDetails(meeting);
                    }}
                  >
                    Details
                  </Button>
                  {meeting.status === 'scheduled' ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditing(meeting);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          reportCommand(
                            commands.startMeeting(USER_ACTOR, { meetingId: meeting.id }),
                            {
                              title: 'Meeting started',
                              description: `"${meeting.title}". Participants are shown in the meeting room.`,
                            },
                          );
                        }}
                      >
                        Start
                      </Button>
                    </>
                  ) : null}
                  {meeting.status === 'scheduled' || meeting.status === 'in_progress' ? (
                    <Button
                      size="sm"
                      variant={meeting.status === 'in_progress' ? 'primary' : 'secondary'}
                      onClick={() => {
                        setCompleting(meeting);
                      }}
                    >
                      Mark as held
                    </Button>
                  ) : null}
                  {meeting.status === 'scheduled' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCancelling(meeting);
                      }}
                    >
                      Cancel meeting
                    </Button>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Page
      title="Meetings"
      description="Every meeting, upcoming and past, with who took part and what was decided. The same meetings as the office’s meeting room."
      actions={
        MEETING_ROOM ? (
          <Button
            variant="primary"
            icon={CalendarPlus}
            onClick={() => {
              setScheduling(true);
            }}
          >
            Schedule meeting
          </Button>
        ) : null
      }
    >
      <div className="max-w-3xl">
        <Tabs
          label="Meetings"
          value={tab}
          onChange={(id) => {
            set('tab', id === 'upcoming' ? '' : id);
          }}
          tabs={MEETING_TABS.map((id) => ({
            id,
            label: `${TAB_LABELS[id]} · ${String(counts[id])}`,
            content: id === tab ? list : null,
          }))}
        />
      </div>

      {MEETING_ROOM ? (
        <ScheduleMeetingDialog
          open={scheduling || editing !== null}
          roomId={MEETING_ROOM.id}
          roomName={MEETING_ROOM.name}
          meeting={live(editing) ?? undefined}
          onClose={() => {
            setScheduling(false);
            setEditing(null);
          }}
        />
      ) : null}
      <CompleteMeetingDialog
        meeting={live(completing)}
        onClose={() => {
          setCompleting(null);
        }}
      />
      <ConfirmDialog
        open={cancelling !== null}
        title="Cancel this meeting?"
        description={`"${cancelling?.title ?? ''}" will be marked as cancelled and its people released. The record stays in the history.`}
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
      <MeetingDetailsDialog
        meeting={live(details)}
        workspace={workspace}
        onClose={() => {
          setDetails(null);
        }}
      />
    </Page>
  );
}

function MeetingDetailsDialog({
  meeting,
  workspace,
  onClose,
}: {
  meeting: Meeting | null;
  workspace: WorkspaceState;
  onClose: () => void;
}) {
  if (!meeting) return null;
  const history = workspace.activity.filter((event) => event.meetingId === meeting.id).reverse();
  const room = OFFICE_LAYOUT.rooms.find((candidate) => candidate.id === meeting.roomId);
  return (
    <Dialog open onClose={onClose} size="lg" title={meeting.title} description={room?.name}>
      <div className="flex flex-col gap-5">
        <MeetingSummary meeting={meeting} workspace={workspace} showNotes />
        {!meeting.notes && meeting.status === 'completed' ? (
          <p className="text-sm text-muted">No notes were recorded.</p>
        ) : null}
        <section>
          <h3 className="mb-2 text-sm font-medium">History</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted">Nothing recorded yet.</p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {history.map((event) => (
                <li key={event.id} className="text-sm">
                  <p>{event.description}</p>
                  <RelativeTime iso={event.timestamp} className="text-xs text-muted" />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Dialog>
  );
}
