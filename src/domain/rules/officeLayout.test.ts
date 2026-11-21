import { describe, expect, it } from 'vitest';
import type { Furniture } from '../types/office';
import { OFFICE_LAYOUT } from '../seed';
import type { OfficeLayout } from '../types/office';
import { furnitureTiles, rectContains, roomAt, validateOfficeLayout } from './officeLayout';

const messages = (layout: OfficeLayout): string[] =>
  validateOfficeLayout(layout).map((error) => error.message);

describe('rectContains', () => {
  const rect = { col: 2, row: 3, cols: 2, rows: 2 };

  it('includes the top-left tile and excludes the far edges', () => {
    expect(rectContains(rect, { col: 2, row: 3 })).toBe(true);
    expect(rectContains(rect, { col: 3, row: 4 })).toBe(true);
    expect(rectContains(rect, { col: 4, row: 3 })).toBe(false);
    expect(rectContains(rect, { col: 2, row: 5 })).toBe(false);
    expect(rectContains(rect, { col: 1, row: 3 })).toBe(false);
  });
});

describe('roomAt', () => {
  it('finds the room containing a tile', () => {
    expect(roomAt(OFFICE_LAYOUT, { col: 0, row: 0 })?.id).toBe('room_management');
    expect(roomAt(OFFICE_LAYOUT, { col: 12, row: 8 })?.id).toBe('room_corridor');
    expect(roomAt(OFFICE_LAYOUT, { col: 25, row: 17 })?.id).toBe('room_lounge');
    expect(roomAt(OFFICE_LAYOUT, { col: 26, row: 0 })).toBeNull();
  });
});

describe('validateOfficeLayout', () => {
  it('accepts the seed layout', () => {
    expect(validateOfficeLayout(OFFICE_LAYOUT)).toEqual([]);
  });

  it('rejects overlapping rooms', () => {
    const [first, second, ...rest] = OFFICE_LAYOUT.rooms;
    if (!first || !second) throw new Error('seed layout needs two rooms');
    const layout = {
      ...OFFICE_LAYOUT,
      rooms: [first, { ...second, bounds: first.bounds }, ...rest],
    };
    expect(messages(layout)).toContainEqual(expect.stringContaining('overlaps'));
  });

  it('rejects a room outside the office', () => {
    const layout = {
      ...OFFICE_LAYOUT,
      rooms: OFFICE_LAYOUT.rooms.map((room) =>
        room.id === 'room_lounge' ? { ...room, bounds: { ...room.bounds, cols: 6 } } : room,
      ),
    };
    expect(messages(layout)).toContainEqual(expect.stringContaining('outside the office'));
  });

  it('rejects duplicate room and desk IDs', () => {
    const layout = {
      ...OFFICE_LAYOUT,
      rooms: [...OFFICE_LAYOUT.rooms, ...OFFICE_LAYOUT.rooms.slice(0, 1)],
      desks: [...OFFICE_LAYOUT.desks, ...OFFICE_LAYOUT.desks.slice(0, 1)],
    };
    const codes = validateOfficeLayout(layout).map((error) => error.code);
    expect(codes.filter((code) => code === 'duplicate_id')).toHaveLength(2);
  });

  it('rejects a desk outside its room and a seat that is not beside its desk', () => {
    const layout = {
      ...OFFICE_LAYOUT,
      desks: OFFICE_LAYOUT.desks.map((desk) =>
        desk.id === 'desk_design_1'
          ? { ...desk, tile: { col: 0, row: 0 }, seat: { col: 9, row: 5 } }
          : desk,
      ),
    };
    expect(messages(layout)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('outside UI/UX Design'),
        expect.stringContaining('next to its desk'),
      ]),
    );
  });

  it('rejects two things on one tile', () => {
    const [first] = OFFICE_LAYOUT.desks;
    if (!first) throw new Error('seed layout needs a desk');
    const layout = {
      ...OFFICE_LAYOUT,
      waypoints: [
        { id: 'wp_clash', roomId: first.roomId, kind: 'break_spot' as const, tile: first.seat },
      ],
    };
    expect(messages(layout)).toContainEqual(expect.stringContaining('Shares tile'));
  });

  it('rejects a door whose tiles are not adjacent or not in the named rooms', () => {
    const layout = {
      ...OFFICE_LAYOUT,
      doors: [
        {
          id: 'door_bad',
          roomId: 'room_management' as const,
          tile: { col: 3, row: 5 },
          connectsTo: 'room_corridor' as const,
          opensTo: { col: 3, row: 7 },
        },
        {
          id: 'door_wrong_room',
          roomId: 'room_qa' as const,
          tile: { col: 3, row: 6 },
          connectsTo: 'room_corridor' as const,
          opensTo: { col: 3, row: 7 },
        },
        {
          id: 'door_ghost',
          roomId: 'room_ghost' as const,
          tile: { col: 3, row: 6 },
          connectsTo: 'room_corridor' as const,
          opensTo: { col: 3, row: 7 },
        },
      ],
    };
    expect(messages(layout)).toEqual([
      'Door tiles must be next to each other.',
      'Door tiles are not inside the rooms they connect.',
      'Door refers to a room that does not exist.',
    ]);
  });

  it('rejects a non-department room that claims a department', () => {
    const layout = {
      ...OFFICE_LAYOUT,
      rooms: OFFICE_LAYOUT.rooms.map((room) =>
        room.id === 'room_break' ? { ...room, departmentId: 'dept_qa' as const } : room,
      ),
    };
    expect(messages(layout)).toContainEqual(expect.stringContaining('only department rooms'));
  });
});

describe('furniture validation', () => {
  const base = OFFICE_LAYOUT;
  const withFurniture = (extra: Partial<Furniture> & Pick<Furniture, 'id'>): OfficeLayout => ({
    ...base,
    furniture: [
      ...base.furniture,
      {
        kind: 'plant',
        roomId: 'room_corridor',
        tile: { col: 5, row: 8 },
        footprint: { cols: 1, rows: 1 },
        facing: 'south',
        blocking: true,
        label: 'Test item',
        interaction: null,
        ...extra,
      },
    ],
  });
  const messages = (layout: OfficeLayout) => validateOfficeLayout(layout).map((e) => e.message);

  it('accepts the seed furniture', () => {
    expect(base.furniture.length).toBeGreaterThan(40);
    expect(validateOfficeLayout(base)).toEqual([]);
  });

  it('rejects furniture that blocks a doorway on either side', () => {
    expect(messages(withFurniture({ id: 'x', tile: { col: 3, row: 7 } }))).toEqual([
      'Test item blocks a doorway at 3,7.',
    ]);
    expect(
      messages(withFurniture({ id: 'y', roomId: 'room_management', tile: { col: 3, row: 6 } })),
    ).toEqual(['Test item blocks a doorway at 3,6.']);
  });

  it('lets seating sit on a waypoint but nothing else', () => {
    expect(
      messages(withFurniture({ id: 'x', roomId: 'room_reception', tile: { col: 2, row: 13 } })),
    ).toEqual(['Test item covers waypoint tile 2,13.']);
    expect(
      validateOfficeLayout(
        withFurniture({
          id: 'x',
          kind: 'chair',
          roomId: 'room_reception',
          tile: { col: 2, row: 13 },
        }),
      ),
    ).toEqual([]);
  });

  it('rejects furniture outside its room, overlapping a desk or other furniture, or duplicated', () => {
    expect(
      messages(
        withFurniture({ id: 'x', tile: { col: 25, row: 9 }, footprint: { cols: 2, rows: 1 } }),
      ),
    ).toContain('Test item sticks out of Corridor.');
    expect(
      messages(withFurniture({ id: 'x', roomId: 'room_management', tile: { col: 2, row: 3 } })),
    ).toEqual(['Shares tile 2,3 with desk_management_1 seat.']);
    expect(
      messages(
        withFurniture({ id: 'mgmt_plant', roomId: 'room_management', tile: { col: 1, row: 5 } }),
      ),
    ).toEqual(['Furniture ID "mgmt_plant" is used more than once.']);
  });

  it('ignores walk-through furniture for collisions with other things', () => {
    expect(
      validateOfficeLayout(withFurniture({ id: 'rug', blocking: false, tile: { col: 3, row: 7 } })),
    ).toEqual([]);
  });

  it('lists every tile a footprint covers', () => {
    const table = base.furniture.find((f) => f.id === 'meeting_table');
    expect(table && furnitureTiles(table)).toEqual([
      { col: 13, row: 13 },
      { col: 14, row: 13 },
      { col: 13, row: 14 },
      { col: 14, row: 14 },
    ]);
  });
});
