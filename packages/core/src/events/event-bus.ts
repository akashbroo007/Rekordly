/**
 * Tiny typed publish/subscribe bus used across core services
 * (notifications, plugin events, runtime state).
 */
export class EventBus<TEvents extends object> {
  private readonly listeners = new Map<keyof TEvents, Set<(payload: unknown) => void>>();

  on<K extends keyof TEvents>(type: K, listener: (payload: TEvents[K]) => void): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener as (payload: unknown) => void);
    this.listeners.set(type, set);
    return () => {
      set.delete(listener as (payload: unknown) => void);
    };
  }

  emit<K extends keyof TEvents>(type: K, payload: TEvents[K]): void {
    const set = this.listeners.get(type);
    if (set === undefined) {
      return;
    }
    for (const listener of set) {
      try {
        listener(payload);
      } catch {
        // A failing listener must not break the bus; errors are the caller's.
      }
    }
  }

  removeAll(): void {
    this.listeners.clear();
  }
}
