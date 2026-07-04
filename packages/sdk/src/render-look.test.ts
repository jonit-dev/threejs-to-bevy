import assert from "node:assert/strict";
import test from "node:test";

import { balancedRenderLook, parityRenderLook, renderLookProfile } from "./render-look.js";

test("should create safe render look profile declarations", () => {
  assert.deepEqual(parityRenderLook(), { version: 1, profile: "parity" });
  assert.deepEqual(balancedRenderLook({ exposure: 1.1, shadowQuality: "high" }), {
    version: 1,
    profile: "balanced",
    overrides: { exposure: 1.1, shadowQuality: "high" },
  });
  assert.deepEqual(renderLookProfile("stylized"), { version: 1, profile: "stylized" });
});
