declare global {
  interface Window { threenativeOverlayBridge?: { send(type: string, payload: Record<string, unknown>): boolean } }
}

export function sendOverlayMessage(type: string, payload: Record<string, unknown>): boolean {
  return window.threenativeOverlayBridge?.send(type, payload) ?? false;
}
