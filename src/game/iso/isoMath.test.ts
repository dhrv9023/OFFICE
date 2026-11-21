import { describe, expect, it } from 'vitest';
import {
  DEPTH_LAYERS_PER_ROW,
  screenToTile,
  screenToTileIndex,
  tileCenterToScreen,
  tileDepth,
  tileDiamond,
  tileToScreen,
  type IsoGrid,
} from './isoMath';

const grid: IsoGrid = { tileWidth: 64, tileHeight: 32 };

describe('tileToScreen', () => {
  it('places the origin tile at the map origin', () => {
    expect(tileToScreen({ col: 0, row: 0 }, grid)).toEqual({ x: 0, y: 0 });
  });

  it('moves down-right along columns and down-left along rows', () => {
    expect(tileToScreen({ col: 1, row: 0 }, grid)).toEqual({ x: 32, y: 16 });
    expect(tileToScreen({ col: 0, row: 1 }, grid)).toEqual({ x: -32, y: 16 });
    expect(tileToScreen({ col: 3, row: 3 }, grid)).toEqual({ x: 0, y: 96 });
  });
});

describe('tileCenterToScreen', () => {
  it('is half a tile height below the top corner', () => {
    expect(tileCenterToScreen({ col: 2, row: 1 }, grid)).toEqual({ x: 32, y: 64 });
  });
});

describe('screenToTile', () => {
  it('is the inverse of tileToScreen', () => {
    for (const tile of [
      { col: 0, row: 0 },
      { col: 5, row: 2 },
      { col: 1, row: 7 },
      { col: 2.5, row: 3.25 },
    ]) {
      const back = screenToTile(tileToScreen(tile, grid), grid);
      expect(back.col).toBeCloseTo(tile.col);
      expect(back.row).toBeCloseTo(tile.row);
    }
  });
});

describe('screenToTileIndex', () => {
  it('picks the tile whose diamond contains the point', () => {
    const center = tileCenterToScreen({ col: 4, row: 2 }, grid);
    expect(screenToTileIndex(center, grid)).toEqual({ col: 4, row: 2 });
    // Just inside the left and right corners of the same diamond.
    expect(screenToTileIndex({ x: center.x - 30, y: center.y }, grid)).toEqual({ col: 4, row: 2 });
    expect(screenToTileIndex({ x: center.x + 30, y: center.y }, grid)).toEqual({ col: 4, row: 2 });
  });

  it('picks the neighbour once the point leaves the diamond', () => {
    const center = tileCenterToScreen({ col: 4, row: 2 }, grid);
    expect(screenToTileIndex({ x: center.x + 34, y: center.y }, grid)).toEqual({ col: 5, row: 1 });
  });
});

describe('tileDiamond', () => {
  it('returns top, right, bottom, left corners', () => {
    expect(tileDiamond({ col: 0, row: 0 }, grid)).toEqual([
      { x: 0, y: 0 },
      { x: 32, y: 16 },
      { x: 0, y: 32 },
      { x: -32, y: 16 },
    ]);
  });
});

describe('tileDepth', () => {
  it('draws tiles nearer the viewer on top', () => {
    expect(tileDepth({ col: 2, row: 2 })).toBeGreaterThan(tileDepth({ col: 1, row: 2 }));
    expect(tileDepth({ col: 0, row: 3 })).toBe(tileDepth({ col: 3, row: 0 }));
  });

  it('orders layers within a tile without overtaking the next row', () => {
    const tile = { col: 1, row: 1 };
    expect(tileDepth(tile, 3)).toBeGreaterThan(tileDepth(tile, 1));
    expect(tileDepth(tile, DEPTH_LAYERS_PER_ROW - 1)).toBeLessThan(tileDepth({ col: 2, row: 1 }));
  });
});
