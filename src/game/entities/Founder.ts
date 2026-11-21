import type Phaser from 'phaser';
import { ISO_GRID } from '../config';
import { CHARACTER_FRAME, FOUNDER_LOOK } from '@/art/characters';
import { characterTexture, founderMarkerTexture, shadowTexture } from '../assets/textures';
import { tileDepth } from '../iso/isoMath';
import { moveWithCollision, type CollisionWorld, type MoveResult } from '../world/collision';
import {
  facingFor,
  screenDeltaToTile,
  updateVelocity,
  type SpriteFacing,
  type Vector,
} from '../world/movement';

const KEY = 'character.founder';
/** Below this on-screen speed (px/s) the founder counts as standing still. */
const WALKING_THRESHOLD = 12;
const CHARACTER_LAYER = 5;

/**
 * The player. Position lives in tile space (fractional col/row); the sprite is
 * only ever a projection of it. All per-frame scratch objects are preallocated.
 */
export class Founder {
  col: number;
  row: number;
  facing: SpriteFacing = 'front-right';
  /** Last direction walked, in tile space (for "what am I facing?"). */
  readonly heading = { dc: 0.7, dr: 0.7 };
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly marker: Phaser.GameObjects.Image;
  private readonly velocity: Vector = { x: 0, y: 0 };
  private readonly step = { dc: 0, dr: 0 };
  private readonly moved: MoveResult = { col: 0, row: 0, blockedCol: false, blockedRow: false };
  private animation = '';
  /** Animated float offset for the marker (tweened; added on top of the head position). */
  private readonly bob = { offset: 0 };

  constructor(scene: Phaser.Scene, col: number, row: number, reducedMotion: boolean) {
    this.col = col;
    this.row = row;
    characterTexture(scene, KEY, FOUNDER_LOOK);
    this.shadow = scene.add.image(0, 0, shadowTexture(scene));
    this.sprite = scene.add
      .sprite(0, 0, KEY, 'front-right.idle0')
      .setOrigin(
        CHARACTER_FRAME.footX / CHARACTER_FRAME.width,
        CHARACTER_FRAME.footY / CHARACTER_FRAME.height,
      );
    this.marker = scene.add.image(0, 0, founderMarkerTexture(scene)).setOrigin(0.5, 1);
    if (!reducedMotion) {
      scene.tweens.add({
        targets: this.bob,
        offset: -3,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    this.place();
    this.play('idle');
  }

  /** Screen point of the founder's feet. */
  get x(): number {
    return ((this.col - this.row) * ISO_GRID.tileWidth) / 2;
  }

  get y(): number {
    return ((this.col + this.row) * ISO_GRID.tileHeight) / 2;
  }

  /**
   * Advances one frame. Returns true if the founder actually moved.
   * `direction` is the unit input direction in screen space, or null.
   */
  update(dt: number, direction: Vector | null, world: CollisionWorld): boolean {
    updateVelocity(this.velocity, direction, dt);
    if (direction) this.facing = facingFor(direction.x, direction.y, this.facing);

    let speed = 0;
    if (this.velocity.x !== 0 || this.velocity.y !== 0) {
      screenDeltaToTile(this.velocity.x * dt, this.velocity.y * dt, ISO_GRID, this.step);
      moveWithCollision(world, this.col, this.row, this.step.dc, this.step.dr, this.moved);
      const dc = this.moved.col - this.col;
      const dr = this.moved.row - this.row;
      this.col = this.moved.col;
      this.row = this.moved.row;
      // Actual on-screen speed: walking into a wall shows standing, not running on the spot.
      const dx = ((dc - dr) * ISO_GRID.tileWidth) / 2;
      const dy = ((dc + dr) * ISO_GRID.tileHeight) / 2;
      speed = dt > 0 ? Math.hypot(dx, dy) / dt : 0;
      if (direction) {
        screenDeltaToTile(direction.x, direction.y, ISO_GRID, this.step);
        this.heading.dc = this.step.dc;
        this.heading.dr = this.step.dr;
      }
    }
    this.play(speed > WALKING_THRESHOLD ? 'walk' : 'idle');
    this.place();
    return speed > 0;
  }

  /** Stops immediately (e.g. when the office loses focus). */
  halt(): void {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.play('idle');
  }

  private play(kind: 'walk' | 'idle'): void {
    const key = `${KEY}.${kind}.${this.facing}`;
    if (key === this.animation) return;
    this.animation = key;
    this.sprite.play(key, true);
  }

  private place(): void {
    const { x, y } = this;
    const depth = tileDepth({ col: this.col, row: this.row }, CHARACTER_LAYER);
    this.shadow.setPosition(x, y).setDepth(depth - 0.5);
    this.sprite.setPosition(x, y).setDepth(depth);
    this.marker.setPosition(x, y - 40 + this.bob.offset).setDepth(depth + 0.5);
  }

  /** Re-applies the position without moving (keeps the floating marker animated). */
  refresh(): void {
    this.place();
  }
}
