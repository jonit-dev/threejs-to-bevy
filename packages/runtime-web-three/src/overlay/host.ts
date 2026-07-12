import type { IOverlayIr, IOverlaysIr, OverlayInputMode } from "@threenative/ir";

import { createOverlayBridge, type IOverlayBridge } from "./bridge.js";

export interface IWebOverlayHost {
  bridge: IOverlayBridge;
  dispose(): void;
  element: HTMLElement;
  frames: HTMLIFrameElement[];
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
    const contentWindow = frame.contentWindow as (Window & { threenativeOverlayBridge?: unknown }) | null;
    if (contentWindow !== null) {
      contentWindow.threenativeOverlayBridge = {
        send: (type: string, payload: Record<string, unknown>) => {
          const accepted = bridge.send({ overlayId: overlay.id, payload, type });
          if (accepted && payload.dismiss === true) frame.style.display = "none";
          return accepted;
        },
      };
    }
  });
  return frame;
}
