import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as THREE from "three";
import { buildProject } from "@threenative/compiler";

import { loadBundle } from "./loadBundle.js";
import { mapWorld } from "./mapWorld.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

test("should load structured stylized example bundle", async () => {
  const projectPath = resolve(repoRoot, "examples/stylized-nature-component");
  const { bundlePath } = await buildProject(projectPath);
  const mapped = mapWorld(await loadBundle(bundlePath));
  const objects = [...mapped.objectsById.values()];

  assert.equal(mapped.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0);
  assert.equal(objects.some((object) => object instanceof THREE.Group), true);
  assert.equal(objects.some((object) => object instanceof THREE.PerspectiveCamera), true);
  assert.equal(objects.some((object) => object instanceof THREE.DirectionalLight), true);
});
