import assert from "node:assert/strict";
import test from "node:test";

import type { IOverlaysIr, ISystemsIr } from "@threenative/ir";

import { validateOverlaySystemEventDrift } from "./emit.js";

test("overlay event contract drift rejects script writes declared by no overlay message", () => {
  const overlays = {
    schema: "threenative.overlays", version: "0.2.0", overlays: [{
      entry: "overlay/index.html", id: "hud", input: "none", targetProfiles: ["web"], transparent: true, zIndex: 1,
      messages: { gameToOverlay: [{ name: "hud:snapshot", schema: { kind: "object" } }], overlayToGame: [] },
    }],
  } as IOverlaysIr;
  const systems = { systems: [{ name: "game", eventReads: [], eventWrites: ["hud:typo"] }] } as unknown as ISystemsIr;

  assert.throws(() => validateOverlaySystemEventDrift(overlays, systems), /TN_OVERLAY_EVENT_DRIFT.*hud:typo/);
});

test("overlay event contract drift accepts canonical overlay event reads and writes", () => {
  const overlays = {
    schema: "threenative.overlays", version: "0.2.0", overlays: [{
      entry: "overlay/index.html", id: "hud", input: "none", targetProfiles: ["web"], transparent: true, zIndex: 1,
      messages: {
        gameToOverlay: [{ name: "hud:snapshot", schema: { kind: "object" } }],
        overlayToGame: [{ name: "hud:action", schema: { kind: "object" } }],
      },
    }],
  } as IOverlaysIr;
  const systems = { systems: [{ name: "game", eventReads: ["hud:action"], eventWrites: ["hud:snapshot"] }] } as unknown as ISystemsIr;

  assert.doesNotThrow(() => validateOverlaySystemEventDrift(overlays, systems));
});
