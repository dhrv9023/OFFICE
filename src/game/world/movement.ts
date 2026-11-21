import type { IsoGrid } from '../iso/isoMath';

/** Which movement keys are held. */
export interface DirectionInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface Vector {
  x: number;
  y: number;
}

/** Walking speed on screen, in world pixels per second (constant in every direction). */
export const WALK_SPEED = 150;
/** Seconds from standing to full speed, and from full speed to standing. */
export const ACCELERATION_TIME = 0.09;
export const DECELERATION_TIME = 0.07;

const TILE_AXIS = { x: 2 / Math.sqrt(5), y: 1 / Math.sqrt(5) };

/**
 * Screen-relative controls: Up walks up the screen, Right walks right. The four
 * diagonals follow the floor's tile axes (the slopes walls and corridors run
 * along), so holding Up+Right walks straight along a corridor instead of zig-
 * zagging into its wall. Returns a unit vector in screen space, or null.
 */
export function inputDirection(input: DirectionInput, out: Vector): Vector | null {
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const y = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (x === 0 && y === 0) return null;
  if (x !== 0 && y !== 0) {
    out.x = x * TILE_AXIS.x;
    out.y = y * TILE_AXIS.y;
  } else {
    out.x = x;
    out.y = y;
  }
  return out;
}

/**
 * Eases `velocity` towards `direction * WALK_SPEED`: a short ramp up and an even
 * shorter ramp down, so walking feels responsive but not twitchy. The speed never
 * exceeds WALK_SPEED, whatever the direction. Mutates and returns `velocity`.
 */
export function updateVelocity(velocity: Vector, direction: Vector | null, dt: number): Vector {
  const targetX = direction ? direction.x * WALK_SPEED : 0;
  const targetY = direction ? direction.y * WALK_SPEED : 0;
  const rate = WALK_SPEED / (direction ? ACCELERATION_TIME : DECELERATION_TIME);
  const dx = targetX - velocity.x;
  const dy = targetY - velocity.y;
  const distance = Math.hypot(dx, dy);
  const step = rate * dt;
  if (distance <= step) {
    velocity.x = targetX;
    velocity.y = targetY;
  } else {
    velocity.x += (dx / distance) * step;
    velocity.y += (dy / distance) * step;
  }
  return velocity;
}

/** Converts a screen-space displacement into tile-space (inverse of the 2:1 projection). */
export function screenDeltaToTile(
  dx: number,
  dy: number,
  grid: IsoGrid,
  out: { dc: number; dr: number },
) {
  const halfW = grid.tileWidth / 2;
  const halfH = grid.tileHeight / 2;
  out.dc = (dx / halfW + dy / halfH) / 2;
  out.dr = (dy / halfH - dx / halfW) / 2;
  return out;
}

/**
 * Sprite facing for a screen direction. Characters have four views; straight up or
 * down keeps the previous left/right side, straight left/right keeps the previous
 * front/back, so turning never flickers.
 */
export type SpriteFacing = 'front-left' | 'front-right' | 'back-left' | 'back-right';

export function facingFor(x: number, y: number, previous: SpriteFacing): SpriteFacing {
  const back = y < -1e-6 ? true : y > 1e-6 ? false : previous.startsWith('back');
  const left = x < -1e-6 ? true : x > 1e-6 ? false : previous.endsWith('left');
  return `${back ? 'back' : 'front'}-${left ? 'left' : 'right'}`;
}
