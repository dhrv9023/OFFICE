import type { DepartmentId, DeskId, RoomId } from '../ids';

/**
 * Office layout, expressed entirely in isometric *tile* coordinates
 * (col grows towards screen bottom-right, row towards bottom-left).
 * No pixels here: projection to the screen is the rendering layer's job.
 */
export interface TileCoord {
  readonly col: number;
  readonly row: number;
}

/** Rectangle of tiles: `cols` × `rows` tiles starting at (`col`, `row`). */
export interface TileRect extends TileCoord {
  readonly cols: number;
  readonly rows: number;
}

/** Direction in tile space: north = row−1, south = row+1, east = col+1, west = col−1. */
export type Facing = 'north' | 'east' | 'south' | 'west';

export type RoomKind = 'department' | 'meeting' | 'break' | 'lounge' | 'reception' | 'corridor';

export interface Room {
  readonly id: RoomId;
  readonly name: string;
  readonly kind: RoomKind;
  /** Set for `department` rooms, null otherwise. */
  readonly departmentId: DepartmentId | null;
  readonly bounds: TileRect;
}

/** An opening in the wall between two orthogonally adjacent tiles of different rooms. */
export interface Door {
  readonly id: string;
  readonly roomId: RoomId;
  /** Tile just inside `roomId`. */
  readonly tile: TileCoord;
  readonly connectsTo: RoomId;
  /** Tile just inside `connectsTo`, adjacent to `tile`. */
  readonly opensTo: TileCoord;
}

export interface Desk {
  readonly id: DeskId;
  readonly roomId: RoomId;
  /** Tile the desk furniture occupies (not walkable). */
  readonly tile: TileCoord;
  /** Tile the employee sits on, adjacent to the desk. */
  readonly seat: TileCoord;
  /** Direction the seated employee faces (towards the desk). */
  readonly facing: Facing;
}

export type WaypointKind = 'meeting_seat' | 'break_spot' | 'lounge_seat' | 'reception_spot';

/** A named place an employee can stand or sit that is not their desk. */
export interface Waypoint {
  readonly id: string;
  readonly roomId: RoomId;
  readonly kind: WaypointKind;
  readonly tile: TileCoord;
}

export const FURNITURE_KINDS = [
  'plant',
  'bookshelf',
  'board',
  'workstation',
  'chair',
  'sofa',
  'armchair',
  'server_rack',
  'counter',
  'reception_desk',
  'meeting_table',
  'screen',
  'coffee_machine',
  'fridge',
  'round_table',
  'arcade',
  'beanbag',
  'water_cooler',
] as const;
export type FurnitureKind = (typeof FURNITURE_KINDS)[number];

/** Furniture kinds people sit on: they may stand on a waypoint (the waypoint is the seat). */
export const SEATING_KINDS: readonly FurnitureKind[] = ['chair', 'sofa', 'armchair'];

/** What happens when the founder interacts with a piece of furniture (wired in Phase 1.6). */
export type FurnitureInteraction =
  | 'project_board'
  | 'department_board'
  | 'meeting_screen'
  | 'reception_desk'
  | 'coffee_machine'
  | 'arcade';

/**
 * A piece of furniture. Desks that belong to employees are `Desk`s, not furniture;
 * this is everything else that shapes a room. Pure data: art is chosen by `kind`,
 * collisions by `footprint` + `blocking`.
 */
export interface Furniture {
  readonly id: string;
  readonly kind: FurnitureKind;
  readonly roomId: RoomId;
  /** Top (smallest col/row) tile of the footprint. */
  readonly tile: TileCoord;
  readonly footprint: { readonly cols: number; readonly rows: number };
  /** The side people use it from (e.g. a board on the north wall faces south). */
  readonly facing: Facing;
  /** Whether people can walk through it. */
  readonly blocking: boolean;
  /** Human name, e.g. "Project board". */
  readonly label: string;
  readonly interaction: FurnitureInteraction | null;
}

export interface OfficeLayout {
  readonly size: { readonly cols: number; readonly rows: number };
  readonly rooms: readonly Room[];
  readonly doors: readonly Door[];
  readonly desks: readonly Desk[];
  readonly waypoints: readonly Waypoint[];
  readonly furniture: readonly Furniture[];
}
