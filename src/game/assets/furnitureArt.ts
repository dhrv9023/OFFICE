import type Phaser from 'phaser';
import type { Facing, FurnitureKind } from '@/domain/types';
import {
  faceQuad,
  isoBox,
  makeIsoTexture,
  project,
  shades,
  tone,
  type TextureAnchor,
} from './isoDraw';
import { OUTLINE } from './palette';

type G = Phaser.GameObjects.Graphics;
interface O {
  x: number;
  y: number;
}

interface Shape {
  readonly cols: number;
  readonly rows: number;
  readonly facing: Facing;
}

const WOOD = 0xb07a4a;
const WOOD_LIGHT = 0xd2a273;
const DARK = 0x2b3044;
const METAL = 0x9aa4b8;
const LEAF = 0x3fa45b;
const LEAF_DARK = 0x2a7a40;
const POT = 0xc8653c;

/** The thin strip along the wall a piece of furniture backs onto. */
function backStrip(shape: Shape, depth: number): [number, number, number, number] {
  const { cols, rows, facing } = shape;
  switch (facing) {
    case 'south': // against the north wall
      return [0, 0, cols, depth];
    case 'north': // against the south wall
      return [0, rows - depth, cols, rows];
    case 'east': // against the west wall
      return [0, 0, depth, rows];
    case 'west': // against the east wall
      return [cols - depth, 0, cols, rows];
  }
}

/** Is the front of the furniture on a face the camera sees? */
const frontVisible = (facing: Facing) => facing === 'south' || facing === 'east';
/** The visible face a front lies on (row face for south, col face for east). */
const frontFace = (shape: Shape): { face: 'row' | 'col'; at: number; length: number } =>
  shape.facing === 'south'
    ? { face: 'row', at: shape.rows, length: shape.cols }
    : { face: 'col', at: shape.cols, length: shape.rows };

function plant(g: G, o: O): void {
  isoBox(g, o, 0.3, 0.3, 0.7, 0.7, 0, 11, shades(POT));
  const top = project(o, 0.5, 0.5, 11);
  const leaves: [number, number, number, number][] = [
    [0, -10, 9, LEAF_DARK],
    [-6, -6, 7, LEAF],
    [6, -6, 7, LEAF],
    [-3, -16, 7, LEAF],
    [4, -15, 6, LEAF_DARK],
    [0, -21, 5, LEAF],
  ];
  for (const [dx, dy, radius] of leaves) {
    g.fillStyle(OUTLINE, 0.5).fillCircle(top.x + dx, top.y + dy, radius + 1);
  }
  for (const [dx, dy, radius, color] of leaves) {
    g.fillStyle(color, 1).fillCircle(top.x + dx, top.y + dy, radius);
  }
  g.fillStyle(0x7fd08f, 1).fillCircle(top.x - 2, top.y - 18, 2);
}

function bookshelf(g: G, o: O, shape: Shape): void {
  const [c0, r0, c1, r1] = backStrip(shape, 0.45);
  isoBox(g, o, c0, r0, c1, r1, 0, 46, shades(WOOD));
  if (!frontVisible(shape.facing)) return;
  const front = frontFace(shape);
  const at = front.face === 'row' ? r1 : c1;
  const colors = [0xe0524f, 0x4f8fe0, 0xf2c14e, 0x5cbf7a, 0x9b6ad6, 0xf08a3c];
  for (let shelf = 0; shelf < 4; shelf++) {
    const z = 6 + shelf * 10;
    faceQuad(g, o, front.face, at, 0.05, front.length - 0.05, z - 1, z, tone(WOOD, -0.35));
    for (let book = 0; book < front.length * 7; book++) {
      const a = 0.1 + book * 0.13;
      if (a > front.length - 0.12) break;
      const height = 6 + ((book * 7 + shelf * 3) % 3);
      faceQuad(
        g,
        o,
        front.face,
        at,
        a,
        a + 0.09,
        z,
        z + height,
        colors[(book + shelf * 2) % colors.length] ?? 0xffffff,
      );
    }
  }
}

function board(g: G, o: O, shape: Shape, screen: boolean): void {
  const [c0, r0, c1, r1] = backStrip(shape, 0.12);
  // Two legs, then the panel.
  const legs =
    frontFace(shape).face === 'row'
      ? [
          [c0 + 0.15, r0, c0 + 0.25, r1],
          [c1 - 0.25, r0, c1 - 0.15, r1],
        ]
      : [
          [c0, r0 + 0.15, c1, r0 + 0.25],
          [c0, r1 - 0.25, c1, r1 - 0.15],
        ];
  for (const [a, b, c, d] of legs)
    isoBox(g, o, a ?? 0, b ?? 0, c ?? 0, d ?? 0, 0, 16, shades(METAL), false);
  isoBox(g, o, c0, r0, c1, r1, 14, 46, shades(screen ? DARK : 0xd9dde6));
  if (!frontVisible(shape.facing)) return;
  const front = frontFace(shape);
  const at = front.face === 'row' ? r1 : c1;
  if (screen) {
    faceQuad(g, o, front.face, at, 0.1, front.length - 0.1, 17, 43, 0x2f6fd6);
    faceQuad(g, o, front.face, at, 0.2, front.length * 0.55, 34, 38, 0xbfe6ff);
    faceQuad(g, o, front.face, at, 0.2, front.length * 0.8, 26, 29, 0x8ec5ff);
    faceQuad(g, o, front.face, at, 0.2, front.length * 0.4, 20, 23, 0xf5a524);
    return;
  }
  faceQuad(g, o, front.face, at, 0.08, front.length - 0.08, 17, 43, 0xffffff);
  const notes = [0xf5a524, 0x7dd3fc, 0xf9a8d4, 0x86efac, 0xfde047];
  for (let i = 0; i < front.length * 5; i++) {
    const a = 0.18 + (i % (front.length * 3)) * 0.28;
    const z = i < front.length * 3 ? 33 : 23;
    if (a + 0.18 > front.length - 0.1) continue;
    faceQuad(g, o, front.face, at, a, a + 0.18, z, z + 7, notes[i % notes.length] ?? 0xffffff);
  }
}

function deskWithMonitor(g: G, o: O, monitorFacing: Facing): void {
  isoBox(g, o, 0.12, 0.12, 0.88, 0.88, 0, 15, {
    top: WOOD_LIGHT,
    left: WOOD,
    right: tone(WOOD, -0.22),
  });
  // Monitor at the back of the desk, facing the seat.
  const towardsRow = monitorFacing === 'south' || monitorFacing === 'north';
  const [mc0, mr0, mc1, mr1] = towardsRow ? [0.25, 0.3, 0.75, 0.4] : [0.3, 0.25, 0.4, 0.75];
  isoBox(g, o, 0.45, 0.45, 0.55, 0.55, 15, 19, shades(DARK), false);
  isoBox(g, o, mc0, mr0, mc1, mr1, 19, 31, shades(DARK));
  if (monitorFacing === 'south')
    faceQuad(g, o, 'row', mr1, mc0 + 0.04, mc1 - 0.04, 21, 29, 0x5ec8f2);
  if (monitorFacing === 'east')
    faceQuad(g, o, 'col', mc1, mr0 + 0.04, mr1 - 0.04, 21, 29, 0x5ec8f2);
  // Keyboard and a mug.
  isoBox(g, o, 0.3, 0.55, 0.65, 0.7, 15, 16, shades(0xe5e7ee), false);
  isoBox(g, o, 0.72, 0.62, 0.8, 0.7, 15, 19, shades(0xf5a524), false);
}

function chair(g: G, o: O, facing: Facing): void {
  isoBox(g, o, 0.45, 0.45, 0.55, 0.55, 0, 7, shades(METAL), false);
  isoBox(g, o, 0.25, 0.25, 0.75, 0.75, 7, 10, shades(0x3a4466));
  const back: Record<Facing, [number, number, number, number]> = {
    north: [0.25, 0.68, 0.75, 0.78],
    south: [0.25, 0.22, 0.75, 0.32],
    east: [0.22, 0.25, 0.32, 0.75],
    west: [0.68, 0.25, 0.78, 0.75],
  };
  const [c0, r0, c1, r1] = back[facing];
  isoBox(g, o, c0, r0, c1, r1, 10, 22, shades(0x3a4466));
}

function sofa(g: G, o: O, shape: Shape, color: number): void {
  const { cols, rows } = shape;
  isoBox(g, o, 0.08, 0.08, cols - 0.08, rows - 0.08, 0, 10, shades(color));
  const [c0, r0, c1, r1] = backStrip(shape, 0.3);
  isoBox(
    g,
    o,
    Math.max(c0, 0.08),
    Math.max(r0, 0.08),
    Math.min(c1, cols - 0.08),
    Math.min(r1, rows - 0.08),
    10,
    22,
    shades(tone(color, -0.08)),
  );
  // Cushion seams.
  const seams = shape.facing === 'east' || shape.facing === 'west' ? rows : cols;
  for (let i = 1; i < seams; i++) {
    const face = shape.facing === 'east' || shape.facing === 'west' ? 'col' : 'row';
    const at = face === 'col' ? cols - 0.08 : rows - 0.08;
    faceQuad(g, o, face, at, i - 0.02, i + 0.02, 1, 9, tone(color, -0.3));
  }
}

function serverRack(g: G, o: O): void {
  isoBox(g, o, 0.12, 0.12, 0.88, 0.88, 0, 56, shades(0x30364c));
  for (let i = 0; i < 9; i++) {
    const z = 8 + i * 5;
    faceQuad(g, o, 'row', 0.88, 0.2, 0.8, z, z + 3, 0x20253a);
    faceQuad(g, o, 'col', 0.88, 0.2, 0.8, z, z + 3, 0x20253a);
    faceQuad(g, o, 'row', 0.88, 0.25, 0.3, z + 1, z + 2, i % 3 === 0 ? 0x4ade80 : 0x5cc8e8);
    faceQuad(g, o, 'col', 0.88, 0.7, 0.75, z + 1, z + 2, i % 2 === 0 ? 0x4ade80 : 0xf5a524);
  }
}

function counter(g: G, o: O, shape: Shape, top: number, body: number, height: number): void {
  isoBox(g, o, 0.05, 0.05, shape.cols - 0.05, shape.rows - 0.05, 0, height, {
    top,
    left: body,
    right: tone(body, -0.2),
  });
  // Cabinet doors on the visible faces.
  for (let i = 0; i < shape.cols; i++)
    faceQuad(g, o, 'row', shape.rows - 0.05, i + 0.2, i + 0.8, 3, height - 4, tone(body, 0.12));
  for (let i = 0; i < shape.rows; i++)
    faceQuad(g, o, 'col', shape.cols - 0.05, i + 0.2, i + 0.8, 3, height - 4, tone(body, -0.08));
}

function receptionDesk(g: G, o: O, shape: Shape): void {
  isoBox(g, o, 0.05, 0.2, shape.cols - 0.05, shape.rows - 0.15, 0, 22, {
    top: 0xfff4dc,
    left: 0xf5a524,
    right: 0xd68a12,
  });
  faceQuad(g, o, 'row', shape.rows - 0.15, 0.2, shape.cols - 0.2, 6, 9, 0x1b2a8a);
  // The Project HQ block logo on the front panel.
  const c = shape.cols / 2;
  faceQuad(g, o, 'row', shape.rows - 0.15, c - 0.18, c + 0.18, 11, 18, 0x1b2a8a);
  isoBox(g, o, 0.3, 0.3, 0.8, 0.6, 22, 26, shades(DARK), false);
}

function meetingTable(g: G, o: O, shape: Shape): void {
  const { cols, rows } = shape;
  for (const [c, r] of [
    [0.4, 0.4],
    [cols - 0.5, 0.4],
    [0.4, rows - 0.5],
    [cols - 0.5, rows - 0.5],
  ] as const) {
    isoBox(g, o, c, r, c + 0.1, r + 0.1, 0, 13, shades(tone(WOOD, -0.3)), false);
  }
  isoBox(g, o, 0.25, 0.25, cols - 0.25, rows - 0.25, 13, 16, {
    top: WOOD_LIGHT,
    left: WOOD,
    right: tone(WOOD, -0.22),
  });
  // Laptops and notes on the table.
  isoBox(g, o, 0.55, 0.6, 0.85, 0.85, 16, 17, shades(0xcfd5e2), false);
  isoBox(g, o, cols - 0.85, rows - 0.95, cols - 0.55, rows - 0.7, 16, 17, shades(0xcfd5e2), false);
  isoBox(g, o, 1.0, 1.1, 1.2, 1.25, 16, 17, shades(0xfde047), false);
}

function coffeeMachine(g: G, o: O): void {
  isoBox(g, o, 0.1, 0.1, 0.9, 0.9, 0, 18, shades(0xd9d2c3));
  isoBox(g, o, 0.25, 0.25, 0.75, 0.75, 18, 34, shades(0x3a3f55));
  faceQuad(g, o, 'col', 0.75, 0.35, 0.65, 22, 30, 0x1a1d2b);
  faceQuad(g, o, 'col', 0.75, 0.42, 0.5, 31, 33, 0xe0524f);
  isoBox(g, o, 0.55, 0.42, 0.65, 0.55, 18, 22, shades(0xffffff), false);
}

function fridge(g: G, o: O): void {
  isoBox(g, o, 0.12, 0.12, 0.88, 0.88, 0, 46, shades(0xe8edf4));
  faceQuad(g, o, 'col', 0.88, 0.12, 0.88, 30, 31, 0xb8c0cc);
  faceQuad(g, o, 'col', 0.88, 0.2, 0.26, 18, 28, 0x8a93a3);
  faceQuad(g, o, 'col', 0.88, 0.2, 0.26, 33, 40, 0x8a93a3);
}

function roundTable(g: G, o: O): void {
  isoBox(g, o, 0.45, 0.45, 0.55, 0.55, 0, 13, shades(METAL), false);
  const centre = project(o, 0.5, 0.5, 13);
  g.fillStyle(OUTLINE, 0.6).fillEllipse(centre.x, centre.y + 1, 38, 20);
  g.fillStyle(WOOD, 1).fillEllipse(centre.x, centre.y + 1, 36, 18);
  g.fillStyle(WOOD_LIGHT, 1).fillEllipse(centre.x, centre.y - 1, 36, 18);
  g.fillStyle(0xffffff, 1).fillEllipse(centre.x + 6, centre.y - 2, 6, 3);
}

function arcade(g: G, o: O, facing: Facing): void {
  isoBox(g, o, 0.15, 0.15, 0.85, 0.85, 0, 48, shades(0x6d3fc4));
  if (facing === 'east') {
    faceQuad(g, o, 'col', 0.85, 0.25, 0.75, 26, 40, 0x1a1d2b);
    faceQuad(g, o, 'col', 0.85, 0.3, 0.7, 28, 38, 0x22d3ee);
    faceQuad(g, o, 'col', 0.85, 0.35, 0.5, 31, 34, 0xf5a524);
    faceQuad(g, o, 'col', 0.85, 0.25, 0.75, 42, 46, 0xf9a8d4);
  } else {
    faceQuad(g, o, 'row', 0.85, 0.25, 0.75, 26, 40, 0x1a1d2b);
    faceQuad(g, o, 'row', 0.85, 0.3, 0.7, 28, 38, 0x22d3ee);
  }
}

function beanbag(g: G, o: O): void {
  const centre = project(o, 0.5, 0.5, 0);
  g.fillStyle(OUTLINE, 0.5).fillEllipse(centre.x, centre.y - 7, 42, 26);
  g.fillStyle(0xf472b6, 1).fillEllipse(centre.x, centre.y - 7, 40, 24);
  g.fillStyle(0xf9a8d4, 1).fillEllipse(centre.x - 4, centre.y - 11, 22, 12);
}

function waterCooler(g: G, o: O): void {
  isoBox(g, o, 0.3, 0.3, 0.7, 0.7, 0, 22, shades(0xe8edf4));
  const top = project(o, 0.5, 0.5, 22);
  g.fillStyle(OUTLINE, 0.5).fillRoundedRect(top.x - 7, top.y - 17, 14, 18, 4);
  g.fillStyle(0x7cc8f2, 0.95).fillRoundedRect(top.x - 6, top.y - 16, 12, 16, 4);
  g.fillStyle(0xd7f0ff, 1).fillRect(top.x - 3, top.y - 13, 2, 9);
}

function armchair(g: G, o: O, facing: Facing): void {
  sofa(g, o, { cols: 1, rows: 1, facing }, 0x2fa38c);
}

/** Draws one piece of furniture; the texture is shared by everything with the same kind, size and facing. */
export function furnitureTexture(
  scene: Phaser.Scene,
  kind: FurnitureKind,
  shape: Shape,
): TextureAnchor {
  const key = `furniture.${kind}.${shape.cols}x${shape.rows}.${shape.facing}`;
  const zMax = 64;
  return makeIsoTexture(
    scene,
    key,
    { c0: 0, r0: 0, c1: shape.cols, r1: shape.rows, zMax },
    (g, o) => {
      DRAWERS[kind](g, o, shape);
    },
  );
}

const DRAWERS: Readonly<Record<FurnitureKind, (g: G, o: O, shape: Shape) => void>> = {
  plant: (g, o) => {
    plant(g, o);
  },
  bookshelf,
  board: (g, o, shape) => {
    board(g, o, shape, false);
  },
  screen: (g, o, shape) => {
    board(g, o, shape, true);
  },
  workstation: (g, o) => {
    deskWithMonitor(g, o, 'south');
  },
  chair: (g, o, shape) => {
    chair(g, o, shape.facing);
  },
  sofa: (g, o, shape) => {
    sofa(g, o, shape, 0xe0524f);
  },
  armchair: (g, o, shape) => {
    armchair(g, o, shape.facing);
  },
  server_rack: (g, o) => {
    serverRack(g, o);
  },
  counter: (g, o, shape) => {
    counter(g, o, shape, 0xf3f4f6, 0x5b8def, 20);
  },
  reception_desk: receptionDesk,
  meeting_table: meetingTable,
  coffee_machine: (g, o) => {
    coffeeMachine(g, o);
  },
  fridge: (g, o) => {
    fridge(g, o);
  },
  round_table: (g, o) => {
    roundTable(g, o);
  },
  arcade: (g, o, shape) => {
    arcade(g, o, shape.facing);
  },
  beanbag: (g, o) => {
    beanbag(g, o);
  },
  water_cooler: (g, o) => {
    waterCooler(g, o);
  },
};

/** An employee's desk: same art as a workstation, monitor facing the seat. */
export function deskTexture(scene: Phaser.Scene, seatFacing: Facing): TextureAnchor {
  // The person faces `seatFacing`, so the monitor faces the opposite way (towards them).
  const monitor: Facing = { north: 'south', south: 'north', east: 'west', west: 'east' }[
    seatFacing
  ] as Facing;
  return makeIsoTexture(
    scene,
    `desk.${monitor}`,
    { c0: 0, r0: 0, c1: 1, r1: 1, zMax: 40 },
    (g, o) => {
      deskWithMonitor(g, o, monitor);
    },
  );
}

export function chairTexture(scene: Phaser.Scene, facing: Facing): TextureAnchor {
  return furnitureTexture(scene, 'chair', { cols: 1, rows: 1, facing });
}
