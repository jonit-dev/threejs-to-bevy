import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateVisualArtifacts, V9_VISUAL_SCENES } from "./verify-v9-visual-matrix.mjs";

test("should require web bevy diff contact sheet and JSON report artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-visual-"));
  try {
    const artifactDir = join(root, "tools/verify/artifacts/visual-matrix");
    const scene = { artifactDir: join(artifactDir, "rendering-lights"), id: "rendering-lights", mode: "smoke-only" };
    const diagnostics = await validateVisualArtifacts(artifactDir, [scene]);
    assert.ok(diagnostics.length >= 4);
    assert.ok(diagnostics.every((diagnostic) => diagnostic.code === "TN_VERIFY_V9_ARTIFACT_MISSING"));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("webScreenshotPath")));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("bevyScreenshotPath")));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("contactSheetPath")));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes("diffPath")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should define the compact V9 visual matrix scenes", () => {
  const ids = new Set(V9_VISUAL_SCENES.map((scene) => scene.id));
  assert.ok(ids.has("skeletal-animation"));
  assert.ok(ids.has("animation-particles"));
  assert.ok(ids.has("physics-character"));
  assert.ok(ids.has("assets-gltf-workflow"));
  assert.ok(ids.has("rendering-lights"));
});
