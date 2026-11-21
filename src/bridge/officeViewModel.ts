import type { DepartmentId, EmployeeId } from '@/domain/ids';
import { deriveEmployeeStatus } from '@/domain/rules/employeeStatus';
import { deriveEmployeePresence } from '@/domain/rules/meetings';
import type {
  EmployeeWorkStatus,
  Facing,
  Meeting,
  OfficeLayout,
  TileCoord,
  WorkspaceState,
} from '@/domain/types';

/** One employee as the office shows them. */
export interface OfficeEmployee {
  readonly id: EmployeeId;
  /** Display name (renamable). Shown on the name tag. */
  readonly name: string;
  /** Stable appearance key: the character's look never follows the name. */
  readonly avatarId: string;
  readonly role: string;
  readonly departmentId: DepartmentId;
  /** Department colour, e.g. "#e879f9" (shirt colour). */
  readonly color: string;
  readonly status: EmployeeWorkStatus;
  /**
   * Where they are: at their desk, or in a meeting the founder has started.
   * Derived from meetings only (never from the clock); the game just shows it.
   */
  readonly presence: 'at_desk' | 'in_meeting';
  /** Where they sit and which way they face (their desk, or a meeting-room chair). */
  readonly seat: TileCoord;
  readonly facing: Facing;
  readonly deskId: string;
}

/**
 * Everything the office scene needs from application state — and nothing it
 * could write back. Built by a pure function, pushed to the scene whenever the
 * workspace changes; the scene diffs it against its sprites.
 */
export interface OfficeViewModel {
  readonly employees: readonly OfficeEmployee[];
  readonly selectedEmployeeId: EmployeeId | null;
}

/**
 * Meeting-room seats for everyone in a running meeting: the room's chairs in a
 * fixed order, handed out in invitation order. People beyond the chairs stay at
 * their desks (still shown as in a meeting).
 */
export function meetingSeats(
  meetings: readonly Meeting[],
  layout: OfficeLayout,
): ReadonlyMap<EmployeeId, { seat: TileCoord; facing: Facing }> {
  const seats = new Map<EmployeeId, { seat: TileCoord; facing: Facing }>();
  for (const meeting of meetings) {
    if (meeting.status !== 'in_progress') continue;
    const chairs = layout.furniture
      .filter((item) => item.roomId === meeting.roomId && item.kind === 'chair')
      .sort((a, b) => a.id.localeCompare(b.id));
    meeting.participantIds.forEach((employeeId, index) => {
      const chair = chairs[index];
      if (chair) seats.set(employeeId, { seat: chair.tile, facing: chair.facing });
    });
  }
  return seats;
}

export function buildOfficeViewModel(
  state: WorkspaceState,
  layout: OfficeLayout,
  selectedEmployeeId: EmployeeId | null,
): OfficeViewModel {
  const tasks = Object.values(state.tasks);
  const meetings = Object.values(state.meetings);
  const inMeeting = meetingSeats(meetings, layout);
  const employees: OfficeEmployee[] = [];
  for (const employee of Object.values(state.employees)) {
    const desk = layout.desks.find((candidate) => candidate.id === employee.deskId);
    if (!desk) continue;
    const presence = deriveEmployeePresence(employee.id, meetings);
    const chair = inMeeting.get(employee.id);
    employees.push({
      id: employee.id,
      name: employee.name,
      avatarId: employee.avatarId,
      role: employee.role,
      departmentId: employee.departmentId,
      color: state.departments[employee.departmentId]?.color ?? '#9ca5b8',
      status: deriveEmployeeStatus(employee.id, tasks),
      presence: presence.kind,
      seat: chair?.seat ?? desk.seat,
      facing: chair?.facing ?? desk.facing,
      deskId: desk.id,
    });
  }
  return { employees, selectedEmployeeId };
}

/** Whether two view models would render the same office (cheap shallow comparison). */
export function sameOfficeViewModel(a: OfficeViewModel, b: OfficeViewModel): boolean {
  if (a.selectedEmployeeId !== b.selectedEmployeeId || a.employees.length !== b.employees.length) {
    return false;
  }
  return a.employees.every((employee, index) => {
    const other = b.employees[index];
    if (!other) return false;
    return (
      employee.id === other.id &&
      employee.status === other.status &&
      employee.presence === other.presence &&
      employee.seat.col === other.seat.col &&
      employee.seat.row === other.seat.row &&
      employee.facing === other.facing &&
      employee.name === other.name &&
      employee.avatarId === other.avatarId &&
      employee.color === other.color &&
      employee.deskId === other.deskId
    );
  });
}
