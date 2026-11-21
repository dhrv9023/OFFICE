// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachKeyboardControls, type KeyboardControls } from './keyboardControls';

let office: HTMLDivElement;
let other: HTMLInputElement;
let controls: KeyboardControls;
const onInteract = vi.fn();
const onZoom = vi.fn();

beforeEach(() => {
  office = document.createElement('div');
  office.tabIndex = 0;
  const button = document.createElement('button');
  button.textContent = 'Zoom in';
  office.append(button);
  other = document.createElement('input');
  document.body.append(office, other);
  onInteract.mockClear();
  onZoom.mockClear();
  controls = attachKeyboardControls(office, { onInteract, onZoom });
});
afterEach(() => {
  controls.dispose();
  document.body.innerHTML = '';
});

const press = (
  target: Element,
  code: string,
  type: 'keydown' | 'keyup' = 'keydown',
  extra = {},
) => {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(event);
  return event;
};

describe('keyboard controls', () => {
  it('maps arrows and WASD to directions while the office has focus', () => {
    office.focus();
    press(office, 'KeyW');
    press(office, 'ArrowRight');
    expect(controls.input).toEqual({ up: true, down: false, left: false, right: true });
    press(office, 'KeyW', 'keyup');
    expect(controls.input.up).toBe(false);
  });

  it('prevents the page from scrolling with arrow keys and Space', () => {
    expect(press(office, 'ArrowDown').defaultPrevented).toBe(true);
    expect(press(office, 'Space').defaultPrevented).toBe(true);
  });

  it('interacts with E, Enter or Space once per press, and zooms with + and −', () => {
    press(office, 'KeyE');
    press(office, 'Enter');
    press(office, 'KeyE', 'keydown', { repeat: true });
    expect(onInteract).toHaveBeenCalledTimes(2);
    press(office, 'Equal');
    press(office, 'Minus');
    expect(onZoom.mock.calls).toEqual([[1], [-1]]);
  });

  it('ignores keys typed anywhere else, including buttons inside the office', () => {
    other.focus();
    press(other, 'KeyW');
    press(office.querySelector('button') as HTMLElement, 'Space');
    expect(controls.input.up).toBe(false);
    expect(onInteract).not.toHaveBeenCalled();
  });

  it('leaves browser shortcuts alone', () => {
    const event = press(office, 'KeyW', 'keydown', { ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(controls.input.up).toBe(false);
  });

  it('releases every key when the office loses focus or the window blurs', () => {
    office.focus();
    press(office, 'KeyA');
    other.focus();
    expect(controls.input.left).toBe(false);
    press(office, 'KeyD');
    window.dispatchEvent(new Event('blur'));
    expect(controls.input.right).toBe(false);
  });

  it('stops listening once disposed', () => {
    controls.dispose();
    press(office, 'KeyW');
    expect(controls.input.up).toBe(false);
  });
});
