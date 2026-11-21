import { describe, expect, it } from 'vitest';
import { buildOfficeViewModel } from '@/bridge/officeViewModel';
import { createSeedWorkspace, OFFICE_LAYOUT } from '@/domain/seed';
import { present } from '@/test/harness';
import { ISO_GRID } from '../config';
import { footprintDepth, tileCenterToScreen, tileDepth } from '../iso/isoMath';
import { cameraBounds, defaultZoom, stepZoom, worldBounds } from './camera';
import {
  buildCollisionWorld,
  collides,
  CORNER_ASSIST,
  moveWithCollision,
  PERSON_HALF_SIZE,
  WALL_HALF_THICKNESS,
  type MoveResult,
} from './collision';
import { buildInteractables, EMPLOYEE_RANGE, nearestInteractable } from './interaction';
import {
  ACCELERATION_TIME,
  facingFor,
  inputDirection,
  screenDeltaToTile,
  updateVelocity,
  WALK_SPEED,
  type DirectionInput,
  type Vector,
} from './movement';
import { deriveWalls } from './walls';

const walls = deriveWalls(OFFICE_LAYOUT);
const world = buildCollisionWorld(OFFICE_LAYOUT, walls);
const result: MoveResult = { col: 0, row: 0, blockedCol: false, blockedRow: false };

/** Walks in a straight tile-space direction for `steps` frames of `step` tiles. */
function walk(col: number, row: number, dc: number, dr: number, steps = 200, step = 0.04) {
  let c = col;
  let r = row;
  const length = Math.hypot(dc, dr);
  for (let i = 0; i < steps; i++) {
    moveWithCollision(world, c, r, (dc / length) * step, (dr / length) * step, result);
    c = result.col;
    r = result.row;
  }
  return { col: c, row: r };
}

describe('walls', () => {
  it('surrounds the office: tall back walls on the north and west edges, low front walls', () => {
    const count = (kind: string, axis: string, at: number) =>
      walls.filter((wall) => wall.kind === kind && wall.axis === axis && wall.at === at).length;
    expect(count('back', 'row', 0)).toBe(26);
    expect(count('back', 'col', 0)).toBe(18);
    expect(count('front', 'row', 18)).toBe(26);
    expect(count('front', 'col', 26)).toBe(18);
  });

  it('separates rooms but leaves every door open', () => {
    const has = (axis: 'col' | 'row', at: number, index: number) =>
      walls.some((wall) => wall.axis === axis && wall.at === at && wall.index === index);
    // Management (rows 0–6) / corridor (rows 7–9): wall at row 7 except at the door, col 3.
    expect(has('row', 7, 2)).toBe(true);
    expect(has('row', 7, 3)).toBe(false);
    // Management / Design partition at col 6.
    expect(has('col', 6, 3)).toBe(true);
    // No wall inside a room or along the corridor.
    expect(has('col', 2, 1)).toBe(false);
    expect(has('col', 10, 8)).toBe(false);
    for (const door of OFFICE_LAYOUT.doors) {
      const at = Math.max(door.tile.row, door.opensTo.row);
      expect(has('row', at, door.tile.col)).toBe(false);
    }
  });
});

describe('collision', () => {
  const spawn = { col: 2.5, row: 8.5 };

  it('starts the founder on a free spot', () => {
    expect(collides(world, spawn.col, spawn.row)).toBe(false);
  });

  it('walks through a doorway into a room', () => {
    const end = walk(3.5, 8.5, 0, -1);
    expect(end.row).toBeLessThan(6);
    expect(end.col).toBeCloseTo(3.5, 5);
  });

  it('stops flush against a wall where there is no door', () => {
    const end = walk(5.5, 8.5, 0, -1);
    expect(end.row).toBeCloseTo(7 + WALL_HALF_THICKNESS + PERSON_HALF_SIZE, 3);
  });

  it('slides along a wall when pushing into it diagonally', () => {
    const end = walk(13.3, 7.5, 1, -1, 50);
    expect(end.row).toBeCloseTo(7 + WALL_HALF_THICKNESS + PERSON_HALF_SIZE, 3);
    expect(end.col).toBeGreaterThan(14.5);
  });

  it('guides the founder into a doorway when slightly off-centre (corner assist)', () => {
    // The opening spans cols 3–4; the footprint (±0.2) fits when the centre is in 3.2–3.8.
    for (const col of [2.95, 3.1, 3.85, 4.05]) {
      expect(walk(col, 8.5, 0, -1).row).toBeLessThan(6);
    }
  });

  it('slides past the corner of furniture when only just clipping it (along either axis)', () => {
    // The corridor plant fills tile (12, 7). Walking east along row 8.1 clips its corner by 0.1.
    expect(walk(10.5, 8.1, 1, 0, 120).col).toBeGreaterThan(13);
    // The corridor plant fills tile (25, 9). Walking south along col 24.9 clips it by 0.1.
    expect(walk(24.9, 7.5, 0, 1, 120).row).toBeGreaterThan(9.3);
  });

  it('does not pull the founder through a doorway they are clearly beside', () => {
    // Fully beside the opening: more than CORNER_ASSIST away from fitting through it.
    for (const col of [2.8, 4.25]) {
      expect(Math.min(Math.abs(3.2 - col), Math.abs(col - 3.8))).toBeGreaterThan(CORNER_ASSIST);
      expect(walk(col, 8.5, 0, -1).row).toBeGreaterThan(7);
    }
  });

  it('cannot walk through desks, chairs, seated employees or furniture', () => {
    // Management desk at (2,2) with its seat at (2,3): approach from the south.
    expect(walk(2.5, 5.5, 0, -1).row).toBeGreaterThan(4);
    // Meeting table (13–14, 13–14) ringed by chairs: approach from the east.
    expect(walk(16.5, 14.5, -1, 0).col).toBeGreaterThan(15);
  });

  it('cannot leave the office or tunnel through a wall with a huge step', () => {
    expect(walk(0.5, 8.5, -1, 0).col).toBeGreaterThanOrEqual(PERSON_HALF_SIZE);
    moveWithCollision(world, 5.5, 8.5, 0, -5, result);
    expect(result.row).toBeGreaterThan(7);
    expect(result.blockedRow).toBe(true);
  });

  it('never ends up inside anything or stuck, whatever the input (random walk)', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    let c = spawn.col;
    let r = spawn.row;
    const visitedRooms = new Set<string>();
    for (let i = 0; i < 6000; i++) {
      const angle = Math.floor(random() * 8) * (Math.PI / 4);
      for (let frame = 0; frame < 12; frame++) {
        moveWithCollision(world, c, r, Math.cos(angle) * 0.05, Math.sin(angle) * 0.05, result);
        c = result.col;
        r = result.row;
      }
      expect(collides(world, c, r)).toBe(false);
      visitedRooms.add(`${Math.floor(c)},${Math.floor(r)}`);
    }
    // It explored widely rather than getting trapped.
    expect(visitedRooms.size).toBeGreaterThan(100);
  });
});

describe('movement', () => {
  const held = (keys: Partial<DirectionInput>): DirectionInput => ({
    up: false,
    down: false,
    left: false,
    right: false,
    ...keys,
  });
  const v: Vector = { x: 0, y: 0 };

  it('moves at the same on-screen speed in all eight directions', () => {
    const combos: Partial<DirectionInput>[] = [
      { up: true },
      { down: true },
      { left: true },
      { right: true },
      { up: true, right: true },
      { up: true, left: true },
      { down: true, right: true },
      { down: true, left: true },
    ];
    for (const combo of combos) {
      const direction = inputDirection(held(combo), { x: 0, y: 0 });
      expect(direction && Math.hypot(direction.x, direction.y)).toBeCloseTo(1, 10);
      const velocity = { x: 0, y: 0 };
      for (let i = 0; i < 60; i++) updateVelocity(velocity, direction, 1 / 60);
      expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(WALK_SPEED, 6);
    }
  });

  it('maps diagonals onto the floor axes, so they walk straight along corridors', () => {
    const out = { dc: 0, dr: 0 };
    const along = (keys: Partial<DirectionInput>) => {
      const d = inputDirection(held(keys), { x: 0, y: 0 });
      return d ? screenDeltaToTile(d.x, d.y, ISO_GRID, out) : null;
    };
    expect(along({ up: true, right: true })?.dc).toBeCloseTo(0, 10);
    expect(along({ up: true, right: true })?.dr).toBeLessThan(0);
    expect(along({ down: true, right: true })?.dr).toBeCloseTo(0, 10);
    expect(along({ down: true, right: true })?.dc).toBeGreaterThan(0);
    // Straight up the screen moves up both axes equally.
    const up = along({ up: true });
    expect(up?.dc).toBeCloseTo(up?.dr ?? 1, 10);
  });

  it('ignores opposite keys held together', () => {
    expect(inputDirection(held({ up: true, down: true }), v)).toBeNull();
    expect(inputDirection(held({ left: true, right: true, up: true }), { x: 0, y: 0 })).toEqual({
      x: 0,
      y: -1,
    });
  });

  it('ramps up quickly and stops quickly', () => {
    const velocity = { x: 0, y: 0 };
    updateVelocity(velocity, { x: 1, y: 0 }, ACCELERATION_TIME / 2);
    expect(velocity.x).toBeCloseTo(WALK_SPEED / 2, 6);
    updateVelocity(velocity, { x: 1, y: 0 }, 1);
    expect(velocity.x).toBe(WALK_SPEED);
    updateVelocity(velocity, null, 0.1);
    expect(velocity).toEqual({ x: 0, y: 0 });
  });

  it('turns smoothly between the four sprite views', () => {
    expect(facingFor(1, 1, 'back-left')).toBe('front-right');
    expect(facingFor(-1, -1, 'front-right')).toBe('back-left');
    // Straight up keeps the side; straight right keeps front/back.
    expect(facingFor(0, -1, 'front-left')).toBe('back-left');
    expect(facingFor(1, 0, 'back-left')).toBe('back-right');
  });
});

describe('interaction', () => {
  const view = buildOfficeViewModel(createSeedWorkspace(), OFFICE_LAYOUT, null);
  const items = buildInteractables(OFFICE_LAYOUT, view);

  it('lists employees, doors and interactive furniture, but not plain furniture', () => {
    const kinds = items.map((item) => item.target.kind);
    expect(kinds.filter((kind) => kind === 'employee')).toHaveLength(5);
    expect(kinds.filter((kind) => kind === 'room_entrance')).toHaveLength(9);
    expect(items.some((item) => item.label === 'Project board')).toBe(true);
    expect(items.some((item) => item.label === 'Plant')).toBe(false);
    // Every desk is occupied in the seed, so none is offered as an empty desk.
    expect(kinds).not.toContain('desk');
  });

  it('finds the nearest object in range, and nothing when out of range', () => {
    // Standing south of Sarah Chen's desk (seat at 9,3).
    expect(nearestInteractable(9.5, 4.6, 0, -1, items)?.label).toBe('Sarah Chen');
    expect(nearestInteractable(9.5, 4.6 + 3, 0, -1, items)?.label).not.toBe('Sarah Chen');
    expect(nearestInteractable(2.5, 12.0, 0, 1, items)).toBeNull();
  });

  it('offers an employee exactly up to their interaction range (Phase 1.6)', () => {
    const sarah = present(items.find((item) => item.label === 'Sarah Chen'));
    expect(sarah.range).toBe(EMPLOYEE_RANGE);
    const inside = nearestInteractable(sarah.col, sarah.row + EMPLOYEE_RANGE - 0.01, 0, -1, [
      sarah,
    ]);
    const outside = nearestInteractable(sarah.col, sarah.row + EMPLOYEE_RANGE + 0.01, 0, -1, [
      sarah,
    ]);
    expect(inside?.target).toEqual({ kind: 'employee', employeeId: 'emp_sarah_chen' });
    expect(outside).toBeNull();
  });

  it('offers the meeting room when the founder reaches its door (Phase 1.6)', () => {
    // The meeting room door is at column 13, between the corridor (row 9) and the room (row 10).
    const near = nearestInteractable(13.5, 9.5, 0, 1, items);
    expect(near?.target).toMatchObject({ kind: 'room_entrance', roomId: 'room_meeting' });
    expect(near?.label).toBe('Meeting Room entrance');
  });

  it('prefers what the founder is facing over something slightly closer behind them', () => {
    const fake = [
      { ...present(items[0]), key: 'a', label: 'Behind', col: 5.4, row: 5 },
      { ...present(items[0]), key: 'b', label: 'Ahead', col: 5, row: 5.6 },
    ];
    expect(nearestInteractable(5, 5, 0, 1, fake)?.label).toBe('Ahead');
    expect(nearestInteractable(5, 5, 1, 0, fake)?.label).toBe('Behind');
  });
});

describe('camera', () => {
  const bounds = worldBounds(OFFICE_LAYOUT.size, ISO_GRID, 96, 32);

  it('covers the whole office diamond and its back walls', () => {
    const corners = [
      tileCenterToScreen({ col: 0, row: 0 }, ISO_GRID),
      tileCenterToScreen({ col: 25, row: 17 }, ISO_GRID),
      tileCenterToScreen({ col: 0, row: 17 }, ISO_GRID),
      tileCenterToScreen({ col: 25, row: 0 }, ISO_GRID),
    ];
    for (const corner of corners) {
      expect(corner.x).toBeGreaterThan(bounds.x);
      expect(corner.x).toBeLessThan(bounds.x + bounds.width);
      expect(corner.y).toBeGreaterThan(bounds.y + 96);
      expect(corner.y).toBeLessThan(bounds.y + bounds.height);
    }
  });

  it('centres the office when the viewport is bigger than it, at any size', () => {
    const big = cameraBounds(bounds, 4000, 3000, 1);
    expect(big.width).toBe(4000);
    expect(big.x + big.width / 2).toBeCloseTo(bounds.x + bounds.width / 2, 6);
    expect(cameraBounds(bounds, 800, 600, 2)).toEqual(bounds);
  });

  it('picks a sensible starting zoom and steps through integer zoom levels', () => {
    expect(defaultZoom(1200)).toBe(2);
    expect(defaultZoom(360)).toBe(1);
    expect(stepZoom(2, 1)).toBe(3);
    expect(stepZoom(3, 1)).toBe(3);
    expect(stepZoom(1, -1)).toBe(1);
  });
});

describe('depth sorting', () => {
  const table = { col: 13, row: 13 };
  const footprint = { cols: 2, rows: 2 };
  const tableDepth = footprintDepth(table, footprint, 3);

  it('draws people behind multi-tile furniture on its far sides and in front on its near sides', () => {
    expect(tileDepth({ col: 14, row: 12.4 }, 5)).toBeLessThan(tableDepth);
    expect(tileDepth({ col: 12.4, row: 14 }, 5)).toBeLessThan(tableDepth);
    expect(tileDepth({ col: 14, row: 15.6 }, 5)).toBeGreaterThan(tableDepth);
    expect(tileDepth({ col: 15.6, row: 14 }, 5)).toBeGreaterThan(tableDepth);
  });

  it('orders a moving character continuously as they walk down the screen', () => {
    const depths = [0, 0.25, 0.5, 0.75, 1].map((t) => tileDepth({ col: 4 + t, row: 8 + t }, 5));
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
  });
});
