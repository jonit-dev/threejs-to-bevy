import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { reportWebConformance } from "./conformance.js";
import { loadBundle } from "./loadBundle.js";
import { mapWorld } from "./mapWorld.js";

test("should report basic scene conformance semantics", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/basic-scene/game.bundle"));
  const mapped = mapWorld(bundle);
  const report = reportWebConformance(bundle, mapped, "basic-scene");

  assert.equal(report.fixture, "basic-scene");
  assert.equal(report.runtime, "web-three");
  assert.deepEqual(report.diagnostics, []);

  const cube = report.entities.find((entity) => entity.id === "cube.child");
  assert.ok(cube);
  assert.deepEqual(cube.components, ["Hierarchy", "MeshRenderer", "Transform"]);
  assert.equal(cube.parent, "scene.root");
  assert.equal(cube.mesh, "mesh.cube");
  assert.equal(cube.material, "mat.cube");

  assert.ok(report.entities.find((entity) => entity.id === "camera.main")?.components.includes("Camera"));
  assert.equal(report.entities.find((entity) => entity.id === "light.key")?.light?.kind, "directional");
});
