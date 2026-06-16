import assert from "node:assert/strict";
import test from "node:test";
import type { IAssetsManifest, IMaterialsIr, IWorldIr } from "@threenative/ir";

import { deriveRequiredCapabilities } from "./capabilities.js";

test("should derive sorted rendering and physics capabilities from world, materials, and assets", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: assetsManifest([
      { format: "generated", id: "mesh.cube", kind: "mesh", primitive: "box" },
      { format: "png", id: "tex.color", kind: "texture", path: "assets/color.png", repeat: [2, 2] },
    ]),
    materials: materialsIr([
      {
        alphaMode: "blend",
        baseColorTexture: "tex.color",
        color: "#ffffff",
        id: "mat.cube",
        kind: "standard",
        opacity: 0.75,
      },
    ]),
    world: worldIr({
      entities: [
        {
          components: {
            Collider: { kind: "box", layer: "world", size: [1, 1, 1] },
            MeshRenderer: { material: "mat.cube", mesh: "mesh.cube", visible: true },
            Transform: { position: [0, 0, 0] },
            Visibility: { visible: true },
          },
          id: "cube",
        },
      ],
      resources: { ActiveCamera: { entity: "camera.main" } },
    }),
  });

  assert.deepEqual(capabilities.asset, ["mesh.generated", "texture.png"]);
  assert.deepEqual(capabilities.physics, ["collider.box", "contact-filtering"]);
  assert.deepEqual(capabilities.rendering, [
    "camera.active",
    "material.alpha.blend",
    "material.opacity",
    "material.standard",
    "material.texture.base-color",
    "mesh-renderer",
    "mesh.primitive.box",
    "texture.sampler",
    "texture.uv-transform",
    "visibility",
  ]);
});

test("should derive ECS and runtime capabilities from schemas and runtime config", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: assetsManifest([]),
    componentSchemas: { schema: "threenative.component-schemas", schemas: { Health: { fields: {} } }, version: "0.1.0" },
    eventSchemas: { schema: "threenative.event-schemas", schemas: { DamageEvent: { fields: {} } }, version: "0.1.0" },
    materials: materialsIr([]),
    resourceSchemas: { schema: "threenative.resource-schemas", schemas: { GameState: { fields: {} } }, version: "0.1.0" },
    runtimeConfig: {
      renderer: { antialias: "msaa4" },
      schema: "threenative.runtime-config",
      time: { fixedDelta: 1 / 60, paused: false },
      version: "0.1.0",
      window: { height: 720, width: 1280 },
    },
    systems: {
      schema: "threenative.systems",
      systems: [
        {
          commands: [],
          eventReads: [],
          eventWrites: [],
          name: "tick",
          queries: [],
          reads: [],
          resourceReads: [],
          resourceWrites: [],
          schedule: "update",
          services: [],
          writes: [],
        },
      ],
      version: "0.1.0",
    },
  });

  assert.deepEqual(capabilities.ecs, ["component-reflection", "component-schemas", "event-schemas", "resource-schemas"]);
  assert.deepEqual(capabilities.runtime, ["config", "fixed-timestep"]);
  assert.deepEqual(capabilities.scripting, ["component-reflection", "schedule.update", "systems"]);
});

function assetsManifest(assets: IAssetsManifest["assets"]): IAssetsManifest {
  return { assets, schema: "threenative.assets", version: "0.1.0" };
}

function materialsIr(materials: IMaterialsIr["materials"]): IMaterialsIr {
  return { materials, schema: "threenative.materials", version: "0.1.0" };
}

function worldIr(world: Pick<IWorldIr, "entities" | "resources">): IWorldIr {
  return {
    entities: world.entities,
    resources: world.resources,
    schema: "threenative.world",
    version: "0.1.0",
  };
}
