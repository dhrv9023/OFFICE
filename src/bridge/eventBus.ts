/**
 * Minimal typed publish/subscribe bus.
 *
 * `Events` maps each event name to its payload type, so both emitters and listeners
 * are checked at compile time. Used for Phaser → application intents; it deliberately
 * knows nothing about React, Phaser or the stores.
 */
export type EventHandler<Payload> = (payload: Payload) => void;

export interface EventBus<Events extends object> {
  /** Subscribe. Returns an unsubscribe function. */
  on<Name extends keyof Events>(name: Name, handler: EventHandler<Events[Name]>): () => void;
  emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void;
  /** Remove every listener (called when the game is destroyed). */
  clear(): void;
}

export function createEventBus<Events extends object>(): EventBus<Events> {
  const handlers = new Map<keyof Events, Set<EventHandler<never>>>();

  return {
    on(name, handler) {
      let set = handlers.get(name);
      if (!set) {
        set = new Set();
        handlers.set(name, set);
      }
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },

    emit(name, payload) {
      const set = handlers.get(name);
      if (!set) return;
      // Copy so a handler may unsubscribe (or subscribe) during dispatch.
      for (const handler of [...set]) {
        (handler as EventHandler<typeof payload>)(payload);
      }
    },

    clear() {
      handlers.clear();
    },
  };
}
