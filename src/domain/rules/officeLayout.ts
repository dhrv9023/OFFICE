import { duplicateId, validationError, type DomainError } from '../errors';
import {
  SEATING_KINDS,
  type Furniture,
  type OfficeLayout,
  type Room,
  type TileCoord,
  type TileRect,
} from '../types/office';

export function rectContains(rect: TileRect, tile: TileCoord): boolean {
  return (
    tile.col >= rect.col &&
    tile.col < rect.col + rect.cols &&
    tile.row >= rect.row &&
    tile.row < rect.row + rect.rows
  );
}

function rectsOverlap(a: TileRect, b: TileRect): boolean {
  return (
    a.col < b.col + b.cols &&
    b.col < a.col + a.cols &&
    a.row < b.row + b.rows &&
    b.row < a.row + a.rows
  );
}

function areAdjacent(a: TileCoord, b: TileCoord): boolean {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
}

const tileKey = (tile: TileCoord): string => `${tile.col},${tile.row}`;

/** Which room a tile belongs to, if any. */
export function roomAt(layout: OfficeLayout, tile: TileCoord): Room | null {
  return layout.rooms.find((room) => rectContains(room.bounds, tile)) ?? null;
}

/**
 * Structural checks on a layout. Returns every problem found (empty = valid):
 * rooms inside the office and not overlapping, doors joining adjacent tiles of the
 * rooms they name, desks and seats inside their room and not colliding, waypoints
 * inside their room on a free tile.
 */
export function validateOfficeLayout(layout: OfficeLayout): DomainError[] {
  const errors: DomainError[] = [];
  const office: TileRect = { col: 0, row: 0, cols: layout.size.cols, rows: layout.size.rows };
  const rooms = new Map<string, Room>();

  for (const room of layout.rooms) {
    if (rooms.has(room.id)) errors.push(duplicateId('room', room.id));
    rooms.set(room.id, room);

    const { bounds } = room;
    const inside =
      bounds.cols > 0 &&
      bounds.rows > 0 &&
      rectContains(office, bounds) &&
      rectContains(office, {
        col: bounds.col + bounds.cols - 1,
        row: bounds.row + bounds.rows - 1,
      });
    if (!inside) errors.push(validationError(room.id, `${room.name} lies outside the office.`));

    if ((room.kind === 'department') !== (room.departmentId !== null)) {
      errors.push(
        validationError(room.id, `${room.name}: only department rooms have a department.`),
      );
    }
  }

  layout.rooms.forEach((a, index) => {
    for (const b of layout.rooms.slice(index + 1)) {
      if (rectsOverlap(a.bounds, b.bounds)) {
        errors.push(validationError(a.id, `${a.name} overlaps ${b.name}.`));
      }
    }
  });

  for (const door of layout.doors) {
    const from = rooms.get(door.roomId);
    const to = rooms.get(door.connectsTo);
    if (!from || !to) {
      errors.push(validationError(door.id, 'Door refers to a room that does not exist.'));
      continue;
    }
    if (!rectContains(from.bounds, door.tile) || !rectContains(to.bounds, door.opensTo)) {
      errors.push(validationError(door.id, 'Door tiles are not inside the rooms they connect.'));
    }
    if (!areAdjacent(door.tile, door.opensTo)) {
      errors.push(validationError(door.id, 'Door tiles must be next to each other.'));
    }
  }

  const occupied = new Map<string, string>();
  const claim = (tile: TileCoord, owner: string): void => {
    const key = tileKey(tile);
    const existing = occupied.get(key);
    if (existing) {
      errors.push(validationError(owner, `Shares tile ${key} with ${existing}.`));
    } else {
      occupied.set(key, owner);
    }
  };

  const deskIds = new Set<string>();
  for (const desk of layout.desks) {
    if (deskIds.has(desk.id)) errors.push(duplicateId('desk', desk.id));
    deskIds.add(desk.id);

    const room = rooms.get(desk.roomId);
    if (!room) {
      errors.push(validationError(desk.id, 'Desk refers to a room that does not exist.'));
      continue;
    }
    if (!rectContains(room.bounds, desk.tile) || !rectContains(room.bounds, desk.seat)) {
      errors.push(validationError(desk.id, `Desk or its seat is outside ${room.name}.`));
    }
    if (!areAdjacent(desk.tile, desk.seat)) {
      errors.push(validationError(desk.id, 'A seat must be next to its desk.'));
    }
    claim(desk.tile, desk.id);
    claim(desk.seat, `${desk.id} seat`);
  }

  for (const waypoint of layout.waypoints) {
    const room = rooms.get(waypoint.roomId);
    if (!room) {
      errors.push(validationError(waypoint.id, 'Waypoint refers to a room that does not exist.'));
      continue;
    }
    if (!rectContains(room.bounds, waypoint.tile)) {
      errors.push(validationError(waypoint.id, `Waypoint is outside ${room.name}.`));
    }
    claim(waypoint.tile, waypoint.id);
  }

  // Door tiles on both sides must stay walkable.
  const doorways = new Set(
    layout.doors.flatMap((door) => [tileKey(door.tile), tileKey(door.opensTo)]),
  );
  const waypointTiles = new Set(layout.waypoints.map((waypoint) => tileKey(waypoint.tile)));
  const furnitureIds = new Set<string>();
  for (const item of layout.furniture) {
    if (furnitureIds.has(item.id)) {
      errors.push(validationError(item.id, `Furniture ID "${item.id}" is used more than once.`));
    }
    furnitureIds.add(item.id);
    const room = rooms.get(item.roomId);
    if (!room) {
      errors.push(validationError(item.id, 'Furniture refers to a room that does not exist.'));
      continue;
    }
    if (item.footprint.cols < 1 || item.footprint.rows < 1) {
      errors.push(validationError(item.id, 'Furniture must cover at least one tile.'));
      continue;
    }
    for (const tile of furnitureTiles(item)) {
      const key = tileKey(tile);
      if (!rectContains(room.bounds, tile)) {
        errors.push(validationError(item.id, `${item.label} sticks out of ${room.name}.`));
        break;
      }
      if (!item.blocking) continue;
      if (doorways.has(key)) {
        errors.push(validationError(item.id, `${item.label} blocks a doorway at ${key}.`));
      }
      if (waypointTiles.has(key)) {
        // A sofa or chair may *be* the seat a waypoint names; anything else may not cover it.
        if (!SEATING_KINDS.includes(item.kind)) {
          errors.push(validationError(item.id, `${item.label} covers waypoint tile ${key}.`));
        }
        continue;
      }
      claim(tile, item.id);
    }
  }

  return errors;
}

/** Every tile a piece of furniture covers. */
export function furnitureTiles(item: Furniture): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let row = item.tile.row; row < item.tile.row + item.footprint.rows; row++) {
    for (let col = item.tile.col; col < item.tile.col + item.footprint.cols; col++) {
      tiles.push({ col, row });
    }
  }
  return tiles;
}
