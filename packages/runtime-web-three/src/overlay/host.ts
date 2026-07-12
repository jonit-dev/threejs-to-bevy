import type { IOverlayIr, IOverlaysIr, OverlayInputMode } from "@threenative/ir";

import { createOverlayBridge, type IOverlayBridge } from "./bridge.js";

export interface IWebOverlayHost {
  bridge: IOverlayBridge;
  dispose(): void;
  element: HTMLElement;
  frames: HTMLIFrameElement[];
  publish(overlayId: string, type: string, payload: Record<string, unknown>): boolean;
  setInput(overlayId: string, input: OverlayInputMode): boolean;
  setVisible(overlayId: string, visible: boolean): boolean;
}

type OverlaySnapshotListener = (type: string, payload: Record<string, unknown>, metadata: { sequence: number }) => void;

interface IOverlayWindowBridge {
  send(type: string, payload: Record<string, unknown>): boolean;
  snapshot(type?: string): { payload: Record<string, unknown>; sequence: number; type: string } | undefined;
  subscribe(listener: OverlaySnapshotListener): () => void;
}

export function createWebOverlayHost(overlays: IOverlaysIr, source: string, documentRef: Document = document): IWebOverlayHost {
  const bridge = createOverlayBridge(overlays.overlays);
  const root = documentRef.createElement("div");
  root.classList.add("tn-webview-overlays");
  Object.assign(root.style, {
    inset: "0",
    pointerEvents: "none",
    position: "absolute",
    zIndex: "100",
  });
  const frames = overlays.overlays
    .filter((overlay) => overlay.targetProfiles.includes("web"))
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((overlay) => mountOverlayFrame(overlay, bridge, source, documentRef));
  root.append(...frames);
  const publish = (overlayId: string, type: string, payload: Record<string, unknown>): boolean => {
    if (!bridge.publish(overlayId, type, payload)) return false;
    const frame = frames.find((candidate) => candidate.dataset.threenativeOverlayId === overlayId);
    const windowBridge = (frame?.contentWindow as (Window & { threenativeOverlayBridge?: IOverlayWindowBridge }) | null)?.threenativeOverlayBridge;
    const snapshot = bridge.snapshots.at(-1);
    if (snapshot !== undefined) dispatchSnapshot(windowBridge, snapshot);
    return true;
  };
  return {
    bridge,
    dispose() {
      for (const frame of frames) {
        frame.removeAttribute("src");
      }
      root.remove();
    },
    element: root,
    frames,
    publish,
    setInput(overlayId, input) {
      const frame = frames.find((candidate) => candidate.dataset.threenativeOverlayId === overlayId);
      if (frame === undefined) return false;
      const overlay = overlays.overlays.find((candidate) => candidate.id === overlayId);
      if (overlay === undefined) return false;
      applyOverlayInputMode(frame, overlay, input);
      if (input === "none" || input === "pointer") frame.blur();
      return true;
    },
    setVisible(overlayId, visible) {
      const frame = frames.find((candidate) => candidate.dataset.threenativeOverlayId === overlayId);
      if (frame === undefined) return false;
      frame.style.display = visible ? "" : "none";
      return true;
    },
  };
}

export function overlayPointerEvents(input: OverlayInputMode): "auto" | "none" {
  return input === "pointer" || input === "pointer-and-keyboard" || input === "modal" ? "auto" : "none";
}

export function overlayFrameStyle(overlay: IOverlayIr): Partial<CSSStyleDeclaration> {
  const base: Partial<CSSStyleDeclaration> = {
    background: overlay.transparent ? "transparent" : "#000",
    border: "0",
    pointerEvents: overlayPointerEvents(overlay.input),
    position: "absolute",
    zIndex: String(overlay.zIndex),
  };
  if (overlay.input === "modal") {
    return {
      ...base,
      height: "100%",
      inset: "0",
      width: "100%",
    };
  }
  if (overlay.layout !== undefined) {
    return { ...base, height: `${overlay.layout.height}px`, left: `${overlay.layout.x}px`, top: `${overlay.layout.y}px`, width: `${overlay.layout.width}px` };
  }
  return {
    ...base,
    height: "min(207px, calc(100% - 48px))",
    right: "24px",
    top: "24px",
    width: "min(242px, calc(100% - 48px))",
  };
}

function mountOverlayFrame(overlay: IOverlayIr, bridge: IOverlayBridge, source: string, documentRef: Document): HTMLIFrameElement {
  const frame = documentRef.createElement("iframe");
  frame.dataset.threenativeOverlayId = overlay.id;
  frame.setAttribute("allowtransparency", overlay.transparent ? "true" : "false");
  frame.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin");
  frame.setAttribute("src", `${source.replace(/\/$/, "")}/${overlay.entry}`);
  Object.assign(frame.style, overlayFrameStyle(overlay));
  frame.addEventListener("load", () => {
    const contentWindow = frame.contentWindow as (Window & { threenativeOverlayBridge?: IOverlayWindowBridge }) | null;
    if (contentWindow !== null) {
      const listeners = new Set<OverlaySnapshotListener>();
      contentWindow.threenativeOverlayBridge = {
        send: (type: string, payload: Record<string, unknown>) => {
          if (type === "overlay:set-input" && typeof payload.mode === "string" && INPUT_MODES.has(payload.mode as OverlayInputMode)) {
            applyOverlayInputMode(frame, overlay, payload.mode as OverlayInputMode);
            if (payload.mode === "none" || payload.mode === "pointer") frame.blur();
            return true;
          }
          if (type === "overlay:set-visible" && typeof payload.visible === "boolean") {
            frame.style.display = payload.visible ? "" : "none";
            return true;
          }
          const accepted = bridge.send({ overlayId: overlay.id, payload, type });
          if (accepted && payload.dismiss === true) {
            bridge.diagnostics.push({ code: "TN_OVERLAY_DISMISS_DEPRECATED", message: "Overlay payload field 'dismiss' is deprecated; call setVisible(false).", overlayId: overlay.id, type });
            frame.style.display = "none";
          }
          return accepted;
        },
        snapshot(type) {
          return bridge.snapshots.filter((entry) => entry.overlayId === overlay.id && (type === undefined || entry.type === type)).at(-1);
        },
        subscribe(listener) {
          listeners.add(listener);
          for (const snapshot of bridge.snapshots.filter((entry) => entry.overlayId === overlay.id)) listener(snapshot.type, snapshot.payload, { sequence: snapshot.sequence });
          return () => listeners.delete(listener);
        },
      };
      snapshotListeners.set(contentWindow.threenativeOverlayBridge, listeners);
      const readyEvent = contentWindow.document.createEvent("Event");
      readyEvent.initEvent("threenative:bridge-ready", false, false);
      contentWindow.dispatchEvent(readyEvent);
    }
  });
  return frame;
}

const snapshotListeners = new WeakMap<IOverlayWindowBridge, Set<OverlaySnapshotListener>>();
const INPUT_MODES = new Set<OverlayInputMode>(["keyboard", "modal", "none", "pointer", "pointer-and-keyboard"]);

function applyOverlayInputMode(frame: HTMLIFrameElement, overlay: IOverlayIr, input: OverlayInputMode): void {
  for (const property of ["bottom", "height", "inset", "left", "right", "top", "width"] as const) frame.style[property] = "";
  Object.assign(frame.style, overlayFrameStyle({ ...overlay, input }));
}

function dispatchSnapshot(windowBridge: IOverlayWindowBridge | undefined, snapshot: { payload: Record<string, unknown>; sequence: number; type: string }): void {
  if (windowBridge === undefined) return;
  for (const listener of snapshotListeners.get(windowBridge) ?? []) listener(snapshot.type, snapshot.payload, { sequence: snapshot.sequence });
}
