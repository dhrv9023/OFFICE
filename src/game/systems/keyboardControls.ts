import type { DirectionInput } from '../world/movement';

export interface KeyboardHandlers {
  /** E, Enter or Space. */
  onInteract(): void;
  /** + / − keys. */
  onZoom(delta: -1 | 1): void;
}

export interface KeyboardControls {
  /** Live state of the movement keys (read every frame; never reallocated). */
  readonly input: DirectionInput;
  /** Releases every key (e.g. when the office loses focus). */
  reset(): void;
  dispose(): void;
}

const MOVES: Readonly<Record<string, keyof DirectionInput>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};
const INTERACT = new Set(['KeyE', 'Enter', 'Space', 'NumpadEnter']);
const ZOOM_IN = new Set(['Equal', 'NumpadAdd']);
const ZOOM_OUT = new Set(['Minus', 'NumpadSubtract']);

/**
 * Keyboard controls bound to ONE element (the focusable office area), not to the
 * window: keys only move the founder while that element itself has focus, so
 * typing in a form — or pressing Space on a button inside the office — never
 * moves anyone. Keys are released when
 * focus leaves the office or the tab is hidden. Browser shortcuts (Ctrl/⌘/Alt)
 * are left alone. Key positions (`code`) are used, so WASD works on any layout.
 */
export function attachKeyboardControls(
  element: HTMLElement,
  handlers: KeyboardHandlers,
): KeyboardControls {
  const input: DirectionInput = { up: false, down: false, left: false, right: false };
  const reset = () => {
    input.up = false;
    input.down = false;
    input.left = false;
    input.right = false;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Only when the office itself has focus: buttons inside it keep their own keys.
    if (event.target !== element) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const move = MOVES[event.code];
    if (move) {
      input[move] = true;
      event.preventDefault();
      return;
    }
    if (INTERACT.has(event.code)) {
      event.preventDefault();
      if (!event.repeat) handlers.onInteract();
      return;
    }
    if (ZOOM_IN.has(event.code) || ZOOM_OUT.has(event.code)) {
      event.preventDefault();
      if (!event.repeat) handlers.onZoom(ZOOM_IN.has(event.code) ? 1 : -1);
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    const move = MOVES[event.code];
    if (move) input[move] = false;
  };
  const onFocusOut = (event: FocusEvent) => {
    if (!element.contains(event.relatedTarget as Node | null)) reset();
  };
  const onVisibility = () => {
    if (document.hidden) reset();
  };

  element.addEventListener('keydown', onKeyDown);
  element.addEventListener('keyup', onKeyUp);
  element.addEventListener('focusout', onFocusOut);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    input,
    reset,
    dispose() {
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('keyup', onKeyUp);
      element.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', onVisibility);
      reset();
    },
  };
}
