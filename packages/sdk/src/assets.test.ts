import assert from "node:assert/strict";
import test from "node:test";

import { animationClip, modelAsset } from "./assets.js";
import { SdkError } from "./errors.js";

test("assets should create deterministic model animation metadata", () => {
  const asset = modelAsset("model.hero", "assets/hero.glb", {
    animations: [
      animationClip("run", { loop: true, sourceClip: "Armature|Run", speed: 1.2 }),
      animationClip("idle", { loop: true }),
    ],
  });

  assert.deepEqual(asset, {
    animations: [
      { id: "idle", loop: true },
      { id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.2 },
    ],
    format: "glb",
    id: "model.hero",
    kind: "model",
    path: "assets/hero.glb",
  });
});

test("assets should reject unsupported advanced animation metadata", () => {
  assert.throws(
    () => animationClip("run", { speed: 0 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ANIMATION_SPEED_INVALID",
  );
  assert.throws(
    () => modelAsset("model.hero", "assets/hero.glb", { animations: [animationClip("run"), animationClip("run")] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ANIMATION_CLIP_DUPLICATE",
  );
  assert.throws(
    () => modelAsset("model.hero", "assets/hero.glb", { unsupported: { stateMachine: true } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ANIMATION_STATE_MACHINE_UNSUPPORTED",
  );
});
