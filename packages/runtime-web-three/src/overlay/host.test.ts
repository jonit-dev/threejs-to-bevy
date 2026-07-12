import assert from "node:assert/strict";
import test from "node:test";

import type { IOverlayIr } from "@threenative/ir";

import { createWebOverlayHost, overlayFrameStyle, overlayPointerEvents } from "./host.js";

test("mounts overlay above canvas", () => {
  const host = createWebOverlayHost(makeOverlays("pointer"), "/bundle", new FakeDocument() as unknown as Document);

  assert.equal((host.element as unknown as FakeElement).classNames.includes("tn-webview-overlays"), true);
  assert.equal(host.frames.length, 1);
  assert.equal(host.frames[0]?.getAttribute("src"), "/bundle/overlay/index.html");
  assert.equal(host.frames[0]?.getAttribute("allowtransparency"), "true");
  assert.equal(host.frames[0]?.getAttribute("sandbox"), "allow-scripts allow-forms allow-same-origin");
  assert.equal(host.frames[0]?.style.background, "transparent");
  assert.equal(host.frames[0]?.style.height, "min(207px, calc(100% - 48px))");
  assert.equal(host.frames[0]?.style.pointerEvents, "auto");
  assert.equal(host.frames[0]?.style.right, "24px");
  assert.equal(host.frames[0]?.style.top, "24px");
  assert.equal(host.frames[0]?.style.width, "min(242px, calc(100% - 48px))");
});

test("maps overlay input capture without stealing game clicks", () => {
  assert.equal(overlayPointerEvents("none"), "none");
  assert.equal(overlayPointerEvents("keyboard"), "none");
  assert.equal(overlayPointerEvents("pointer"), "auto");
  assert.equal(overlayPointerEvents("pointer-and-keyboard"), "auto");
  assert.equal(overlayPointerEvents("modal"), "auto");
});

test("keeps only modal web overlays full screen", () => {
  const pointerOverlay = makeOverlays("pointer").overlays[0];
  const modalOverlay = makeOverlays("modal").overlays[0];
  assert.ok(pointerOverlay);
  assert.ok(modalOverlay);
  const pointerStyle = overlayFrameStyle(pointerOverlay);
  const modalStyle = overlayFrameStyle(modalOverlay);

  assert.equal(pointerStyle.inset, undefined);
  assert.equal(pointerStyle.width, "min(242px, calc(100% - 48px))");
  assert.equal(modalStyle.inset, "0");
  assert.equal(modalStyle.width, "100%");
});

test("uses an authored overlay layout rectangle", () => {
  const overlay = makeOverlays("pointer").overlays[0]!;
  (overlay as IOverlayIr).layout = { height: 180, width: 320, x: 12, y: 16 };

  const style = overlayFrameStyle(overlay);
  assert.equal(style.height, "180px");
  assert.equal(style.left, "12px");
  assert.equal(style.top, "16px");
  assert.equal(style.width, "320px");
});

test("publishes game snapshots to a loaded overlay", () => {
  const host = createWebOverlayHost(makeOverlays("pointer"), "/bundle", new FakeDocument() as unknown as Document);
  const frame = host.frames[0] as unknown as FakeElement;
  frame.listeners.get("load")?.[0]?.();
  const windowBridge = frame.contentWindow.threenativeOverlayBridge as {
    snapshot(type?: string): { payload: Record<string, unknown> } | undefined;
    subscribe(listener: (type: string, payload: Record<string, unknown>) => void): () => void;
  };
  const received: Array<{ payload: Record<string, unknown>; type: string }> = [];
  windowBridge.subscribe((type, payload) => received.push({ payload, type }));

  assert.equal(host.publish("inventory", "inventory:snapshot", { gold: 12 }), true);
  assert.deepEqual(received, [{ payload: { gold: 12 }, type: "inventory:snapshot" }]);
  assert.deepEqual(windowBridge.snapshot("inventory:snapshot")?.payload, { gold: 12 });
});

test("mounts a representative built React entry and publishes bridge readiness", () => {
  const documentRef = new FakeDocument();
  const overlays = makeOverlays("pointer-and-keyboard");
  overlays.overlays[0]!.entry = "overlay/inventory/index.html";
  const host = createWebOverlayHost(overlays, "/game.bundle", documentRef as unknown as Document);
  const frame = host.frames[0] as unknown as FakeElement;

  frame.listeners.get("load")?.[0]?.();

  assert.equal(frame.getAttribute("src"), "/game.bundle/overlay/inventory/index.html");
  assert.equal(frame.style.pointerEvents, "auto");
  assert.equal(frame.contentWindow.dispatchedEvents.includes("threenative:bridge-ready"), true);
  const windowBridge = frame.contentWindow.threenativeOverlayBridge as {
    send(type: string, payload: Record<string, unknown>): boolean;
  };
  assert.equal(windowBridge.send("inventory:use-item", { itemId: "potion" }), true);
  assert.equal(windowBridge.send("inventory:use-item", { itemId: 3 }), false);
  assert.deepEqual(host.bridge.events.map(({ overlayId, payload, type }) => ({ overlayId, payload, type })), [
    { overlayId: "inventory", payload: { itemId: "potion" }, type: "inventory:use-item" },
  ]);
});

test("updates overlay input mode and visibility through host controls", () => {
  const host = createWebOverlayHost(makeOverlays("modal"), "/bundle", new FakeDocument() as unknown as Document);
  const frame = host.frames[0] as unknown as FakeElement;

  assert.equal(host.setInput("inventory", "none"), true);
  assert.equal(frame.style.pointerEvents, "none");
  assert.equal(frame.blurred, true);
  assert.equal(host.setVisible("inventory", false), true);
  assert.equal(frame.style.display, "none");
  assert.equal(host.setVisible("inventory", true), true);
  assert.equal(frame.style.display, "");
});

test("accepts overlay client input and visibility control messages", () => {
  const host = createWebOverlayHost(makeOverlays("modal"), "/bundle", new FakeDocument() as unknown as Document);
  const frame = host.frames[0] as unknown as FakeElement;
  frame.listeners.get("load")?.[0]?.();
  const bridge = frame.contentWindow.threenativeOverlayBridge as { send(type: string, payload: Record<string, unknown>): boolean };

  assert.equal(bridge.send("overlay:set-input", { mode: "pointer" }), true);
  assert.equal(frame.style.pointerEvents, "auto");
  assert.equal(frame.style.width, "min(242px, calc(100% - 48px))");
  assert.equal(frame.blurred, true);
  assert.equal(bridge.send("overlay:set-visible", { visible: false }), true);
  assert.equal(frame.style.display, "none");
  assert.equal(host.bridge.events.length, 0);
});

function makeOverlays(input: "keyboard" | "modal" | "none" | "pointer" | "pointer-and-keyboard") {
  return {
    schema: "threenative.overlays" as const,
    version: "0.1.0" as const,
    overlays: [
      {
        entry: "overlay/index.html",
        id: "inventory",
        input,
        messages: {
          gameToOverlay: [{ name: "inventory:snapshot", schema: { fields: { gold: "integer" as const }, kind: "object" as const, required: ["gold"] } }],
          overlayToGame: [{ name: "inventory:use-item", schema: { fields: { itemId: "string" as const }, kind: "object" as const, required: ["itemId"] } }],
        },
        targetProfiles: ["web" as const],
        transparent: true,
        zIndex: 30,
      },
    ],
  };
}

class FakeDocument {
  createElement(tagName: string): HTMLElement {
    return new FakeElement(tagName) as unknown as HTMLElement;
  }
}

class FakeElement {
  blurred = false;
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly classList = {
    add: (...tokens: string[]) => {
      this.classNames.push(...tokens);
    },
  };
  readonly classNames: string[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Array<() => void>>();
  readonly style: Record<string, string> = {};
  readonly contentWindow: Record<string, any> & { dispatchedEvents: string[] } = {
    dispatchedEvents: [],
    dispatchEvent: (event: { type?: string }) => {
      if (event.type !== undefined) this.contentWindow.dispatchedEvents.push(event.type);
      return true;
    },
    document: {
      createEvent: () => ({
        type: undefined as string | undefined,
        initEvent(type: string) { this.type = type; },
      }),
    },
  };

  constructor(readonly tagName: string) {}

  blur(): void { this.blurred = true; }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}
