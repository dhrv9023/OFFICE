import type Phaser from 'phaser';
import type { OfficeEmployee } from '@/bridge/officeViewModel';
import type { Facing } from '@/domain/types';
import { ISO_GRID } from '../config';
import { CHARACTER_FRAME, employeeLook } from '@/art/characters';
import {
  characterTexture,
  ringTexture,
  shadowTexture,
  meetingBubbleTexture,
  statusBubbleTexture,
} from '../assets/textures';
import { tileDepth } from '../iso/isoMath';
import type { SpriteFacing } from '../world/movement';

/** Seated people draw over their chair (layer 6), so they are never hidden by it. */
const SEATED_LAYER = 7;
/** Lifts a seated person onto the chair cushion, in pixels. */
const SEAT_LIFT = 9;

const SEATED_FACING: Readonly<Record<Facing, SpriteFacing>> = {
  north: 'back-right',
  west: 'back-left',
  south: 'front-left',
  east: 'front-right',
};

/**
 * An employee at their desk. What they show — typing, a status bubble — comes
 * only from the view model; the sprite holds no business data of its own.
 */
export class EmployeeSprite {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  private readonly bubble: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly textureKey: string;
  private readonly facing: SpriteFacing;
  private status: OfficeEmployee['status'] | null = null;
  private presence: OfficeEmployee['presence'] | null = null;
  /** Where this sprite was placed; a different seat means a new sprite. */
  readonly seatKey: string;
  private highlighted = false;
  private selected = false;

  constructor(
    private readonly scene: Phaser.Scene,
    employee: OfficeEmployee,
    reducedMotion: boolean,
  ) {
    this.textureKey = characterTexture(
      scene,
      `character.${employee.id}`,
      employeeLook(employee.avatarId, employee.color),
    );
    this.facing = SEATED_FACING[employee.facing];
    this.seatKey = seatKeyOf(employee);
    const centre = { col: employee.seat.col + 0.5, row: employee.seat.row + 0.5 };
    const x = ((centre.col - centre.row) * ISO_GRID.tileWidth) / 2;
    const floorY = ((centre.col + centre.row) * ISO_GRID.tileHeight) / 2;
    const y = floorY - SEAT_LIFT;
    const depth = tileDepth(centre, SEATED_LAYER);

    this.ring = scene.add
      .image(x, y, ringTexture(scene))
      .setDepth(depth - 0.6)
      .setVisible(false);
    this.shadow = scene.add.image(x, floorY, shadowTexture(scene)).setDepth(depth - 0.5);
    this.sprite = scene.add
      .sprite(x, y, this.textureKey, `${this.facing}.sit`)
      .setOrigin(
        CHARACTER_FRAME.footX / CHARACTER_FRAME.width,
        CHARACTER_FRAME.footY / CHARACTER_FRAME.height,
      )
      .setDepth(depth);
    this.bubble = scene.add
      .image(x + 7, y - 40, '__DEFAULT')
      .setOrigin(0.5, 1)
      .setDepth(depth + 0.4)
      .setVisible(false);
    this.label = scene.add
      .text(x, y - 56, employee.name, {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#1a1d2bdd',
        padding: { x: 4, y: 2 },
      })
      .setResolution(3)
      .setOrigin(0.5, 1)
      .setDepth(1e6)
      .setVisible(false);
    if (!reducedMotion) {
      scene.tweens.add({
        targets: this.bubble,
        y: y - 43,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    this.update(employee);
  }

  /** Applies a (possibly changed) view model entry. Cheap when nothing changed. */
  update(employee: OfficeEmployee): void {
    // The name tag always shows the current name (e.g. after a rename).
    if (this.label.text !== employee.name) this.label.setText(employee.name);
    if (employee.status === this.status && employee.presence === this.presence) return;
    this.status = employee.status;
    this.presence = employee.presence;
    // Typing only at their own desk: in a meeting they sit and listen.
    if (employee.status === 'working' && employee.presence === 'at_desk') {
      this.sprite.play(`${this.textureKey}.type.${this.facing}`, true);
    } else {
      this.sprite.stop();
      this.sprite.setFrame(`${this.facing}.sit`);
    }
    const bubble =
      employee.presence === 'in_meeting'
        ? meetingBubbleTexture(this.scene)
        : statusBubbleTexture(this.scene, employee.status);
    this.bubble.setVisible(bubble !== null);
    if (bubble) this.bubble.setTexture(bubble);
  }

  /** Hovered or nearby: show the name tag and brighten. */
  setHighlighted(highlighted: boolean): void {
    if (highlighted === this.highlighted) return;
    this.highlighted = highlighted;
    this.refreshDecorations();
  }

  setSelected(selected: boolean): void {
    if (selected === this.selected) return;
    this.selected = selected;
    this.refreshDecorations();
  }

  private refreshDecorations(): void {
    this.label.setVisible(this.highlighted || this.selected);
    this.ring.setVisible(this.selected);
    if (this.highlighted) this.sprite.setTint(0xfff1d0);
    else this.sprite.clearTint();
  }

  destroy(): void {
    for (const object of [this.sprite, this.shadow, this.ring, this.bubble, this.label])
      object.destroy();
  }
}

/** Seat and facing as one comparable key. */
export function seatKeyOf(employee: Pick<OfficeEmployee, 'seat' | 'facing'>): string {
  return `${String(employee.seat.col)},${String(employee.seat.row)},${employee.facing}`;
}
