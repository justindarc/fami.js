export type EventListener = (...args: any[]) => void;

export class EventEmitter {
  private listeners: Record<string, EventListener[]> = {};

  on(event: string, listener: EventListener) {
    const listeners = this.listeners[event] ?? [];
    listeners.push(listener);
    this.listeners[event] = listeners;
  }

  off(event: string, listener?: EventListener) {
    const listeners = this.listeners[event] ?? [];
    listeners.forEach((aListener, index) => {
      if (!listener || listener === aListener) {
        listeners.splice(index, 1);
      }
    });
    this.listeners[event] = listeners;
  }

  emit(event: string, ...args: any[]) {
    const listeners = this.listeners[event] ?? [];
    listeners.forEach((listener) => {
      listener.apply(this, args);
    });
  }
}
