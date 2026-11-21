import type { IsoGrid } from './iso/isoMath';

/** Classic 2:1 isometric floor tile. All office art is authored against this grid. */
export const ISO_GRID: IsoGrid = { tileWidth: 64, tileHeight: 32 };

/**
 * Office art-direction palette (see docs/ARCHITECTURE.md §8): warm amber walls,
 * navy trim, pale cyan diamond floor. Phaser wants numeric colours.
 */
export const OFFICE_PALETTE = {
  backdrop: 0x0d0f15,
  floorLight: 0xd6f3f7,
  floorDark: 0xbfe9ef,
  floorLine: 0x8fd0da,
  wall: 0xf5a800,
  wallShade: 0xd98e00,
  wallTrim: 0x1b2a8a,
} as const;

export const SCENE_KEYS = {
  office: 'OfficeScene',
} as const;
