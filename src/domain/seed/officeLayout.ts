import type { DepartmentId, DeskId, RoomId } from '../ids';
import type {
  Desk,
  Door,
  Facing,
  Furniture,
  FurnitureInteraction,
  FurnitureKind,
  OfficeLayout,
  Room,
  RoomKind,
  Waypoint,
} from '../types/office';

/**
 * The office floor plan in tile coordinates (26 × 18 tiles).
 *
 *            cols 0–5     6–12      13–19      20–25
 *  rows 0–6  Management | Design  | Frontend | Backend
 *  rows 7–9  ───────────────── Corridor ─────────────────
 *  rows10–17 Reception | QA | Meeting | Break | Lounge
 *            cols 0–4   5–10  11–16    17–20   21–25
 *
 * Every room opens onto the corridor through one door. Walls run along room
 * boundaries (they occupy tile edges, not tiles) and are derived by the renderer.
 */
const CORRIDOR: RoomId = 'room_corridor';

function room(
  id: RoomId,
  name: string,
  kind: RoomKind,
  departmentId: DepartmentId | null,
  col: number,
  row: number,
  cols: number,
  rows: number,
): Room {
  return { id, name, kind, departmentId, bounds: { col, row, cols, rows } };
}

/** Door on a room's corridor-facing wall. `inside` is the room tile; the corridor tile is derived. */
function corridorDoor(roomId: RoomId, col: number, insideRow: number): Door {
  const corridorRow = insideRow < 7 ? 7 : 9;
  return {
    id: `door_${roomId.slice('room_'.length)}`,
    roomId,
    tile: { col, row: insideRow },
    connectsTo: CORRIDOR,
    opensTo: { col, row: corridorRow },
  };
}

/** Desk with its seat one tile south, the employee facing north towards the desk. */
function desk(id: DeskId, roomId: RoomId, col: number, row: number): Desk {
  return { id, roomId, tile: { col, row }, seat: { col, row: row + 1 }, facing: 'north' };
}

function waypoint(
  id: string,
  roomId: RoomId,
  kind: Waypoint['kind'],
  col: number,
  row: number,
): Waypoint {
  return { id, roomId, kind, tile: { col, row } };
}

interface FurnitureOptions {
  readonly cols?: number;
  readonly rows?: number;
  readonly facing?: Facing;
  readonly blocking?: boolean;
  readonly interaction?: FurnitureInteraction;
}

function item(
  id: string,
  kind: FurnitureKind,
  roomId: RoomId,
  label: string,
  col: number,
  row: number,
  options: FurnitureOptions = {},
): Furniture {
  return {
    id,
    kind,
    roomId,
    label,
    tile: { col, row },
    footprint: { cols: options.cols ?? 1, rows: options.rows ?? 1 },
    facing: options.facing ?? 'south',
    blocking: options.blocking ?? true,
    interaction: options.interaction ?? null,
  };
}

const M: RoomId = 'room_management';
const DS: RoomId = 'room_design';
const FE: RoomId = 'room_frontend';
const BE: RoomId = 'room_backend';
const RE: RoomId = 'room_reception';
const QA: RoomId = 'room_qa';
const MR: RoomId = 'room_meeting';
const BR: RoomId = 'room_break';
const LO: RoomId = 'room_lounge';

/**
 * Everything except employee desks. Placed so every doorway, desk, seat and
 * waypoint stays free; seating may sit on the waypoint it represents.
 */
const FURNITURE: readonly Furniture[] = [
  // Management
  item('mgmt_board', 'board', M, 'Project board', 4, 0, { cols: 2, interaction: 'project_board' }),
  item('mgmt_shelf', 'bookshelf', M, 'Bookshelf', 0, 2, { rows: 2, facing: 'east' }),
  item('mgmt_guest_chair', 'chair', M, 'Guest chair', 2, 1, { facing: 'south' }),
  item('mgmt_armchair', 'armchair', M, 'Armchair', 4, 4, { facing: 'west' }),
  item('mgmt_plant', 'plant', M, 'Plant', 0, 0),
  item('mgmt_plant_2', 'plant', M, 'Plant', 5, 6),
  // UI/UX Design
  item('design_board', 'board', DS, 'Moodboard', 7, 0, {
    cols: 2,
    interaction: 'department_board',
  }),
  item('design_workstation', 'workstation', DS, 'Spare workstation', 11, 2),
  item('design_chair', 'chair', DS, 'Chair', 11, 3, { facing: 'north' }),
  item('design_beanbag', 'beanbag', DS, 'Beanbag', 11, 5),
  item('design_plant', 'plant', DS, 'Plant', 12, 0),
  item('design_plant_2', 'plant', DS, 'Plant', 6, 6),
  // Frontend Development
  item('frontend_board', 'board', FE, 'Sprint board', 13, 0, {
    cols: 2,
    interaction: 'department_board',
  }),
  item('frontend_workstation', 'workstation', FE, 'Spare workstation', 18, 2),
  item('frontend_chair', 'chair', FE, 'Chair', 18, 3, { facing: 'north' }),
  item('frontend_sofa', 'sofa', FE, 'Sofa', 19, 4, { rows: 2, facing: 'west' }),
  item('frontend_plant', 'plant', FE, 'Plant', 19, 0),
  // Backend Development
  item('backend_board', 'board', BE, 'Architecture board', 20, 0, {
    cols: 2,
    interaction: 'department_board',
  }),
  item('backend_rack_1', 'server_rack', BE, 'Server rack', 25, 0, { facing: 'west' }),
  item('backend_rack_2', 'server_rack', BE, 'Server rack', 25, 1, { facing: 'west' }),
  item('backend_rack_3', 'server_rack', BE, 'Server rack', 25, 2, { facing: 'west' }),
  item('backend_cooler', 'water_cooler', BE, 'Water cooler', 20, 5),
  item('backend_plant', 'plant', BE, 'Plant', 25, 6),
  // Corridor
  item('corridor_plant_1', 'plant', CORRIDOR, 'Plant', 0, 7),
  item('corridor_plant_2', 'plant', CORRIDOR, 'Plant', 12, 7),
  item('corridor_plant_3', 'plant', CORRIDOR, 'Plant', 25, 9),
  item('corridor_cooler', 'water_cooler', CORRIDOR, 'Water cooler', 6, 7),
  // Reception
  item('reception_desk', 'reception_desk', RE, 'Reception desk', 1, 15, {
    cols: 3,
    facing: 'north',
    interaction: 'reception_desk',
  }),
  item('reception_sofa', 'sofa', RE, 'Waiting sofa', 0, 11, { rows: 2, facing: 'east' }),
  item('reception_plant', 'plant', RE, 'Plant', 4, 11),
  item('reception_plant_2', 'plant', RE, 'Plant', 4, 17),
  // Quality Assurance
  item('qa_board', 'board', QA, 'Bug board', 5, 12, {
    rows: 2,
    facing: 'east',
    interaction: 'department_board',
  }),
  item('qa_workstation', 'workstation', QA, 'Test workstation', 9, 13),
  item('qa_chair', 'chair', QA, 'Chair', 9, 14, { facing: 'north' }),
  item('qa_shelf', 'bookshelf', QA, 'Device shelf', 5, 10, { cols: 2 }),
  item('qa_plant', 'plant', QA, 'Plant', 5, 17),
  // Meeting room: chairs are the meeting seats.
  item('meeting_table', 'meeting_table', MR, 'Meeting table', 13, 13, { cols: 2, rows: 2 }),
  item('meeting_chair_1', 'chair', MR, 'Chair', 12, 13, { facing: 'east' }),
  item('meeting_chair_2', 'chair', MR, 'Chair', 13, 12, { facing: 'south' }),
  item('meeting_chair_3', 'chair', MR, 'Chair', 15, 13, { facing: 'west' }),
  item('meeting_chair_4', 'chair', MR, 'Chair', 14, 15, { facing: 'north' }),
  item('meeting_chair_5', 'chair', MR, 'Chair', 13, 15, { facing: 'north' }),
  item('meeting_screen', 'screen', MR, 'Meeting screen', 15, 10, {
    cols: 2,
    interaction: 'meeting_screen',
  }),
  item('meeting_plant', 'plant', MR, 'Plant', 11, 17),
  item('meeting_plant_2', 'plant', MR, 'Plant', 16, 17),
  // Break room
  item('break_coffee', 'coffee_machine', BR, 'Coffee machine', 20, 11, {
    facing: 'west',
    interaction: 'coffee_machine',
  }),
  item('break_counter', 'counter', BR, 'Kitchen counter', 20, 12, { rows: 2, facing: 'west' }),
  item('break_fridge', 'fridge', BR, 'Fridge', 17, 11, { facing: 'east' }),
  item('break_table', 'round_table', BR, 'Table', 18, 16),
  item('break_plant', 'plant', BR, 'Plant', 20, 17),
  // Lounge: the sofa and armchair are the lounge seats.
  item('lounge_sofa', 'sofa', LO, 'Sofa', 22, 13, { rows: 2, facing: 'east' }),
  item('lounge_armchair', 'armchair', LO, 'Armchair', 24, 15, { facing: 'north' }),
  item('lounge_table', 'round_table', LO, 'Coffee table', 23, 14),
  item('lounge_arcade', 'arcade', LO, 'Arcade machine', 21, 17, {
    facing: 'north',
    interaction: 'arcade',
  }),
  item('lounge_shelf', 'bookshelf', LO, 'Bookshelf', 24, 10, { cols: 2 }),
  item('lounge_plant', 'plant', LO, 'Plant', 25, 11),
];

export const OFFICE_LAYOUT: OfficeLayout = {
  size: { cols: 26, rows: 18 },

  rooms: [
    room('room_management', 'Management', 'department', 'dept_management', 0, 0, 6, 7),
    room('room_design', 'UI/UX Design', 'department', 'dept_design', 6, 0, 7, 7),
    room('room_frontend', 'Frontend Development', 'department', 'dept_frontend', 13, 0, 7, 7),
    room('room_backend', 'Backend Development', 'department', 'dept_backend', 20, 0, 6, 7),
    room(CORRIDOR, 'Corridor', 'corridor', null, 0, 7, 26, 3),
    room('room_reception', 'Reception', 'reception', null, 0, 10, 5, 8),
    room('room_qa', 'Quality Assurance', 'department', 'dept_qa', 5, 10, 6, 8),
    room('room_meeting', 'Meeting Room', 'meeting', null, 11, 10, 6, 8),
    room('room_break', 'Break Room', 'break', null, 17, 10, 4, 8),
    room('room_lounge', 'Lounge', 'lounge', null, 21, 10, 5, 8),
  ],

  doors: [
    corridorDoor('room_management', 3, 6),
    corridorDoor('room_design', 9, 6),
    corridorDoor('room_frontend', 16, 6),
    corridorDoor('room_backend', 23, 6),
    corridorDoor('room_reception', 2, 10),
    corridorDoor('room_qa', 8, 10),
    corridorDoor('room_meeting', 13, 10),
    corridorDoor('room_break', 18, 10),
    corridorDoor('room_lounge', 23, 10),
  ],

  desks: [
    desk('desk_management_1', 'room_management', 2, 2),
    desk('desk_design_1', 'room_design', 9, 2),
    desk('desk_frontend_1', 'room_frontend', 16, 2),
    desk('desk_backend_1', 'room_backend', 22, 2),
    desk('desk_qa_1', 'room_qa', 7, 13),
  ],

  waypoints: [
    waypoint('wp_meeting_1', 'room_meeting', 'meeting_seat', 12, 13),
    waypoint('wp_meeting_2', 'room_meeting', 'meeting_seat', 13, 12),
    waypoint('wp_meeting_3', 'room_meeting', 'meeting_seat', 15, 13),
    waypoint('wp_meeting_4', 'room_meeting', 'meeting_seat', 14, 15),
    waypoint('wp_meeting_5', 'room_meeting', 'meeting_seat', 13, 15),
    waypoint('wp_break_1', 'room_break', 'break_spot', 18, 13),
    waypoint('wp_break_2', 'room_break', 'break_spot', 19, 15),
    waypoint('wp_lounge_1', 'room_lounge', 'lounge_seat', 22, 13),
    waypoint('wp_lounge_2', 'room_lounge', 'lounge_seat', 24, 15),
    waypoint('wp_reception_1', 'room_reception', 'reception_spot', 2, 13),
  ],

  furniture: FURNITURE,
};
