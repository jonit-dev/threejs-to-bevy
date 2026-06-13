import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import * as THREE from "three";

import { loadBundle } from "./loadBundle.js";
import { mapWorld } from "./mapWorld.js";

test("should map cube fixture to three scene", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle"));
  const mapped = mapWorld(bundle);

  const objects = [...mapped.objectsById.values()];
  assert.equal(objects.some((object) => object instanceof THREE.Mesh), true);
  assert.equal(objects.some((object) => object instanceof THREE.PerspectiveCamera), true);
  assert.equal(objects.some((object) => object instanceof THREE.DirectionalLight), true);
  assert.equal(mapped.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0);
});
