import type { DeskId, EmployeeId, RoomId } from '@/domain/ids';
import type { FurnitureInteraction, TileCoord } from '@/domain/types';
import type { EventBus } from './eventBus';

/**
 * What the founder interacted with. Identifies the thing only; the application
 * looks everything else up in its own state (the game holds no business data).
 */
export type InteractionTarget =
  | { readonly kind: 'employee'; readonly employeeId: EmployeeId }
  | { readonly kind: 'desk'; readonly deskId: DeskId; readonly employeeId: EmployeeId | null }
  | { readonly kind: 'room_entrance'; readonly roomId: RoomId; readonly doorId: string }
  | {
      readonly kind: 'object';
      readonly objectId: string;
      readonly objectKind: FurnitureInteraction;
      readonly roomId: RoomId;
    };

/**
 * Everything the game layer may tell the application. This map is the whole
 * Phaser → app contract. The game never mutates app state directly: the app
 * decides what each event means (selection, opening a panel, and from Phase 1.6
 * running commands).
 */
export interface GameEvents {
  'scene.ready': { sceneKey: string };
  'scene.error': { message: string };
  /** The founder stepped onto a different tile (not emitted every frame). */
  'player.moved': { tile: TileCoord; roomId: RoomId | null };
  /** The object the founder could interact with right now changed (null = nothing nearby). */
  'interaction.focus': { target: InteractionTarget | null; label: string | null };
  /** The pointer moved onto / off an interactive object. */
  'interaction.hover': { target: InteractionTarget | null; label: string | null };
  /** The founder interacted with an object (E / Enter / Space when near it, or a click). */
  'interaction.activate': {
    target: InteractionTarget;
    label: string;
    source: 'keyboard' | 'pointer';
  };
  /** The camera zoom changed (keys or buttons). */
  'camera.zoom': { zoom: number };
}

export type GameEventBus = EventBus<GameEvents>;

/** Stable string key for a target (for comparing and selecting). */
export function targetKey(target: InteractionTarget): string {
  switch (target.kind) {
    case 'employee':
      return `employee:${target.employeeId}`;
    case 'desk':
      return `desk:${target.deskId}`;
    case 'room_entrance':
      return `door:${target.doorId}`;
    case 'object':
      return `object:${target.objectId}`;
  }
}
