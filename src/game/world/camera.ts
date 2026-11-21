import { tileToScreen, type IsoGrid } from '../iso/isoMath';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Integer zoom steps keep pixel art crisp. */
export const ZOOM_LEVELS = [1, 2, 3] as const;
export type Zoom = (typeof ZOOM_LEVELS)[number];

/** Screen-space rectangle covering the whole office diamond, its tall back walls and a margin. */
export function worldBounds(
  size: { cols: number; rows: number },
  grid: IsoGrid,
  wallHeight: number,
  margin: number,
): Rect {
  const left = tileToScreen({ col: 0, row: size.rows }, grid).x;
  const right = tileToScreen({ col: size.cols, row: 0 }, grid).x;
  const top = tileToScreen({ col: 0, row: 0 }, grid).y - wallHeight;
  const bottom = tileToScreen({ col: size.cols, row: size.rows }, grid).y;
  return {
    x: left - margin,
    y: top - margin,
    width: right - left + margin * 2,
    height: bottom - top + margin * 2,
  };
}

/**
 * Camera bounds for a viewport: the world rectangle, grown (centred) to at least
 * the visible area, so a small office in a big window sits in the middle instead
 * of being pinned to a corner.
 */
export function cameraBounds(
  world: Rect,
  viewWidth: number,
  viewHeight: number,
  zoom: number,
): Rect {
  const visibleW = viewWidth / zoom;
  const visibleH = viewHeight / zoom;
  const width = Math.max(world.width, visibleW);
  const height = Math.max(world.height, visibleH);
  return {
    x: world.x - (width - world.width) / 2,
    y: world.y - (height - world.height) / 2,
    width,
    height,
  };
}

/** Starting zoom: closer on wide screens, wider on phones so you can see where you are. */
export function defaultZoom(viewWidth: number): Zoom {
  return viewWidth >= 720 ? 2 : 1;
}

export function stepZoom(current: number, delta: -1 | 1): Zoom {
  const index = ZOOM_LEVELS.findIndex((level) => level >= current);
  const from = index === -1 ? ZOOM_LEVELS.length - 1 : index;
  return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, from + delta))] ?? 2;
}
