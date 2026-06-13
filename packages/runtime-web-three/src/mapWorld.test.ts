import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import * as THREE from "three";

import { loadBundle } from "./loadBundle.js";
import { mapWorld } from "./mapWorld.js";

test("mapWorld should map cube fixture to three scene", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle"));
  const mapped = mapWorld(bundle);

  const objects = [...mapped.objectsById.values()];
  assert.equal(objects.some((object) => object instanceof THREE.Mesh), true);
  assert.equal(objects.some((object) => object instanceof THREE.PerspectiveCamera), true);
  assert.equal(objects.some((object) => object instanceof THREE.DirectionalLight), true);
  assert.equal(mapped.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0);
});

test("mapWorld should map v2 render fixture", () => {
  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { id: "mesh.capsule", kind: "mesh", format: "generated", primitive: "capsule", size: [0.4, 1.2] },
        { id: "mesh.cylinder", kind: "mesh", format: "generated", primitive: "cylinder", size: [0.5, 1] },
      ],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "rendering",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.main", kind: "standard", color: "#ffffff" }],
    },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "camera.ui",
          components: { Camera: { kind: "orthographic", near: 0.1, far: 100, size: 4 } },
        },
        {
          id: "light.point",
          components: { Light: { kind: "point", color: "#ffffff", intensity: 2 } },
        },
        {
          id: "light.spot",
          components: { Light: { kind: "spot", color: "#ffffff", intensity: 3 } },
        },
        {
          id: "capsule.hidden",
          components: {
            MeshRenderer: { mesh: "mesh.capsule", material: "mat.main", visible: false },
            Transform: { position: [0, 0, 0] },
          },
        },
        {
          id: "cylinder.main",
          components: {
            MeshRenderer: { mesh: "mesh.cylinder", material: "mat.main" },
            Transform: { position: [1, 0, 0] },
          },
        },
      ],
      resources: { ActiveCamera: { entity: "camera.ui" } },
    },
  });

  assert.equal(mapped.camera instanceof THREE.OrthographicCamera, true);
  assert.equal(mapped.objectsById.get("light.point") instanceof THREE.PointLight, true);
  assert.equal(mapped.objectsById.get("light.spot") instanceof THREE.SpotLight, true);
  assert.equal(mapped.objectsById.get("capsule.hidden")?.visible, false);
  assert.equal(mapped.objectsById.get("cylinder.main") instanceof THREE.Mesh, true);
});
