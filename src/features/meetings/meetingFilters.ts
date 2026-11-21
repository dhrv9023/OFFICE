import type { Meeting, WorkspaceState } from '@/domain/types';

export const MEETING_TABS = ['upcoming', 'past', 'cancelled'] as const;
export type MeetingTab = (typeof MEETING_TABS)[number];

export interface MeetingFilters {
  readonly tab: MeetingTab;
  /** Free text over title, agenda, notes, participant names and project name. */
  readonly query: string;
  /** Calendar days `YYYY-MM-DD`, inclusive; empty for no bound. */
  readonly from: string;
  readonly to: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function readMeetingFilters(params: URLSearchParams): MeetingFilters {
  const tab = params.get('tab');
  const day = (value: string | null) => (value && DAY.test(value) ? value : '');
  return {
    tab: MEETING_TABS.find((option) => option === tab) ?? 'upcoming',
    query: params.get('q') ?? '',
    from: day(params.get('from')),
    to: day(params.get('to')),
  };
}

const IN_TAB: Record<MeetingTab, (meeting: Meeting) => boolean> = {
  upcoming: (meeting) => meeting.status === 'scheduled' || meeting.status === 'in_progress',
  past: (meeting) => meeting.status === 'completed',
  cancelled: (meeting) => meeting.status === 'cancelled',
};

/**
 * Meetings for one tab, filtered by text and date. Upcoming: running first, then
 * soonest; held and cancelled: most recent first. Meetings without a time
 * (created before times existed) never match a date range.
 */
export function filterMeetings(
  meetings: readonly Meeting[],
  filters: MeetingFilters,
  workspace: Pick<WorkspaceState, 'employees' | 'projects'>,
): Meeting[] {
  const query = filters.query.trim().toLowerCase();
  const matches = (meeting: Meeting) => {
    if (query === '') return true;
    const people = meeting.participantIds.map((id) => workspace.employees[id]?.name ?? '');
    const project = meeting.projectId ? (workspace.projects[meeting.projectId]?.name ?? '') : '';
    return [meeting.title, meeting.agenda, meeting.notes, project, ...people].some((text) =>
      text.toLowerCase().includes(query),
    );
  };
  const inRange = (meeting: Meeting) => {
    if (filters.from === '' && filters.to === '') return true;
    const day = meeting.startsAt?.slice(0, 10);
    if (!day) return false;
    return (filters.from === '' || day >= filters.from) && (filters.to === '' || day <= filters.to);
  };
  const list = meetings.filter(
    (meeting) => IN_TAB[filters.tab](meeting) && matches(meeting) && inRange(meeting),
  );
  if (filters.tab === 'upcoming') {
    return list.sort(
      (a, b) =>
        Number(b.status === 'in_progress') - Number(a.status === 'in_progress') ||
        (a.startsAt ?? '9999').localeCompare(b.startsAt ?? '9999'),
    );
  }
  return list.sort((a, b) => (b.startsAt ?? b.updatedAt).localeCompare(a.startsAt ?? a.updatedAt));
}
