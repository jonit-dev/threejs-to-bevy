import assert from "node:assert/strict";
import test from "node:test";

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

function makeOverlays(input: "keyboard" | "modal" | "none" | "pointer" | "pointer-and-keyboard") {
  return {
    schema: "threenative.overlays" as const,
    version: "0.1.0" as const,
    overlays: [
      {
        entry: "overlay/index.html",
        id: "inventory",
        input,
        messages: { overlayToGame: [] },
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
  readonly contentWindow: Record<string, unknown> = {};

  constructor(readonly tagName: string) {}

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
