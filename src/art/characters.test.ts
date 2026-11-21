import { describe, expect, it } from 'vitest';
import {
  CHARACTER_FRAME,
  drawCharacter,
  employeeLook,
  FOUNDER_LOOK,
  lookSeed,
  shade,
} from './characters';
import { PixelBuffer } from './pixelBuffer';

describe('pixel art', () => {
  it('outlines and mirrors a buffer', () => {
    const buffer = new PixelBuffer(5, 5);
    buffer.set(2, 2, '#ff0000');
    buffer.outline('#000000');
    expect(buffer.opaque).toBe(5);
    buffer.set(0, 0, '#00ff00');
    expect(buffer.flipped().get(4, 0)).toBe('#00ff00');
  });

  it('draws every pose inside the frame with the feet on the baseline', () => {
    const poses = [
      { kind: 'idle', frame: 0 },
      { kind: 'idle', frame: 1 },
      { kind: 'walk', frame: 1 },
      { kind: 'walk', frame: 3 },
      { kind: 'sit' },
      { kind: 'type', frame: 0 },
    ] as const;
    for (const view of ['front', 'back'] as const) {
      for (const pose of poses) {
        const frame = drawCharacter(FOUNDER_LOOK, view, pose);
        expect(frame.width).toBe(CHARACTER_FRAME.width);
        expect(frame.opaque).toBeGreaterThan(150);
      }
    }
    // Standing: shoes reach the foot line; seated: no legs.
    const standing = drawCharacter(FOUNDER_LOOK, 'front', { kind: 'idle', frame: 0 });
    expect(standing.get(10, CHARACTER_FRAME.footY - 1)).not.toBeNull();
    const seated = drawCharacter(FOUNDER_LOOK, 'back', { kind: 'sit' });
    expect(seated.get(10, CHARACTER_FRAME.footY - 1)).toBeNull();
  });

  it('animates walking: the stride frames differ from standing', () => {
    const still = drawCharacter(FOUNDER_LOOK, 'front', { kind: 'walk', frame: 0 });
    const stride = drawCharacter(FOUNDER_LOOK, 'front', { kind: 'walk', frame: 1 });
    let differences = 0;
    for (let y = 0; y < CHARACTER_FRAME.height; y++) {
      for (let x = 0; x < CHARACTER_FRAME.width; x++)
        if (still.get(x, y) !== stride.get(x, y)) differences++;
    }
    expect(differences).toBeGreaterThan(10);
  });

  it('dresses employees in their department colour, consistently', () => {
    expect(employeeLook('Sarah Chen', '#e879f9')).toEqual(employeeLook('Sarah Chen', '#e879f9'));
    expect(employeeLook('Sarah Chen', '#e879f9').shirt).toBe('#e879f9');
    expect(shade('#ffffff', 0.5)).toBe('#808080');
  });
});

describe('appearance is keyed by avatar, not name (Phase 1.6)', () => {
  it('reads an `avatar_first_last` key back as "First Last"', () => {
    expect(lookSeed('avatar_sarah_chen')).toBe('Sarah Chen');
  });

  it('uses any other avatar key as is', () => {
    expect(lookSeed('custom-hero-7')).toBe('custom-hero-7');
    expect(lookSeed('avatar_')).toBe('avatar_');
  });

  it('does not depend on the display name, so a rename keeps the face', () => {
    const look = employeeLook('avatar_sarah_chen', '#e879f9');
    expect(employeeLook('avatar_sarah_chen', '#e879f9')).toEqual(look);
    expect(employeeLook('avatar_ryan_miller', '#e879f9')).not.toEqual(look);
  });
});
