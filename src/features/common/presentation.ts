import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { Tone } from '@/components/Badge';
import {
  TASK_STATUS_LABELS,
  type EmployeeWorkStatus,
  type NotificationType,
  type Priority,
  type ProjectCategory,
  type ProjectStatus,
  type TaskStatus,
} from '@/domain/types';

/*
 * How domain values are shown. Labels and colours only — no rules. Colour is
 * always paired with a text label.
 *
 * One status language across the app (Phase 1.5.2):
 *   amber  active work (working, in progress) — the office's own colour
 *   cyan   waiting for review
 *   red    blocked
 *   green  done
 *   grey   idle, to do, planning, archived
 */

export const WORK_STATUS: Record<EmployeeWorkStatus, { label: string; tone: Tone }> = {
  working: { label: 'Working', tone: 'accent' },
  reviewing: { label: 'In review', tone: 'secondary' },
  blocked: { label: 'Blocked', tone: 'danger' },
  idle: { label: 'Available', tone: 'neutral' },
};

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  planning: { label: 'Planning', tone: 'neutral' },
  active: { label: 'Active', tone: 'accent' },
  on_hold: { label: 'On hold', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  archived: { label: 'Archived', tone: 'neutral' },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'neutral' },
  high: { label: 'High', tone: 'warning' },
  critical: { label: 'Critical', tone: 'danger' },
};

export const NOTIFICATION_ICONS: Record<NotificationType, { icon: LucideIcon; className: string }> =
  {
    info: { icon: Info, className: 'text-secondary' },
    success: { icon: CircleCheck, className: 'text-success' },
    warning: { icon: TriangleAlert, className: 'text-warning' },
    error: { icon: CircleAlert, className: 'text-danger' },
  };

const deadlineFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/** "31 Dec" for a `YYYY-MM-DD` calendar day (not an instant, so no time-zone shift). */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return deadlineFormat.format(new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1));
}

/** "Due 31 Dec" for a `YYYY-MM-DD` deadline (a calendar day, not an instant). */
export function formatDeadline(deadline: string): string {
  return `Due ${formatDay(deadline)}`;
}

export const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  todo: { label: TASK_STATUS_LABELS.todo, tone: 'neutral' },
  in_progress: { label: TASK_STATUS_LABELS.in_progress, tone: 'accent' },
  in_review: { label: TASK_STATUS_LABELS.in_review, tone: 'secondary' },
  blocked: { label: TASK_STATUS_LABELS.blocked, tone: 'danger' },
  done: { label: TASK_STATUS_LABELS.done, tone: 'success' },
  cancelled: { label: TASK_STATUS_LABELS.cancelled, tone: 'neutral' },
};

export const PROJECT_CATEGORY: Record<ProjectCategory, string> = {
  web_app: 'Web app',
  mobile_app: 'Mobile app',
  website: 'Website',
  api_service: 'API service',
  internal_tool: 'Internal tool',
  other: 'Other',
};

/** Verb phrases for moving a project to each status (the lifecycle itself is in the domain). */
export const PROJECT_STATUS_ACTION: Record<ProjectStatus, string> = {
  planning: 'Move back to planning',
  active: 'Activate project',
  on_hold: 'Put on hold',
  completed: 'Mark as completed',
  archived: 'Archive project',
};

/** Wording for leaving a particular status, where the generic verb reads oddly. */
export function projectActionLabel(from: ProjectStatus, to: ProjectStatus): string {
  if (from === 'on_hold' && to === 'active') return 'Resume project';
  if (from === 'completed' && to === 'active') return 'Reopen project';
  if (from === 'archived' && to === 'active') return 'Restore as active';
  if (from === 'archived' && to === 'planning') return 'Restore to planning';
  return PROJECT_STATUS_ACTION[to];
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** Today as `YYYY-MM-DD` in the user's time zone (deadlines are calendar days). */
export function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const meetingDay = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const meetingClock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/** A local `YYYY-MM-DDTHH:mm` as a Date in the browser's zone (it has no zone of its own). */
function localDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map<number>(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
}

/** "Tue 1 Dec · 10:00–11:00", or "No time set" for meetings created before times existed. */
export function formatMeetingTime(startsAt: string | null, durationMinutes: number | null): string {
  const start = startsAt ? localDate(startsAt) : null;
  if (!start || durationMinutes === null) return 'No time set';
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return `${meetingDay.format(start)} · ${meetingClock.format(start)}–${meetingClock.format(end)}`;
}

/** "1 h 30 min" style duration. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

/** The browser's local time now, as `YYYY-MM-DDTHH:mm`. */
export function localNow(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
