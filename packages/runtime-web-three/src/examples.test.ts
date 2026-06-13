import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import * as THREE from "three";
import { buildProject } from "@threenative/compiler";

import { loadBundle } from "./loadBundle.js";
import { mapWorld } from "./mapWorld.js";

test("should load canonical example bundle", async () => {
  const projectPath = resolve(process.cwd(), "../../examples/v1-canonical");
  const { bundlePath } = await buildProject(projectPath);
  const mapped = mapWorld(await loadBundle(bundlePath));
  const objects = [...mapped.objectsById.values()];

  assert.equal(mapped.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0);
  assert.equal(objects.filter((object) => object instanceof THREE.Mesh).length, 3);
  assert.equal(objects.some((object) => object instanceof THREE.PerspectiveCamera), true);
  assert.equal(objects.some((object) => object instanceof THREE.DirectionalLight), true);
});
