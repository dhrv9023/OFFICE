import { drawCharacter, employeeLook, FOUNDER_LOOK, type CharacterLook } from './characters';
import type { PixelBuffer } from './pixelBuffer';

/**
 * Portraits: the same pixel character that walks the office, cropped for the
 * interface. Output is plain data (one SVG path per colour), so it renders
 * anywhere — React, tests, server — without a canvas.
 */

/** Square crops of the 24 × 40 front-facing idle frame. */
export const PORTRAIT_CROPS = {
  /** Head and neck. Reads at 24–48 px. */
  head: { x: 4, y: 4, size: 16 },
  /** Head and shoulders. For large portraits (72 px and up). */
  bust: { x: 0, y: 3, size: 24 },
} as const;

export type PortraitCrop = keyof typeof PORTRAIT_CROPS;

export interface PortraitLayer {
  readonly color: string;
  /** SVG path data in frame pixels, one rectangle per horizontal run. */
  readonly d: string;
}

export interface Portrait {
  readonly viewBox: string;
  readonly layers: readonly PortraitLayer[];
}

/** Turns a pixel buffer region into per-colour SVG paths (horizontal runs merged). */
export function bufferToLayers(
  buffer: PixelBuffer,
  region: { x: number; y: number; size: number },
): PortraitLayer[] {
  const paths = new Map<string, string[]>();
  const add = (color: string, x: number, y: number, width: number) => {
    const list = paths.get(color) ?? [];
    list.push(`M${String(x)} ${String(y)}h${String(width)}v1h-${String(width)}z`);
    paths.set(color, list);
  };
  for (let y = region.y; y < region.y + region.size; y++) {
    let runColor: string | null = null;
    let runStart = 0;
    for (let x = region.x; x <= region.x + region.size; x++) {
      const color = x < region.x + region.size ? buffer.get(x, y) : null;
      if (color === runColor) continue;
      if (runColor !== null) add(runColor, runStart, y, x - runStart);
      runColor = color;
      runStart = x;
    }
  }
  return [...paths].map(([color, parts]) => ({ color, d: parts.join('') }));
}

const cache = new Map<string, Portrait>();

export function lookPortrait(look: CharacterLook, crop: PortraitCrop, key: string): Portrait {
  const cacheKey = `${key}|${crop}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const region = PORTRAIT_CROPS[crop];
  const frame = drawCharacter(look, 'front', { kind: 'idle', frame: 0 });
  const portrait: Portrait = {
    viewBox: `${String(region.x)} ${String(region.y)} ${String(region.size)} ${String(region.size)}`,
    layers: bufferToLayers(frame, region),
  };
  cache.set(cacheKey, portrait);
  return portrait;
}

/**
 * An employee's portrait: identical to their office sprite (shirt in the
 * department colour). Keyed by `avatarId`, so it survives a rename.
 */
export function employeePortrait(
  avatarId: string,
  departmentColor: string,
  crop: PortraitCrop,
): Portrait {
  return lookPortrait(
    employeeLook(avatarId, departmentColor),
    crop,
    `${avatarId}|${departmentColor}`,
  );
}

/** The founder (you): the amber blazer from the office. */
export function founderPortrait(crop: PortraitCrop): Portrait {
  return lookPortrait(FOUNDER_LOOK, crop, 'founder');
}
