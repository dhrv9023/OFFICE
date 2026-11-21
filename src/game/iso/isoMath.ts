/**
 * Isometric (2:1 diamond) coordinate maths.
 *
 * Pure functions with no Phaser dependency, so the projection used for rendering,
 * picking, depth sorting and navigation is unit-tested in one place.
 *
 * Conventions:
 *  - Tile space: `col` grows towards screen bottom-right, `row` towards bottom-left.
 *  - Screen space: pixels relative to the map origin, which is the TOP corner of tile (0,0).
 *  - `tileToScreen` returns the top corner of a tile's diamond.
 */

export interface IsoGrid {
  /** Full width of a floor diamond in pixels. */
  readonly tileWidth: number;
  /** Full height of a floor diamond in pixels (tileWidth / 2 for classic 2:1). */
  readonly tileHeight: number;
}

export interface TilePoint {
  readonly col: number;
  readonly row: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Top corner of the tile's diamond, in screen pixels relative to the map origin. */
export function tileToScreen(tile: TilePoint, grid: IsoGrid): ScreenPoint {
  return {
    x: ((tile.col - tile.row) * grid.tileWidth) / 2,
    y: ((tile.col + tile.row) * grid.tileHeight) / 2,
  };
}

/** Centre of the tile's diamond — where a character standing on the tile is anchored. */
export function tileCenterToScreen(tile: TilePoint, grid: IsoGrid): ScreenPoint {
  const top = tileToScreen(tile, grid);
  return { x: top.x, y: top.y + grid.tileHeight / 2 };
}

/** Inverse projection. Returns fractional tile coordinates. */
export function screenToTile(point: ScreenPoint, grid: IsoGrid): TilePoint {
  const halfW = grid.tileWidth / 2;
  const halfH = grid.tileHeight / 2;
  return {
    col: (point.x / halfW + point.y / halfH) / 2,
    row: (point.y / halfH - point.x / halfW) / 2,
  };
}

/** The integer tile that contains a screen point (for pointer picking). */
export function screenToTileIndex(point: ScreenPoint, grid: IsoGrid): TilePoint {
  const tile = screenToTile(point, grid);
  return { col: Math.floor(tile.col), row: Math.floor(tile.row) };
}

/** The four corners of a tile's diamond, clockwise from the top. */
export function tileDiamond(
  tile: TilePoint,
  grid: IsoGrid,
): readonly [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint] {
  const top = tileToScreen(tile, grid);
  const halfW = grid.tileWidth / 2;
  const halfH = grid.tileHeight / 2;
  return [
    top,
    { x: top.x + halfW, y: top.y + halfH },
    { x: top.x, y: top.y + grid.tileHeight },
    { x: top.x - halfW, y: top.y + halfH },
  ];
}

/**
 * Number of sub-layers available within one depth row. Objects on the same tile are
 * ordered by layer (floor < floor decal < furniture < character < overlay).
 */
export const DEPTH_LAYERS_PER_ROW = 10;

/**
 * Painter's-algorithm depth for something standing on a tile. Objects further "down"
 * the screen (larger col + row) draw on top. Accepts fractional tiles so moving
 * characters sort correctly between tiles.
 */
export function tileDepth(tile: TilePoint, layer = 0): number {
  return (tile.col + tile.row) * DEPTH_LAYERS_PER_ROW + layer;
}

/**
 * Depth for something covering several tiles (multi-tile furniture): sorted by the
 * centre of its footprint, so people beside it sort correctly on every side.
 */
export function footprintDepth(
  tile: TilePoint,
  footprint: { readonly cols: number; readonly rows: number },
  layer = 0,
): number {
  return tileDepth(
    { col: tile.col + footprint.cols / 2, row: tile.row + footprint.rows / 2 },
    layer,
  );
}
