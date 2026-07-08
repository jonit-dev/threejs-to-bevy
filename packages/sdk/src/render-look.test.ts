import assert from "node:assert/strict";
import test from "node:test";

import { balancedRenderLook, cinematicRenderLook, parityRenderLook, renderLookProfile, stylizedRenderLook } from "./render-look.js";

test("should create safe render look profile declarations", () => {
  assert.deepEqual(parityRenderLook(), { version: 1, profile: "parity" });
  assert.deepEqual(balancedRenderLook({ exposure: 1.1, shadowQuality: "high" }), {
    version: 1,
    profile: "balanced",
    overrides: { exposure: 1.1, shadowQuality: "high" },
  });
  assert.deepEqual(cinematicRenderLook(), { version: 1, profile: "cinematic" });
  assert.deepEqual(stylizedRenderLook({ saturation: 1.4 }), { version: 1, profile: "stylized", overrides: { saturation: 1.4 } });
  assert.deepEqual(renderLookProfile("stylized"), { version: 1, profile: "stylized" });
});
