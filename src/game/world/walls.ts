import { roomAt } from '@/domain/rules/officeLayout';
import type { OfficeLayout, TileCoord } from '@/domain/types';

/**
 * A wall along one unit edge of the tile grid.
 *  - axis `col`: the edge at col = `at`, from row `index` to `index + 1`
 *    (between tiles (at − 1, index) and (at, index));
 *  - axis `row`: the edge at row = `at`, from col `index` to `index + 1`
 *    (between tiles (index, at − 1) and (index, at)).
 *
 * `kind` drives the cut-away look: `back` walls (the outer north and west edges,
 * furthest from the camera) are drawn tall; `interior` partitions and `front`
 * outer walls are drawn low so they never hide anyone.
 */
export interface WallSegment {
  readonly axis: 'col' | 'row';
  readonly at: number;
  readonly index: number;
  readonly kind: 'back' | 'front' | 'interior';
}

const key = (a: TileCoord, b: TileCoord): string => {
  const [first, second] = a.col + a.row <= b.col + b.row ? [a, b] : [b, a];
  return `${first.col},${first.row}|${second.col},${second.row}`;
};

/**
 * Walls follow room boundaries: every edge between two tiles of different rooms,
 * or between a room and the outside, is a wall — except where a door joins them.
 */
export function deriveWalls(layout: OfficeLayout): WallSegment[] {
  const { cols, rows } = layout.size;
  const doors = new Set(layout.doors.map((door) => key(door.tile, door.opensTo)));
  const roomId = (col: number, row: number) =>
    col < 0 || row < 0 || col >= cols || row >= rows
      ? null
      : (roomAt(layout, { col, row })?.id ?? null);
  const walls: WallSegment[] = [];

  // Edges at col = at (between col at−1 and at).
  for (let at = 0; at <= cols; at++) {
    for (let row = 0; row < rows; row++) {
      const left = roomId(at - 1, row);
      const right = roomId(at, row);
      if (left === right) continue;
      if (doors.has(key({ col: at - 1, row }, { col: at, row }))) continue;
      walls.push({
        axis: 'col',
        at,
        index: row,
        kind: at === 0 ? 'back' : at === cols ? 'front' : 'interior',
      });
    }
  }
  // Edges at row = at (between row at−1 and at).
  for (let at = 0; at <= rows; at++) {
    for (let col = 0; col < cols; col++) {
      const above = roomId(col, at - 1);
      const below = roomId(col, at);
      if (above === below) continue;
      if (doors.has(key({ col, row: at - 1 }, { col, row: at }))) continue;
      walls.push({
        axis: 'row',
        at,
        index: col,
        kind: at === 0 ? 'back' : at === rows ? 'front' : 'interior',
      });
    }
  }
  return walls;
}
