import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { loadBundle } from "./loadBundle.js";
import { traceRenderingResiduals } from "./renderingResiduals.js";

test("should report LOD material and streaming residual policies", async () => {
  const bundle = await loadBundle(resolve("../../packages/ir/fixtures/conformance/rendering-residuals/game.bundle"));
  const report = traceRenderingResiduals(bundle.assets, bundle.materials, bundle.world);

  assert.equal(report.schema, "threenative.rendering-residuals");
  assert.equal(report.geometry.lod[0]?.selectedMesh, "mesh.hero.low");
  assert.equal(report.materials.specular[0]?.texture, "texture.specular");
  assert.equal(report.assets.streaming.some((group) => group.group === "terrain.visible" && group.status === "warning"), true);
  assert.equal(report.boundaries.some((boundary) => boundary.code === "TN_RENDERER_CUSTOM_SHADER_UNSUPPORTED"), true);
});
