import Phaser from 'phaser';
import type { GameEventBus } from '@/bridge/gameEvents';
import type { OfficeViewModel } from '@/bridge/officeViewModel';
import type { EmployeeId } from '@/domain/ids';
import { roomAt } from '@/domain/rules/officeLayout';
import type { OfficeLayout } from '@/domain/types';
import { ISO_GRID, SCENE_KEYS } from '../config';
import { chairTexture, deskTexture, furnitureTexture } from '../assets/furnitureArt';
import {
  BACK_WALL_HEIGHT,
  officeBaseTexture,
  partitionTexture,
  promptTexture,
  ringTexture,
} from '../assets/textures';
import { EmployeeSprite, seatKeyOf } from '../entities/EmployeeSprite';
import { Founder } from '../entities/Founder';
import { footprintDepth, tileDepth, tileToScreen } from '../iso/isoMath';
import { attachKeyboardControls, type KeyboardControls } from '../systems/keyboardControls';
import { cameraBounds, defaultZoom, stepZoom, worldBounds } from '../world/camera';
import { buildCollisionWorld, type CollisionWorld } from '../world/collision';
import { buildInteractables, nearestInteractable, type Interactable } from '../world/interaction';
import { inputDirection, type DirectionInput, type Vector } from '../world/movement';
import { deriveWalls } from '../world/walls';

export interface OfficeSceneOptions {
  readonly bus: GameEventBus;
  readonly layout: OfficeLayout;
  /** The focusable element keyboard input is read from (never the window). */
  readonly keyboardTarget: HTMLElement;
  readonly reducedMotion: boolean;
  /** Colour of the empty space around the office (follows the app theme). */
  readonly backdrop: number;
}

/** Where the founder starts: the corridor, just outside Reception. */
export const FOUNDER_SPAWN = { col: 2.5, row: 8.5 } as const;

const FURNITURE_LAYER = 3;
const WALL_LAYER = 2;
const CHAIR_LAYER = 6;
const OVERLAY_DEPTH = 1e6;

/** Height above an object's base where its prompt floats, in pixels. */
const PROMPT_HEIGHT: Readonly<Record<string, number>> = {
  employee: 88,
  desk: 40,
  room_entrance: 22,
  object: 58,
};

interface ObjectView {
  /** Brightens the object while hovered or focused. */
  highlight(on: boolean): void;
  select(on: boolean): void;
}

/**
 * The playable office. Renders the layout (floor, walls, furniture), the founder
 * and the employees from the view model, and reports interactions over the bus.
 * It never reads or writes application state: everything arrives through
 * `applyViewModel` and leaves through events.
 */
export class OfficeScene extends Phaser.Scene {
  private founder!: Founder;
  private world!: CollisionWorld;
  private controls!: KeyboardControls;
  private interactables: Interactable[] = [];
  private readonly employees = new Map<EmployeeId, EmployeeSprite>();
  private readonly objects = new Map<string, ObjectView>();
  private readonly promptPoints = new Map<string, { x: number; y: number }>();
  private prompt!: Phaser.GameObjects.Image;
  private objectRing!: Phaser.GameObjects.Image;
  private view: OfficeViewModel = { employees: [], selectedEmployeeId: null };
  private created = false;
  private focusedKey: string | null = null;
  private hoveredKey: string | null = null;
  private selectedKey: string | null = null;
  private lastTile = { col: -1, row: -1 };
  private virtualInput: DirectionInput | null = null;
  private readonly mergedInput: DirectionInput = {
    up: false,
    down: false,
    left: false,
    right: false,
  };
  private readonly direction: Vector = { x: 0, y: 0 };

  constructor(private readonly options: OfficeSceneOptions) {
    super(SCENE_KEYS.office);
  }

  create(): void {
    const { layout, bus, reducedMotion } = this.options;
    this.cameras.main.setBackgroundColor(this.options.backdrop);

    // Static world: floor + tall back walls in one image, then partitions and furniture.
    const base = officeBaseTexture(this, layout);
    this.add.image(0, 0, base.key).setOrigin(base.originX, base.originY).setDepth(-1e6);
    this.addRoomLabels(layout);

    const walls = deriveWalls(layout);
    for (const wall of walls) {
      if (wall.kind === 'back') continue;
      const texture = partitionTexture(this, wall.axis);
      const start =
        wall.axis === 'col' ? { col: wall.at, row: wall.index } : { col: wall.index, row: wall.at };
      const middle =
        wall.axis === 'col'
          ? { col: wall.at, row: wall.index + 0.5 }
          : { col: wall.index + 0.5, row: wall.at };
      const point = tileToScreen(start, ISO_GRID);
      this.add
        .image(point.x, point.y, texture.key)
        .setOrigin(texture.originX, texture.originY)
        .setDepth(tileDepth(middle, WALL_LAYER));
    }

    for (const item of layout.furniture) {
      const texture = furnitureTexture(this, item.kind, { ...item.footprint, facing: item.facing });
      const point = tileToScreen(item.tile, ISO_GRID);
      const image = this.add
        .image(point.x, point.y, texture.key)
        .setOrigin(texture.originX, texture.originY)
        .setDepth(
          footprintDepth(
            item.tile,
            item.footprint,
            item.kind === 'chair' ? CHAIR_LAYER : FURNITURE_LAYER,
          ),
        );
      if (item.interaction) this.makeInteractive(`object:${item.id}`, image);
    }

    for (const desk of layout.desks) {
      const desktop = deskTexture(this, desk.facing);
      const deskPoint = tileToScreen(desk.tile, ISO_GRID);
      this.add
        .image(deskPoint.x, deskPoint.y, desktop.key)
        .setOrigin(desktop.originX, desktop.originY)
        .setDepth(footprintDepth(desk.tile, { cols: 1, rows: 1 }, FURNITURE_LAYER));
      const chair = chairTexture(this, desk.facing);
      const seatPoint = tileToScreen(desk.seat, ISO_GRID);
      this.add
        .image(seatPoint.x, seatPoint.y, chair.key)
        .setOrigin(chair.originX, chair.originY)
        .setDepth(footprintDepth(desk.seat, { cols: 1, rows: 1 }, CHAIR_LAYER));
    }

    for (const door of layout.doors) {
      const edgeRow = Math.max(door.tile.row, door.opensTo.row);
      const c = door.tile.col;
      const points = [
        tileToScreen({ col: c, row: edgeRow - 0.5 }, ISO_GRID),
        tileToScreen({ col: c + 1, row: edgeRow - 0.5 }, ISO_GRID),
        tileToScreen({ col: c + 1, row: edgeRow + 0.5 }, ISO_GRID),
        tileToScreen({ col: c, row: edgeRow + 0.5 }, ISO_GRID),
      ];
      const zone = this.add.zone(0, 0, 1, 1).setOrigin(0, 0);
      zone.setInteractive(
        new Phaser.Geom.Polygon(points),
        (shape: Phaser.Geom.Polygon, x: number, y: number) =>
          Phaser.Geom.Polygon.Contains(shape, x, y),
      );
      if (zone.input) zone.input.cursor = 'pointer';
      this.bindPointer(`door:${door.id}`, zone);
    }

    this.world = buildCollisionWorld(layout, walls);
    this.founder = new Founder(this, FOUNDER_SPAWN.col, FOUNDER_SPAWN.row, reducedMotion);

    this.prompt = this.add
      .image(0, 0, promptTexture(this))
      .setOrigin(0.5, 1)
      .setDepth(OVERLAY_DEPTH)
      .setVisible(false);
    this.objectRing = this.add.image(0, 0, ringTexture(this)).setVisible(false);
    if (!reducedMotion) {
      this.tweens.add({
        targets: this.prompt,
        scale: 1.12,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.controls = attachKeyboardControls(this.options.keyboardTarget, {
      onInteract: () => {
        this.activateFocused();
      },
      onZoom: (delta) => {
        this.zoomBy(delta);
      },
    });

    // Camera: integer zoom, follows the founder, never shows much beyond the office.
    const camera = this.cameras.main;
    camera.setZoom(defaultZoom(this.scale.width));
    camera.setRoundPixels(true);
    camera.startFollow(this.founder.sprite, true, 0.16, 0.16, 0, 18);
    this.updateCameraBounds();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.updateCameraBounds, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanUp);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanUp);

    this.created = true;
    this.applyViewModel(this.view);
    this.reportTile();
    bus.emit('camera.zoom', { zoom: camera.zoom });
    bus.emit('scene.ready', { sceneKey: SCENE_KEYS.office });
  }

  override update(_time: number, deltaMs: number): void {
    if (!this.created) return;
    // Clamp long frames (tab switches, breakpoints) so nobody teleports through walls.
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    const keys = this.controls.input;
    const virtual = this.virtualInput;
    const input = this.mergedInput;
    input.up = keys.up || (virtual?.up ?? false);
    input.down = keys.down || (virtual?.down ?? false);
    input.left = keys.left || (virtual?.left ?? false);
    input.right = keys.right || (virtual?.right ?? false);

    const moved = this.founder.update(dt, inputDirection(input, this.direction), this.world);
    if (moved) this.reportTile();
    this.updateFocus();
  }

  /** Receives the latest application view model. Idempotent; diffs against existing sprites. */
  applyViewModel(view: OfficeViewModel): void {
    this.view = view;
    if (!this.created) return;
    const seen = new Set<EmployeeId>();
    for (const employee of view.employees) {
      seen.add(employee.id);
      const existing = this.employees.get(employee.id);
      if (existing?.seatKey === seatKeyOf(employee)) {
        existing.update(employee);
      } else {
        // New, or seated somewhere else (e.g. a meeting started): place them afresh.
        // Movement between seats is instant for now; walking comes with pathfinding.
        existing?.destroy();
        const sprite = new EmployeeSprite(this, employee, this.options.reducedMotion);
        this.employees.set(employee.id, sprite);
        const key = `employee:${employee.id}`;
        if (key === this.selectedKey) sprite.setSelected(true);
        if (key === this.focusedKey) sprite.setHighlighted(true);
        this.objects.set(key, {
          highlight: (on) => {
            sprite.setHighlighted(on);
          },
          select: (on) => {
            sprite.setSelected(on);
          },
        });
        this.bindPointer(key, sprite.sprite);
      }
    }
    for (const [id, sprite] of this.employees) {
      if (seen.has(id)) continue;
      sprite.destroy();
      this.employees.delete(id);
      this.objects.delete(`employee:${id}`);
    }

    this.interactables = buildInteractables(this.options.layout, view);
    this.promptPoints.clear();
    for (const item of this.interactables) {
      const base = tileToScreen({ col: item.col, row: item.row }, ISO_GRID);
      this.promptPoints.set(item.key, {
        x: base.x,
        y: base.y - (PROMPT_HEIGHT[item.target.kind] ?? 40),
      });
    }
    this.select(
      view.selectedEmployeeId
        ? `employee:${view.selectedEmployeeId}`
        : this.selectedKey?.startsWith('employee:')
          ? null
          : this.selectedKey,
    );
  }

  zoomBy(delta: -1 | 1): void {
    if (!this.created) return;
    const camera = this.cameras.main;
    const zoom = stepZoom(camera.zoom, delta);
    if (zoom === camera.zoom) return;
    camera.setZoom(zoom);
    this.updateCameraBounds();
    this.options.bus.emit('camera.zoom', { zoom });
  }

  /** Founder position and camera state, for development diagnostics and browser tests. */
  debugState(): { col: number; row: number; zoom: number; fps: number } | null {
    if (!this.created) return null;
    return {
      col: this.founder.col,
      row: this.founder.row,
      zoom: this.cameras.main.zoom,
      fps: this.game.loop.actualFps,
    };
  }

  /** Changes the colour around the office (theme switch). The art itself never changes. */
  setBackdrop(color: number): void {
    if (this.created) this.cameras.main.setBackgroundColor(color);
  }

  /** On-screen direction pad (touch). Null releases it. */
  setVirtualDirection(input: DirectionInput | null): void {
    this.virtualInput = input;
  }

  /** Highlights a target as selected (the application decides what is selected). */
  select(key: string | null): void {
    if (!this.created || key === this.selectedKey) return;
    if (this.selectedKey) this.objects.get(this.selectedKey)?.select(false);
    this.selectedKey = key;
    this.objectRing.setVisible(false);
    if (!key) return;
    const view = this.objects.get(key);
    if (view) {
      view.select(true);
    } else {
      const item = this.interactables.find((candidate) => candidate.key === key);
      if (item && !key.startsWith('employee:')) {
        const point = tileToScreen({ col: item.col, row: item.row }, ISO_GRID);
        this.objectRing.setPosition(point.x, point.y).setDepth(tileDepth(item, 0)).setVisible(true);
      }
    }
  }

  private updateFocus(): void {
    const { founder } = this;
    const nearest = nearestInteractable(
      founder.col,
      founder.row,
      founder.heading.dc,
      founder.heading.dr,
      this.interactables,
    );
    const key = nearest?.key ?? null;
    if (key !== this.focusedKey) {
      const previous = this.focusedKey;
      this.focusedKey = key;
      this.refreshHighlight(previous);
      this.refreshHighlight(key);
      this.options.bus.emit('interaction.focus', {
        target: nearest?.target ?? null,
        label: nearest?.label ?? null,
      });
    }
    const point = key ? this.promptPoints.get(key) : undefined;
    if (point) this.prompt.setPosition(point.x, point.y).setVisible(true);
    else this.prompt.setVisible(false);
  }

  private refreshHighlight(key: string | null): void {
    if (!key) return;
    this.objects.get(key)?.highlight(key === this.focusedKey || key === this.hoveredKey);
  }

  private activateFocused(): void {
    const item = this.interactables.find((candidate) => candidate.key === this.focusedKey);
    if (item) this.activate(item, 'keyboard');
  }

  private activate(item: Interactable, source: 'keyboard' | 'pointer'): void {
    this.select(item.key);
    this.options.bus.emit('interaction.activate', {
      target: item.target,
      label: item.label,
      source,
    });
  }

  /** Hover and click on an object's visual. */
  private bindPointer(key: string, object: Phaser.GameObjects.GameObject): void {
    object.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      const previous = this.hoveredKey;
      this.hoveredKey = key;
      this.refreshHighlight(previous);
      this.refreshHighlight(key);
      const item = this.interactables.find((candidate) => candidate.key === key);
      this.options.bus.emit('interaction.hover', {
        target: item?.target ?? null,
        label: item?.label ?? null,
      });
    });
    object.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      if (this.hoveredKey !== key) return;
      this.hoveredKey = null;
      this.refreshHighlight(key);
      this.options.bus.emit('interaction.hover', { target: null, label: null });
    });
    object.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      const item = this.interactables.find((candidate) => candidate.key === key);
      if (item) this.activate(item, 'pointer');
    });
  }

  private makeInteractive(key: string, image: Phaser.GameObjects.Image): void {
    image.setInteractive({ pixelPerfect: true, alphaTolerance: 1, useHandCursor: true });
    this.objects.set(key, {
      highlight: (on) => {
        if (on) image.setTint(0xfff1d0);
        else image.clearTint();
      },
      select: () => undefined,
    });
    this.bindPointer(key, image);
  }

  private reportTile(): void {
    const col = Math.floor(this.founder.col);
    const row = Math.floor(this.founder.row);
    if (col === this.lastTile.col && row === this.lastTile.row) return;
    this.lastTile = { col, row };
    const room = roomAt(this.options.layout, { col, row });
    this.options.bus.emit('player.moved', { tile: { col, row }, roomId: room?.id ?? null });
  }

  private readonly updateCameraBounds = (): void => {
    const camera = this.cameras.main;
    const world = worldBounds(this.options.layout.size, ISO_GRID, BACK_WALL_HEIGHT, 48);
    const bounds = cameraBounds(world, this.scale.width, this.scale.height, camera.zoom);
    camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
  };

  private addRoomLabels(layout: OfficeLayout): void {
    for (const room of layout.rooms) {
      if (room.kind === 'corridor') continue;
      const point = tileToScreen(
        {
          col: room.bounds.col + room.bounds.cols / 2,
          row: room.bounds.row + room.bounds.rows / 2,
        },
        ISO_GRID,
      );
      this.add
        .text(point.x, point.y, room.name.toUpperCase(), {
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#1a1d2b',
        })
        .setResolution(3)
        .setOrigin(0.5)
        .setAlpha(0.42)
        .setDepth(-9e5);
    }
  }

  private readonly cleanUp = (): void => {
    this.controls.dispose();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.updateCameraBounds, this);
    for (const sprite of this.employees.values()) sprite.destroy();
    this.employees.clear();
    this.objects.clear();
    this.created = false;
  };
}
