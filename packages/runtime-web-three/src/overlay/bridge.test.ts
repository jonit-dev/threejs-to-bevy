import assert from "node:assert/strict";
import test from "node:test";

import type { IOverlayIr } from "@threenative/ir";

import { createOverlayBridge } from "./bridge.js";

test("queues valid overlay messages", () => {
  const bridge = createOverlayBridge([makeOverlay()]);

  assert.equal(bridge.send({ overlayId: "inventory", payload: { itemId: "potion" }, type: "inventory:use-item" }), true);

  assert.equal(bridge.events.length, 1);
  assert.equal(bridge.events[0]?.type, "inventory:use-item");
});

test("rejects undeclared overlay messages", () => {
  const bridge = createOverlayBridge([makeOverlay()]);

  assert.equal(bridge.send({ overlayId: "inventory", payload: { itemId: "potion" }, type: "inventory:drop-item" }), false);

  assert.equal(bridge.events.length, 0);
  assert.equal(bridge.diagnostics[0]?.code, "TN_OVERLAY_MESSAGE_REJECTED");
});

test("publishes game-to-overlay snapshots through bounded queue", () => {
  const bridge = createOverlayBridge([makeOverlay()]);

  assert.equal(bridge.publish("inventory", "inventory:snapshot", { gold: 12 }), true);

  assert.equal(bridge.snapshots[0]?.type, "inventory:snapshot");
  assert.deepEqual(bridge.snapshots[0]?.payload, { gold: 12 });
});

test("rejects oversized game-to-overlay snapshots", () => {
  const overlay: IOverlayIr = makeOverlay();
  overlay.messages.gameToOverlay = [{ name: "inventory:snapshot", schema: { kind: "object", fields: { note: "string" }, required: ["note"] } }];
  const sizedBridge = createOverlayBridge([overlay]);

  assert.equal(sizedBridge.publish("inventory", "inventory:snapshot", { note: "x".repeat(17 * 1024) }), false);
  assert.equal(sizedBridge.diagnostics[0]?.code, "TN_OVERLAY_PAYLOAD_TOO_LARGE");
  assert.equal(sizedBridge.snapshots.length, 0);
});

function makeOverlay() {
  return {
    entry: "overlay/index.html",
    id: "inventory",
    input: "pointer" as const,
    messages: {
      gameToOverlay: [{ name: "inventory:snapshot", schema: { kind: "object" as const, fields: { gold: "integer" as const }, required: ["gold"] } }],
      overlayToGame: [{ name: "inventory:use-item", schema: { kind: "object" as const, fields: { itemId: "string" as const }, required: ["itemId"] } }],
    },
    targetProfiles: ["web" as const, "desktop" as const],
    transparent: true,
    zIndex: 10,
  };
}
