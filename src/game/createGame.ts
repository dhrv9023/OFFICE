import Phaser from 'phaser';
import type { GameEventBus } from '@/bridge/gameEvents';
import type { OfficeViewModel } from '@/bridge/officeViewModel';
import type { OfficeLayout } from '@/domain/types';
import { OfficeScene } from './scenes/OfficeScene';
import type { DirectionInput } from './world/movement';

export type { DirectionInput } from './world/movement';

/** What the application can do with a running office. Everything else goes through the bus. */
export interface GameHandle {
  /** Pushes the latest state-derived view model (cheap to call; the scene diffs). */
  setViewModel(view: OfficeViewModel): void;
  /** Steps the integer zoom in or out. */
  zoomBy(delta: -1 | 1): void;
  /** Touch direction pad; null releases it. */
  setVirtualDirection(input: DirectionInput | null): void;
  /** Colour of the space around the office, as 0xrrggbb (follows the app theme). */
  setBackdrop(color: number): void;
  /** Marks a target as selected (e.g. `employee:emp_…`), or clears the selection. */
  select(targetKey: string | null): void;
  destroy(): void;
}

export interface CreateGameOptions {
  /** Element the canvas is mounted into. The canvas tracks this element's size. */
  parent: HTMLElement;
  /** Focusable element whose key presses drive the founder (never the window). */
  keyboardTarget: HTMLElement;
  /** Game → application events. */
  bus: GameEventBus;
  layout: OfficeLayout;
  reducedMotion: boolean;
  /** Initial backdrop colour, 0xrrggbb. */
  backdrop: number;
}

/**
 * The single entry point the UI uses to start the game. It is imported lazily so
 * Phaser stays out of the initial bundle, and it is the only game/ module UI code
 * is allowed to import.
 */
export function createGame({
  parent,
  keyboardTarget,
  bus,
  layout,
  reducedMotion,
  backdrop,
}: CreateGameOptions): GameHandle {
  const scene = new OfficeScene({ bus, layout, keyboardTarget, reducedMotion, backdrop });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: backdrop,
    // Crisp pixel art: no texture smoothing, whole-pixel rendering.
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    // Keyboard input is read from `keyboardTarget` by the scene, never captured
    // globally, so the rest of the app keeps its keys.
    input: { keyboard: false },
    banner: false,
    scene: [scene],
  });

  // Development only (removed from production builds): lets browser tests read
  // the founder's position. The application never uses it.
  if (import.meta.env.DEV) {
    Object.assign(window, { __projectHqOffice: { state: () => scene.debugState() } });
  }

  return {
    setViewModel(view) {
      scene.applyViewModel(view);
    },
    zoomBy(delta) {
      scene.zoomBy(delta);
    },
    setVirtualDirection(input) {
      scene.setVirtualDirection(input);
    },
    setBackdrop(color) {
      scene.setBackdrop(color);
    },
    select(targetKey) {
      scene.select(targetKey);
    },
    destroy() {
      if (import.meta.env.DEV) Object.assign(window, { __projectHqOffice: undefined });
      game.destroy(true);
    },
  };
}
