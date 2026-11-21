import { furnitureTiles } from '@/domain/rules/officeLayout';
import type { OfficeLayout, TileCoord } from '@/domain/types';
import type { WallSegment } from './walls';

/** Axis-aligned box in tile space. */
export interface Box {
  readonly minC: number;
  readonly minR: number;
  readonly maxC: number;
  readonly maxR: number;
}

/** Static collision geometry in tile space, bucketed by tile for cheap queries. */
export interface CollisionWorld {
  readonly cols: number;
  readonly rows: number;
  readonly boxes: readonly Box[];
  /** For each tile (row * cols + col), the indices of boxes touching it. */
  readonly cells: readonly (readonly number[])[];
}

/** Half the thickness of a wall, in tiles. */
export const WALL_HALF_THICKNESS = 0.08;

/** Half the width of a person's footprint, in tiles. */
export const PERSON_HALF_SIZE = 0.2;

const EPSILON = 1e-4;

export function wallBox(wall: WallSegment): Box {
  return wall.axis === 'col'
    ? {
        minC: wall.at - WALL_HALF_THICKNESS,
        maxC: wall.at + WALL_HALF_THICKNESS,
        minR: wall.index,
        maxR: wall.index + 1,
      }
    : {
        minC: wall.index,
        maxC: wall.index + 1,
        minR: wall.at - WALL_HALF_THICKNESS,
        maxR: wall.at + WALL_HALF_THICKNESS,
      };
}

const tileBox = (tile: TileCoord): Box => ({
  minC: tile.col,
  minR: tile.row,
  maxC: tile.col + 1,
  maxR: tile.row + 1,
});

/**
 * Everything a person cannot walk through: walls, blocking furniture, desks and
 * their (occupied) chairs. Built once from layout data; rendering never feeds it.
 */
export function blockedTiles(layout: OfficeLayout): TileCoord[] {
  return [
    ...layout.furniture.filter((item) => item.blocking).flatMap(furnitureTiles),
    ...layout.desks.flatMap((desk) => [desk.tile, desk.seat]),
  ];
}

export function buildCollisionWorld(
  layout: OfficeLayout,
  walls: readonly WallSegment[],
): CollisionWorld {
  const { cols, rows } = layout.size;
  const boxes = [...blockedTiles(layout).map(tileBox), ...walls.map(wallBox)];
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);
  boxes.forEach((box, index) => {
    for (
      let r = Math.max(0, Math.floor(box.minR));
      r <= Math.min(rows - 1, Math.floor(box.maxR - EPSILON));
      r++
    ) {
      for (
        let c = Math.max(0, Math.floor(box.minC));
        c <= Math.min(cols - 1, Math.floor(box.maxC - EPSILON));
        c++
      ) {
        cells[r * cols + c]?.push(index);
      }
    }
  });
  return { cols, rows, boxes, cells };
}

function overlaps(box: Box, c: number, r: number, half: number): boolean {
  return c - half < box.maxC && c + half > box.minC && r - half < box.maxR && r + half > box.minR;
}

/** Calls `visit` for each box near a footprint centred on (c, r). Stops when it returns true. */
function someNearby(
  world: CollisionWorld,
  c: number,
  r: number,
  half: number,
  visit: (box: Box) => boolean,
): boolean {
  const c0 = Math.max(0, Math.floor(c - half - 1));
  const c1 = Math.min(world.cols - 1, Math.floor(c + half + 1));
  const r0 = Math.max(0, Math.floor(r - half - 1));
  const r1 = Math.min(world.rows - 1, Math.floor(r + half + 1));
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const cell = world.cells[row * world.cols + col];
      if (!cell) continue;
      for (const index of cell) {
        const box = world.boxes[index];
        if (box && visit(box)) return true;
      }
    }
  }
  return false;
}

/** Whether a square footprint of half-size `half` centred on (c, r) is blocked or off the map. */
export function collides(
  world: CollisionWorld,
  c: number,
  r: number,
  half = PERSON_HALF_SIZE,
): boolean {
  if (c - half < 0 || r - half < 0 || c + half > world.cols || r + half > world.rows) return true;
  return someNearby(world, c, r, half, (box) => overlaps(box, c, r, half));
}

/** Moves along one axis as far as possible (up to `delta`), stopping flush against obstacles. */
function moveAxis(
  world: CollisionWorld,
  c: number,
  r: number,
  delta: number,
  axis: 'c' | 'r',
  half: number,
): number {
  const start = axis === 'c' ? c : r;
  const target = start + delta;
  const nextC = axis === 'c' ? target : c;
  const nextR = axis === 'r' ? target : r;
  if (!collides(world, nextC, nextR, half)) return target;

  // Find the nearest blocking edge between start and target.
  let limit = target;
  const map = axis === 'c' ? { lo: 0, hi: world.cols } : { lo: 0, hi: world.rows };
  if (delta > 0) limit = Math.min(limit, map.hi - half - EPSILON);
  else limit = Math.max(limit, map.lo + half + EPSILON);
  someNearby(world, nextC, nextR, half, (box) => {
    if (!overlaps(box, nextC, nextR, half)) return false;
    if (axis === 'c') {
      limit =
        delta > 0
          ? Math.min(limit, box.minC - half - EPSILON)
          : Math.max(limit, box.maxC + half + EPSILON);
    } else {
      limit =
        delta > 0
          ? Math.min(limit, box.minR - half - EPSILON)
          : Math.max(limit, box.maxR + half + EPSILON);
    }
    return false;
  });
  // Never move backwards because of an obstacle we were already touching.
  return delta > 0 ? Math.max(start, limit) : Math.min(start, limit);
}

/** How far sideways a blocked person is nudged to slip past a corner or into a doorway. */
export const CORNER_ASSIST = 0.3;
const ASSIST_STEP = 0.02;

/**
 * Finds the smallest sideways shift (within CORNER_ASSIST) that lets the person
 * continue along `axis`, or 0 if there is none.
 */
function cornerAssist(
  world: CollisionWorld,
  c: number,
  r: number,
  delta: number,
  axis: 'c' | 'r',
  half: number,
): number {
  const probe = Math.sign(delta) * Math.max(Math.abs(delta), 0.05);
  for (let shift = ASSIST_STEP; shift <= CORNER_ASSIST + 1e-9; shift += ASSIST_STEP) {
    for (const offset of [shift, -shift]) {
      const sideC = axis === 'c' ? c : c + offset;
      const sideR = axis === 'r' ? r : r + offset;
      const aheadC = axis === 'c' ? c + probe : sideC;
      const aheadR = axis === 'r' ? r + probe : sideR;
      if (!collides(world, sideC, sideR, half) && !collides(world, aheadC, aheadR, half)) {
        return offset;
      }
    }
  }
  return 0;
}

export interface MoveResult {
  col: number;
  row: number;
  /** True when movement along that axis was cut short. */
  blockedCol: boolean;
  blockedRow: boolean;
}

/**
 * Moves a person by (dc, dr) in tile space with collision:
 *  - each axis is resolved separately, so pushing diagonally into a wall slides
 *    along it instead of stopping;
 *  - long moves are split into small steps so nothing can be skipped through;
 *  - when walking straight into a corner or just beside a doorway, the person is
 *    nudged sideways (at walking speed) so they slip past instead of snagging.
 * Writes into `out` to avoid allocating every frame.
 */
export function moveWithCollision(
  world: CollisionWorld,
  col: number,
  row: number,
  dc: number,
  dr: number,
  out: MoveResult,
  half = PERSON_HALF_SIZE,
): MoveResult {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dc), Math.abs(dr)) / 0.1));
  const sc = dc / steps;
  const sr = dr / steps;
  let c = col;
  let r = row;
  let blockedCol = false;
  let blockedRow = false;
  for (let i = 0; i < steps; i++) {
    if (sc !== 0) {
      const next = moveAxis(world, c, r, sc, 'c', half);
      if (Math.abs(next - (c + sc)) > 1e-9) {
        blockedCol = true;
        if (sr === 0) {
          const offset = cornerAssist(world, next, r, sc, 'c', half);
          if (offset !== 0)
            r = moveAxis(
              world,
              next,
              r,
              Math.sign(offset) * Math.min(Math.abs(sc), Math.abs(offset)),
              'r',
              half,
            );
        }
      }
      c = next;
    }
    if (sr !== 0) {
      const next = moveAxis(world, c, r, sr, 'r', half);
      if (Math.abs(next - (r + sr)) > 1e-9) {
        blockedRow = true;
        if (sc === 0) {
          const offset = cornerAssist(world, c, next, sr, 'r', half);
          if (offset !== 0)
            c = moveAxis(
              world,
              c,
              next,
              Math.sign(offset) * Math.min(Math.abs(sr), Math.abs(offset)),
              'c',
              half,
            );
        }
      }
      r = next;
    }
  }
  out.col = c;
  out.row = r;
  out.blockedCol = blockedCol;
  out.blockedRow = blockedRow;
  return out;
}
