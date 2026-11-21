import type Phaser from 'phaser';
import { roomAt } from '@/domain/rules/officeLayout';
import type { EmployeeWorkStatus, OfficeLayout } from '@/domain/types';
import {
  CHARACTER_FRAME,
  drawCharacter,
  type CharacterLook,
  type CharacterPose,
} from '@/art/characters';
import { faceQuad, isoBox, makeIsoTexture, project, tone, type TextureAnchor } from './isoDraw';
import { FLOORS, OUTLINE, WALLS } from './palette';
import { PixelBuffer } from '@/art/pixelBuffer';

/** Height of the tall outer back walls, in pixels. */
export const BACK_WALL_HEIGHT = 84;
/** Height of interior partitions and front walls (low, so they never hide anyone). */
export const PARTITION_HEIGHT = 14;
const WALL_THICKNESS = 0.16;

/**
 * The whole floor plus the tall outer back walls, as one static texture: they are
 * always behind everything else, so they never need depth sorting and cost
 * nothing per frame.
 */
export function officeBaseTexture(scene: Phaser.Scene, layout: OfficeLayout): TextureAnchor {
  const { cols, rows } = layout.size;
  const t = WALL_THICKNESS;
  return makeIsoTexture(
    scene,
    'office.base',
    { c0: -t, r0: -t, c1: cols, r1: rows, zMax: BACK_WALL_HEIGHT + 4 },
    (g, o) => {
      // Floor tiles.
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const room = roomAt(layout, { col, row });
          const style = room ? FLOORS[room.id] : undefined;
          if (!style) continue;
          const corners = [
            project(o, col, row),
            project(o, col + 1, row),
            project(o, col + 1, row + 1),
            project(o, col, row + 1),
          ];
          const checker = (col + row) % 2 === 0;
          const fill = style.pattern === 'checker' && !checker ? style.dark : style.light;
          g.fillStyle(fill, 1).fillPoints(corners, true);
          if (style.pattern === 'planks') {
            for (const along of [0.33, 0.66]) {
              g.lineStyle(1, style.dark, 1).strokePoints(
                [project(o, col, row + along), project(o, col + 1, row + along)],
                false,
              );
            }
          } else if (style.pattern === 'carpet' && checker) {
            const centre = project(o, col + 0.5, row + 0.5);
            g.fillStyle(style.dark, 1).fillRect(
              Math.round(centre.x) - 1,
              Math.round(centre.y),
              2,
              1,
            );
          }
          g.lineStyle(1, style.line, 0.45).strokePoints(corners, true);
        }
      }
      // Door thresholds: a darker strip across each doorway.
      for (const door of layout.doors) {
        const edgeRow = Math.max(door.tile.row, door.opensTo.row);
        const col = door.tile.col;
        g.fillStyle(0x8a6a44, 1).fillPoints(
          [
            project(o, col, edgeRow - 0.08),
            project(o, col + 1, edgeRow - 0.08),
            project(o, col + 1, edgeRow + 0.08),
            project(o, col, edgeRow + 0.08),
          ],
          true,
        );
      }
      // Tall back walls along the north (row 0) and west (col 0) edges.
      const H = BACK_WALL_HEIGHT;
      for (let col = 0; col < cols; col++) {
        faceQuad(
          g,
          o,
          'row',
          0,
          col,
          col + 1,
          0,
          H,
          col % 2 === 0 ? WALLS.backFace : WALLS.backFaceShade,
        );
        backWallDetails(g, o, 'row', col);
        g.fillStyle(WALLS.backCap, 1).fillPoints(
          [
            project(o, col, -t, H),
            project(o, col + 1, -t, H),
            project(o, col + 1, 0, H),
            project(o, col, 0, H),
          ],
          true,
        );
      }
      for (let row = 0; row < rows; row++) {
        faceQuad(
          g,
          o,
          'col',
          0,
          row,
          row + 1,
          0,
          H,
          tone(row % 2 === 0 ? WALLS.backFace : WALLS.backFaceShade, -0.12),
        );
        backWallDetails(g, o, 'col', row);
        g.fillStyle(WALLS.backCap, 1).fillPoints(
          [
            project(o, -t, row, H),
            project(o, 0, row, H),
            project(o, 0, row + 1, H),
            project(o, -t, row + 1, H),
          ],
          true,
        );
      }
      g.fillStyle(WALLS.backCap, 1).fillPoints(
        [project(o, -t, -t, H), project(o, 0, -t, H), project(o, 0, 0, H), project(o, -t, 0, H)],
        true,
      );
      // Exposed ends of the back walls.
      faceQuad(g, o, 'col', cols, -t, 0, 0, H, tone(WALLS.backFace, -0.25));
      faceQuad(g, o, 'row', rows, -t, 0, 0, H, tone(WALLS.backFace, -0.1));
      // Outline along the wall tops.
      g.lineStyle(1, OUTLINE, 0.6);
      g.strokePoints([project(o, cols, 0, H), project(o, 0, 0, H), project(o, 0, rows, H)], false);
    },
  );
}

/** Baseboard, top trim and windows on one back wall segment. */
function backWallDetails(
  g: Phaser.GameObjects.Graphics,
  o: { x: number; y: number },
  face: 'row' | 'col',
  index: number,
) {
  const H = BACK_WALL_HEIGHT;
  faceQuad(g, o, face, 0, index, index + 1, 0, 5, WALLS.trim);
  faceQuad(g, o, face, 0, index, index + 1, H - 5, H, WALLS.trim);
  if (index % 3 === 1) {
    faceQuad(g, o, face, 0, index + 0.15, index + 0.85, 30, 68, WALLS.trim);
    faceQuad(g, o, face, 0, index + 0.2, index + 0.8, 32, 66, WALLS.window);
    faceQuad(g, o, face, 0, index + 0.47, index + 0.53, 32, 66, WALLS.trim);
    faceQuad(g, o, face, 0, index + 0.25, index + 0.4, 50, 63, WALLS.windowShine);
  }
}

/** One unit of a low wall along a col edge or a row edge (shared by all segments). */
export function partitionTexture(scene: Phaser.Scene, axis: 'col' | 'row'): TextureAnchor {
  const t = WALL_THICKNESS / 2;
  const box =
    axis === 'col' ? { c0: -t, r0: -t, c1: t, r1: 1 + t } : { c0: -t, r0: -t, c1: 1 + t, r1: t };
  return makeIsoTexture(scene, `wall.${axis}`, { ...box, zMax: PARTITION_HEIGHT + 2 }, (g, o) => {
    isoBox(g, o, box.c0, box.r0, box.c1, box.r1, 0, PARTITION_HEIGHT, {
      top: WALLS.partitionTrim,
      left: WALLS.partitionLeft,
      right: WALLS.partitionRight,
    });
  });
}

/** Sprite sheet layout: one row per facing, one column per frame. */
export const CHARACTER_ROWS = ['front-right', 'front-left', 'back-right', 'back-left'] as const;
const POSES: readonly { name: string; pose: CharacterPose }[] = [
  { name: 'idle0', pose: { kind: 'idle', frame: 0 } },
  { name: 'idle1', pose: { kind: 'idle', frame: 1 } },
  { name: 'walk0', pose: { kind: 'walk', frame: 0 } },
  { name: 'walk1', pose: { kind: 'walk', frame: 1 } },
  { name: 'walk2', pose: { kind: 'walk', frame: 2 } },
  { name: 'walk3', pose: { kind: 'walk', frame: 3 } },
  { name: 'sit', pose: { kind: 'sit' } },
  { name: 'type0', pose: { kind: 'type', frame: 0 } },
  { name: 'type1', pose: { kind: 'type', frame: 1 } },
];

/**
 * Builds a character's sprite sheet (4 facings × 9 frames) and its animations:
 * `<key>.idle.<facing>`, `<key>.walk.<facing>`, `<key>.type.<facing>`.
 */
export function characterTexture(scene: Phaser.Scene, key: string, look: CharacterLook): string {
  if (scene.textures.exists(key)) return key;
  const { width, height } = CHARACTER_FRAME;
  const canvas = scene.textures.createCanvas(
    key,
    width * POSES.length,
    height * CHARACTER_ROWS.length,
  );
  if (!canvas) return key;
  const context = canvas.getContext();
  CHARACTER_ROWS.forEach((facing, row) => {
    const view = facing.startsWith('front') ? 'front' : 'back';
    POSES.forEach(({ name, pose }, column) => {
      const frame = drawCharacter(look, view, pose);
      (facing.endsWith('left') ? frame.flipped() : frame).paint(
        context,
        column * width,
        row * height,
      );
      canvas.add(`${facing}.${name}`, 0, column * width, row * height, width, height);
    });
  });
  canvas.refresh();

  const frames = (facing: string, names: string[]) =>
    names.map((name) => ({ key, frame: `${facing}.${name}` }));
  for (const facing of CHARACTER_ROWS) {
    scene.anims.create({
      key: `${key}.idle.${facing}`,
      frames: frames(facing, ['idle0', 'idle1']),
      frameRate: 1.6,
      repeat: -1,
    });
    scene.anims.create({
      key: `${key}.walk.${facing}`,
      frames: frames(facing, ['walk0', 'walk1', 'walk2', 'walk3']),
      frameRate: 9,
      repeat: -1,
    });
    scene.anims.create({
      key: `${key}.type.${facing}`,
      frames: frames(facing, ['type0', 'type1']),
      frameRate: 5,
      repeat: -1,
    });
  }
  return key;
}

function iconTexture(scene: Phaser.Scene, key: string, buffer: PixelBuffer): string {
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, buffer.width, buffer.height);
  if (!canvas) return key;
  buffer.paint(canvas.getContext(), 0, 0);
  canvas.refresh();
  return key;
}

/** A speech-bubble icon above a working, reviewing or blocked employee. */
export function statusBubbleTexture(
  scene: Phaser.Scene,
  status: EmployeeWorkStatus,
): string | null {
  if (status === 'idle') return null;
  const b = new PixelBuffer(15, 14);
  b.rect(1, 1, 13, 9, '#ffffff');
  b.rect(4, 10, 3, 2, '#ffffff');
  b.rect(4, 12, 1, 1, '#ffffff');
  if (status === 'working') {
    for (const x of [3, 7, 11]) b.rect(x, 5, 2, 2, '#22a55b');
  } else if (status === 'reviewing') {
    b.rect(4, 3, 4, 4, '#0e7490');
    b.rect(5, 4, 2, 2, '#ffffff');
    b.rect(8, 7, 2, 2, '#0e7490');
    b.rect(10, 8, 1, 1, '#0e7490');
  } else {
    b.rect(7, 2, 2, 5, '#e0731b');
    b.rect(7, 8, 2, 1, '#e0731b');
  }
  b.outline('#1a1d2b');
  return iconTexture(scene, `bubble.${status}`, b);
}

/** Speech bubble with a small presentation screen: "in a meeting" (presence, not work). */
export function meetingBubbleTexture(scene: Phaser.Scene): string {
  const b = new PixelBuffer(15, 14);
  b.rect(1, 1, 13, 9, '#ffffff');
  b.rect(4, 10, 3, 2, '#ffffff');
  b.rect(4, 12, 1, 1, '#ffffff');
  b.rect(3, 3, 9, 5, '#1e3a8a');
  b.rect(4, 4, 4, 1, '#93c5fd');
  b.rect(4, 6, 6, 1, '#93c5fd');
  b.outline('#1a1d2b');
  return iconTexture(scene, 'bubble.meeting', b);
}

/** The "E" key prompt shown above whatever the founder can interact with. */
export function promptTexture(scene: Phaser.Scene): string {
  const b = new PixelBuffer(13, 13);
  b.rect(1, 1, 11, 10, '#fff4dc');
  b.rect(1, 10, 11, 2, '#d68a12');
  for (const [x, y, w, h] of [
    [4, 3, 5, 1],
    [4, 3, 1, 6],
    [4, 5, 4, 1],
    [4, 8, 5, 1],
  ] as const) {
    b.rect(x, y, w, h, '#1a1d2b');
  }
  b.outline('#1a1d2b');
  return iconTexture(scene, 'prompt.e', b);
}

/** The amber diamond floating over the founder, so you can always find yourself. */
export function founderMarkerTexture(scene: Phaser.Scene): string {
  const b = new PixelBuffer(9, 11);
  const rows = [1, 3, 5, 7, 9, 7, 5, 3, 1];
  rows.forEach((width, index) => {
    b.rect(Math.floor((9 - width) / 2), index + 1, width, 1, index < 4 ? '#ffc84a' : '#f5a524');
  });
  b.outline('#1a1d2b');
  return iconTexture(scene, 'founder.marker', b);
}

export function shadowTexture(scene: Phaser.Scene): string {
  if (!scene.textures.exists('shadow')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0.28).fillEllipse(11, 4, 20, 8);
    g.generateTexture('shadow', 22, 8);
    g.destroy();
  }
  return 'shadow';
}

/** Ring drawn on the floor under the selected or focused object. */
export function ringTexture(scene: Phaser.Scene): string {
  if (!scene.textures.exists('ring')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(2, 0xf5a524, 1).strokeEllipse(18, 9, 32, 15);
    g.lineStyle(1, 0xffe2a8, 1).strokeEllipse(18, 9, 28, 12);
    g.generateTexture('ring', 36, 18);
    g.destroy();
  }
  return 'ring';
}
