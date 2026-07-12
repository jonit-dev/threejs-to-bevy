declare global {
  interface Window {
    threenativeOverlayBridge?: {
      send(type: string, payload: Record<string, unknown>): boolean;
      subscribe?(listener: (type: string, payload: Record<string, unknown>) => void): () => void;
    };
  }
}

export function sendOverlayMessage(type: string, payload: Record<string, unknown>): boolean {
  return window.threenativeOverlayBridge?.send(type, payload) ?? false;
}

export function subscribeToOverlayMessages(listener: (type: string, payload: Record<string, unknown>) => void): (() => void) | undefined {
  return window.threenativeOverlayBridge?.subscribe?.(listener);
}
