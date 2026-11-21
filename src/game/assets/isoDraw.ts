import Phaser from 'phaser';
import { ISO_GRID } from '../config';
import { OUTLINE } from './palette';

const HALF_W = ISO_GRID.tileWidth / 2;
const HALF_H = ISO_GRID.tileHeight / 2;

/** Projects a local tile-space point (c, r) lifted by z pixels, relative to `origin`. */
export function project(origin: { x: number; y: number }, c: number, r: number, z = 0) {
  return new Phaser.Math.Vector2(origin.x + (c - r) * HALF_W, origin.y + (c + r) * HALF_H - z);
}

export interface BoxColors {
  readonly top: number;
  /** Face along the front row edge (lower-left on screen). */
  readonly left: number;
  /** Face along the front col edge (lower-right on screen). */
  readonly right: number;
}

/**
 * An isometric box covering local tiles c0..c1 × r0..r1, from height z0 to z1
 * (pixels). Only the three faces the camera can see are drawn, with a thin
 * dark outline for a crisp pixel-art edge.
 */
export function isoBox(
  g: Phaser.GameObjects.Graphics,
  origin: { x: number; y: number },
  c0: number,
  r0: number,
  c1: number,
  r1: number,
  z0: number,
  z1: number,
  colors: BoxColors,
  outline = true,
): void {
  const p = (c: number, r: number, z: number) => project(origin, c, r, z);
  const left = [p(c0, r1, z0), p(c1, r1, z0), p(c1, r1, z1), p(c0, r1, z1)];
  const right = [p(c1, r0, z0), p(c1, r1, z0), p(c1, r1, z1), p(c1, r0, z1)];
  const top = [p(c0, r0, z1), p(c1, r0, z1), p(c1, r1, z1), p(c0, r1, z1)];
  g.fillStyle(colors.left, 1).fillPoints(left, true);
  g.fillStyle(colors.right, 1).fillPoints(right, true);
  g.fillStyle(colors.top, 1).fillPoints(top, true);
  if (outline) {
    g.lineStyle(1, OUTLINE, 0.55);
    g.strokePoints([p(c0, r1, z0), p(c1, r1, z0), p(c1, r0, z0)], false);
    g.strokePoints(top, true);
    g.strokePoints([p(c0, r1, z0), p(c0, r1, z1)], false);
    g.strokePoints([p(c1, r1, z0), p(c1, r1, z1)], false);
    g.strokePoints([p(c1, r0, z0), p(c1, r0, z1)], false);
  }
}

/** A flat quad on one visible face of a box (row face: constant r; col face: constant c). */
export function faceQuad(
  g: Phaser.GameObjects.Graphics,
  origin: { x: number; y: number },
  face: 'row' | 'col',
  at: number,
  a0: number,
  a1: number,
  z0: number,
  z1: number,
  color: number,
  alpha = 1,
): void {
  const p = (along: number, z: number) =>
    face === 'row' ? project(origin, along, at, z) : project(origin, at, along, z);
  g.fillStyle(color, alpha).fillPoints([p(a0, z0), p(a1, z0), p(a1, z1), p(a0, z1)], true);
}

/** Lightens or darkens a 0xrrggbb colour by `amount` (−1..1). */
export function tone(color: number, amount: number): number {
  const channel = (shift: number) => {
    const value = (color >> shift) & 255;
    const next = amount >= 0 ? value + (255 - value) * amount : value * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

export const shades = (base: number): BoxColors => ({
  top: tone(base, 0.18),
  left: base,
  right: tone(base, -0.2),
});

export interface TextureAnchor {
  readonly key: string;
  readonly originX: number;
  readonly originY: number;
}

/**
 * Renders `draw` into a texture sized to fit local tile bounds (c0..c1 × r0..r1,
 * up to zMax pixels tall). Local tile (0, 0) at floor level becomes the image's
 * origin, so the image is placed at the projected position of its anchor tile.
 */
export function makeIsoTexture(
  scene: Phaser.Scene,
  key: string,
  bounds: { c0: number; r0: number; c1: number; r1: number; zMax: number },
  draw: (g: Phaser.GameObjects.Graphics, origin: { x: number; y: number }) => void,
): TextureAnchor {
  const pad = 2;
  const minX = (bounds.c0 - bounds.r1) * HALF_W;
  const maxX = (bounds.c1 - bounds.r0) * HALF_W;
  const minY = (bounds.c0 + bounds.r0) * HALF_H - bounds.zMax;
  const maxY = (bounds.c1 + bounds.r1) * HALF_H;
  const width = Math.ceil(maxX - minX) + pad * 2;
  const height = Math.ceil(maxY - minY) + pad * 2;
  const origin = { x: pad - minX, y: pad - minY };
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g, origin);
    g.generateTexture(key, width, height);
    g.destroy();
  }
  return { key, originX: origin.x / width, originY: origin.y / height };
}
