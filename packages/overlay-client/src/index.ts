export type OverlayMessageMap = Record<string, Record<string, unknown>>;
export type OverlayInputMode = "keyboard" | "modal" | "none" | "pointer" | "pointer-and-keyboard";

interface IBridgeMetadata { sequence?: number }
interface IRawOverlayBridge {
  send(type: string, payload: Record<string, unknown>): boolean;
  subscribe(listener: (type: string, payload: Record<string, unknown>, metadata?: IBridgeMetadata) => void): () => void;
}

export interface IOverlayClient<GameToOverlay extends OverlayMessageMap, OverlayToGame extends OverlayMessageMap> {
  send<Type extends keyof OverlayToGame & string>(type: Type, payload: OverlayToGame[Type]): boolean;
  setInput(mode: OverlayInputMode): boolean;
  setVisible(visible: boolean): boolean;
  subscribe<Type extends keyof GameToOverlay & string>(type: Type, handler: (payload: GameToOverlay[Type]) => void): () => void;
}

export function createOverlayClient<
  GameToOverlay extends OverlayMessageMap,
  OverlayToGame extends OverlayMessageMap,
>(windowRef: Window = window): IOverlayClient<GameToOverlay, OverlayToGame> {
  const handlers = new Map<string, Set<(payload: Record<string, unknown>) => void>>();
  const deliveredSequences = new Set<number>();
  let disconnect: (() => void) | undefined;
  const connect = (): void => {
    disconnect?.();
    const bridge = rawBridge(windowRef);
    if (bridge === undefined) return;
    disconnect = bridge.subscribe((type, payload, metadata) => {
      const listeners = handlers.get(type);
      if (listeners === undefined || listeners.size === 0) return;
      if (metadata?.sequence !== undefined) {
        if (deliveredSequences.has(metadata.sequence)) return;
        deliveredSequences.add(metadata.sequence);
      }
      for (const handler of listeners) handler(payload);
    });
  };
  windowRef.addEventListener("threenative:bridge-ready", connect);
  connect();
  const control = (type: string, payload: Record<string, unknown>): boolean => rawBridge(windowRef)?.send(type, payload) ?? false;
  return {
    send: (type, payload) => rawBridge(windowRef)?.send(type, payload) ?? false,
    setInput: (mode) => control("overlay:set-input", { mode }),
    setVisible: (visible) => control("overlay:set-visible", { visible }),
    subscribe(type, handler) {
      const listeners = handlers.get(type) ?? new Set();
      const listener = handler as (payload: Record<string, unknown>) => void;
      listeners.add(listener);
      handlers.set(type, listeners);
      connect();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) handlers.delete(type);
      };
    },
  };
}

function rawBridge(windowRef: Window): IRawOverlayBridge | undefined {
  return (windowRef as Window & { threenativeOverlayBridge?: IRawOverlayBridge }).threenativeOverlayBridge;
}
