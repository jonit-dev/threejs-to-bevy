import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { ContactShadows } from "./ContactShadows.js";

test("ContactShadows should preserve portable authored controls", () => {
  const shadows = new ContactShadows({
    height: 5,
    id: "arena.floor.shadows",
    opacity: 0.6,
    resolution: 512,
    size: [20, 20],
    softness: 1.5,
    updateMode: "static",
  });

  assert.deepEqual({
    height: shadows.height,
    opacity: shadows.opacity,
    resolution: shadows.resolution,
    size: shadows.size,
    softness: shadows.softness,
    updateMode: shadows.updateMode,
  }, { height: 5, opacity: 0.6, resolution: 512, size: [20, 20], softness: 1.5, updateMode: "static" });
});

test("ContactShadows should reject unsupported resolution", () => {
  assert.throws(
    () => new ContactShadows({ height: 5, opacity: 0.6, resolution: 300 as 256, size: [20, 20], softness: 1.5, updateMode: "static" }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_CONTACT_SHADOWS_RESOLUTION_INVALID",
  );
});
