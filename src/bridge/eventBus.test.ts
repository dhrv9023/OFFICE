import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './eventBus';

interface TestEvents {
  ping: { n: number };
  pong: { label: string };
}

describe('createEventBus', () => {
  it('delivers payloads to listeners of that event only', () => {
    const bus = createEventBus<TestEvents>();
    const onPing = vi.fn();
    const onPong = vi.fn();
    bus.on('ping', onPing);
    bus.on('pong', onPong);

    bus.emit('ping', { n: 1 });

    expect(onPing).toHaveBeenCalledExactlyOnceWith({ n: 1 });
    expect(onPong).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    const off = bus.on('ping', handler);

    off();
    bus.emit('ping', { n: 2 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('lets a handler unsubscribe itself during dispatch without skipping others', () => {
    const bus = createEventBus<TestEvents>();
    const second = vi.fn();
    const off = bus.on('ping', () => {
      off();
    });
    bus.on('ping', second);

    bus.emit('ping', { n: 3 });
    bus.emit('ping', { n: 4 });

    expect(second).toHaveBeenCalledTimes(2);
  });

  it('clear removes all listeners', () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('ping', handler);
    bus.on('pong', handler);

    bus.clear();
    bus.emit('ping', { n: 5 });
    bus.emit('pong', { label: 'x' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('emitting with no listeners is a no-op', () => {
    const bus = createEventBus<TestEvents>();
    expect(() => {
      bus.emit('ping', { n: 6 });
    }).not.toThrow();
  });
});
