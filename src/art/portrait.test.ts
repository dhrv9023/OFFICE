import { describe, expect, it } from 'vitest';
import { drawCharacter, employeeLook } from './characters';
import { PixelBuffer } from './pixelBuffer';
import { bufferToLayers, employeePortrait, founderPortrait, PORTRAIT_CROPS } from './portrait';

/** Re-rasterises path data back into a pixel set, to check the encoding is exact. */
function rasterise(d: string): Set<string> {
  const pixels = new Set<string>();
  for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let col = Number(x); col < Number(x) + Number(w); col++) pixels.add(`${String(col)},${y}`);
  }
  return pixels;
}

describe('bufferToLayers', () => {
  it('encodes every opaque pixel in the region exactly once, merging runs', () => {
    const buffer = new PixelBuffer(6, 3);
    buffer.rect(0, 0, 4, 1, '#ff0000');
    buffer.set(4, 0, '#00ff00');
    buffer.rect(1, 2, 5, 1, '#ff0000');
    const layers = bufferToLayers(buffer, { x: 0, y: 0, size: 6 });

    const red = layers.find((layer) => layer.color === '#ff0000');
    expect(red?.d).toBe('M0 0h4v1h-4zM1 2h5v1h-5z');
    expect(layers.find((layer) => layer.color === '#00ff00')?.d).toBe('M4 0h1v1h-1z');
  });

  it('crops to the region', () => {
    const buffer = new PixelBuffer(6, 6);
    buffer.rect(0, 0, 6, 6, '#123456');
    const [layer] = bufferToLayers(buffer, { x: 2, y: 2, size: 2 });
    expect(rasterise(layer?.d ?? '')).toEqual(new Set(['2,2', '3,2', '2,3', '3,3']));
  });
});

describe('portraits', () => {
  it('match the office sprite pixel for pixel inside the crop', () => {
    const portrait = employeePortrait('avatar_sarah_chen', '#e879f9', 'bust');
    const frame = drawCharacter(employeeLook('avatar_sarah_chen', '#e879f9'), 'front', {
      kind: 'idle',
      frame: 0,
    });
    const { x, y, size } = PORTRAIT_CROPS.bust;
    for (const layer of portrait.layers) {
      for (const pixel of rasterise(layer.d)) {
        const [col, row] = pixel.split(',').map(Number);
        expect(frame.get(col ?? -1, row ?? -1)).toBe(layer.color);
      }
    }
    expect(portrait.viewBox).toBe(`${String(x)} ${String(y)} ${String(size)} ${String(size)}`);
  });

  it('dresses employees in their department colour and differs between people', () => {
    const sarah = employeePortrait('avatar_sarah_chen', '#e879f9', 'head');
    const ryan = employeePortrait('avatar_ryan_miller', '#38bdf8', 'bust');
    expect(ryan.layers.some((layer) => layer.color === '#38bdf8')).toBe(true);
    expect(sarah).not.toEqual(employeePortrait('avatar_daniel_kim', '#e879f9', 'head'));
  });

  it('caches by person and crop', () => {
    expect(employeePortrait('avatar_emma_wilson', '#fb7185', 'head')).toBe(
      employeePortrait('avatar_emma_wilson', '#fb7185', 'head'),
    );
    expect(founderPortrait('head').layers.some((layer) => layer.color === '#f5a524')).toBe(true);
  });
});
