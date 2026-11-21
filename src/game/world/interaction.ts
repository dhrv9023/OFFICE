import { targetKey, type InteractionTarget } from '@/bridge/gameEvents';
import type { OfficeViewModel } from '@/bridge/officeViewModel';
import type { OfficeLayout } from '@/domain/types';

/** Something the founder can walk up to and interact with. */
export interface Interactable {
  /** Stable key, unique within the office. */
  readonly key: string;
  readonly target: InteractionTarget;
  /** Human name shown in prompts. */
  readonly label: string;
  /** Centre of the object, in tile space. */
  readonly col: number;
  readonly row: number;
  /** How close (in tiles, centre to centre) the founder must be. */
  readonly range: number;
}

/** How strongly facing an object makes it win over a slightly closer one. */
const FACING_BONUS = 0.45;

/**
 * The object the founder would interact with right now: the best-scoring one
 * within range, where score is distance minus a bonus for being in front of them.
 * `facingC`/`facingR` is the direction they face, in tile space (any length).
 */
export function nearestInteractable(
  col: number,
  row: number,
  facingC: number,
  facingR: number,
  items: readonly Interactable[],
): Interactable | null {
  const facingLength = Math.hypot(facingC, facingR) || 1;
  let best: Interactable | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    const dc = item.col - col;
    const dr = item.row - row;
    const distance = Math.hypot(dc, dr);
    if (distance > item.range) continue;
    const alignment =
      distance === 0 ? 1 : (dc * facingC + dr * facingR) / (distance * facingLength);
    const score = distance - FACING_BONUS * Math.max(0, alignment);
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/** How close the founder must be to talk to an employee, in tiles. */
export const EMPLOYEE_RANGE = 1.7;
/** How close the founder must be to a doorway. */
export const DOOR_RANGE = 0.95;

/**
 * Everything interactive in the office: employees at their seats, vacant desks,
 * room entrances and furniture marked with an interaction. Rebuilt only when the
 * view model changes.
 */
export function buildInteractables(layout: OfficeLayout, view: OfficeViewModel): Interactable[] {
  const items: Interactable[] = [];
  const seated = new Set(view.employees.map((employee) => employee.deskId));

  for (const employee of view.employees) {
    items.push({
      key: targetKey({ kind: 'employee', employeeId: employee.id }),
      target: { kind: 'employee', employeeId: employee.id },
      label: employee.name,
      col: employee.seat.col + 0.5,
      row: employee.seat.row + 0.5,
      range: EMPLOYEE_RANGE,
    });
  }
  for (const desk of layout.desks) {
    if (seated.has(desk.id)) continue;
    items.push({
      key: targetKey({ kind: 'desk', deskId: desk.id, employeeId: null }),
      target: { kind: 'desk', deskId: desk.id, employeeId: null },
      label: 'Empty desk',
      col: desk.tile.col + 0.5,
      row: desk.tile.row + 0.5,
      range: EMPLOYEE_RANGE,
    });
  }
  for (const door of layout.doors) {
    const room = layout.rooms.find((candidate) => candidate.id === door.roomId);
    if (!room) continue;
    items.push({
      key: targetKey({ kind: 'room_entrance', roomId: room.id, doorId: door.id }),
      target: { kind: 'room_entrance', roomId: room.id, doorId: door.id },
      label: `${room.name} entrance`,
      col: (door.tile.col + door.opensTo.col) / 2 + 0.5,
      row: (door.tile.row + door.opensTo.row) / 2 + 0.5,
      range: DOOR_RANGE,
    });
  }
  for (const item of layout.furniture) {
    if (!item.interaction) continue;
    items.push({
      key: targetKey({
        kind: 'object',
        objectId: item.id,
        objectKind: item.interaction,
        roomId: item.roomId,
      }),
      target: {
        kind: 'object',
        objectId: item.id,
        objectKind: item.interaction,
        roomId: item.roomId,
      },
      label: item.label,
      col: item.tile.col + item.footprint.cols / 2,
      row: item.tile.row + item.footprint.rows / 2,
      range: Math.max(item.footprint.cols, item.footprint.rows) / 2 + 1.1,
    });
  }
  return items;
}
