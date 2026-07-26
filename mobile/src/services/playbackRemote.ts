type Handler = () => void;

const listeners: Record<string, Set<Handler>> = {
  next: new Set(),
  previous: new Set(),
  stop: new Set(),
};

export const playbackRemote = {
  on(event: 'next' | 'previous' | 'stop', handler: Handler) {
    listeners[event].add(handler);
    return () => {
      listeners[event].delete(handler);
    };
  },
  emit(event: 'next' | 'previous' | 'stop') {
    listeners[event].forEach((handler) => {
      try {
        handler();
      } catch {
        // ignore
      }
    });
  },
};
