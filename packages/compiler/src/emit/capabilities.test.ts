import assert from "node:assert/strict";
import test from "node:test";
import type { IAssetsManifest, IMaterialsIr, IUiIr, IWorldIr } from "@threenative/ir";

import { deriveRequiredCapabilities } from "./capabilities.js";

test("should derive transparent material capabilities", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: assetsManifest([]),
    materials: materialsIr([
      {
        id: "mat.glass",
        kind: "standard",
        color: "#ffffff",
        alphaMode: "blend",
        blendMode: "additive",
        renderOrder: 2,
        depthWrite: false,
      },
    ]),
    world: worldIr({ entities: [] }),
  });

  assert.deepEqual(capabilities.rendering, [
    "material.alpha.blend",
    "material.blend.additive",
    "material.depth-policy",
    "material.render-order",
    "material.standard",
  ]);
});

test("should derive shader material capabilities", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: assetsManifest([]),
    materials: materialsIr([
      {
        id: "mat.shader",
        kind: "shader",
        program: {
          fragment: { outputs: { baseColor: { kind: "uniform", uniform: "tint" } } },
          language: "threenative-shader-v1",
          vertex: { displacement: { amount: { kind: "uniform", uniform: "waveAmount" }, axis: "normal" } },
        },
        textures: [{ name: "ramp", asset: "tex.ramp" }],
        uniforms: [
          { name: "tint", type: "color", default: "#33ccff" },
          { name: "waveAmount", type: "float", default: 0.1 },
        ],
      },
    ]),
    world: worldIr({ entities: [] }),
  });

  assert.deepEqual(capabilities.rendering, [
    "material.shader",
    "material.shader.v1",
    "shader.texture2d",
    "shader.uniform.color",
    "shader.uniform.float",
    "shader.vertex-displacement",
  ]);
});

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

test("should derive primitive solver v2 capability from bounded primitive body metadata", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: assetsManifest([]),
    materials: materialsIr([]),
    world: worldIr({
      entities: [
        {
          components: {
            Collider: { friction: 0.6, kind: "box", restitution: 0.2, size: [1, 1, 1] },
            RigidBody: { angularVelocity: [0, 0, 0], kind: "dynamic", mass: 1, sleepThreshold: 0.01, solverIterations: 8, velocity: [0, 0, 0] },
            Transform: { position: [0, 0, 0] },
          },
          id: "crate",
        },
        {
          components: {
            Collider: { kind: "mesh" },
            RigidBody: { kind: "static" },
            Transform: { position: [0, 0, 0] },
          },
          id: "terrain",
        },
      ],
    }),
  });

  assert.deepEqual(capabilities.physics, ["collider.box", "collider.mesh", "primitive-solver-v2", "rigid-body.dynamic", "rigid-body.static"]);
});

test("should not derive primitive solver v2 capability for mesh bodies", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: assetsManifest([]),
    materials: materialsIr([]),
    world: worldIr({
      entities: [
        {
          components: {
            Collider: { kind: "mesh" },
            RigidBody: { kind: "static", mass: 1 },
            Transform: { position: [0, 0, 0] },
          },
          id: "terrain",
        },
      ],
    }),
  });

  assert.deepEqual(capabilities.physics, ["collider.mesh", "rigid-body.static"]);
});

test("should derive ECS and runtime capabilities from schemas and runtime config", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: assetsManifest([]),
    componentSchemas: { schema: "threenative.component-schemas", schemas: { Health: { fields: {} } }, version: "0.1.0" },
    eventSchemas: { schema: "threenative.event-schemas", schemas: { DamageEvent: { fields: {} } }, version: "0.1.0" },
    materials: materialsIr([]),
    resourceSchemas: { schema: "threenative.resource-schemas", schemas: { GameState: { fields: {} } }, version: "0.1.0" },
    runtimeConfig: {
      renderer: {
        antialias: "taa",
        bloom: { enabled: true, intensity: 0.35, threshold: 0.8 },
        colorGrading: { toneMapping: "aces" },
        depthOfField: { aperture: 0.03, enabled: true, focusDistance: 12, maxBlur: 0.02 },
        renderLook: { version: 1, profile: "balanced" },
      },
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
  assert.ok(capabilities.rendering?.includes("antialias.taa"));
  assert.ok(capabilities.rendering?.includes("color-grading"));
  assert.ok(capabilities.rendering?.includes("color-management.srgb"));
  assert.ok(capabilities.rendering?.includes("depth-of-field"));
  assert.ok(capabilities.rendering?.includes("look-profile.v1"));
  assert.ok(capabilities.rendering?.includes("postprocess.bloom"));
  assert.ok(capabilities.rendering?.includes("profile.balanced"));
  assert.ok(capabilities.rendering?.includes("shadow.directional"));
  assert.ok(capabilities.rendering?.includes("tone-mapping"));
  assert.deepEqual(capabilities.runtime, ["config", "fixed-timestep"]);
  assert.deepEqual(capabilities.scripting, ["component-reflection", "schedule.update", "systems"]);
});

test("should not derive backend render path selections from runtime config", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: assetsManifest([]),
    materials: materialsIr([]),
    runtimeConfig: {
      renderer: {
        antialias: "msaa4",
        depthOfField: { aperture: 0.03, enabled: true, focusDistance: 12, maxBlur: 0.02 },
        renderPath: "forward",
      },
      schema: "threenative.runtime-config",
      time: { fixedDelta: 1 / 60, paused: false },
      version: "0.1.0",
      window: { height: 720, width: 1280 },
    },
  });

  assert.ok(capabilities.rendering?.includes("render-path.forward"));
  assert.ok(capabilities.rendering?.includes("depth-of-field"));
  assert.equal(capabilities.rendering?.some((capability) => /bevy|deferred|prepass|render-graph/i.test(capability)), false);
});

test("should derive multi-view camera capabilities", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: assetsManifest([
      { format: "rgba8", height: 256, id: "rt.monitor", kind: "render-target", usage: "color", width: 256 },
    ]),
    materials: materialsIr([
      { baseColorTexture: "rt.monitor", color: "#ffffff", id: "mat.monitor", kind: "standard" },
    ]),
    world: worldIr({
      entities: [
        {
          components: {
            Camera: {
              far: 100,
              follow: { target: "player" },
              fovY: 60,
              kind: "perspective",
              layers: ["main"],
              near: 0.1,
              order: 0,
              target: { asset: "rt.monitor", kind: "texture" },
              viewport: [0, 0, 0.5, 1],
            },
            RenderLayers: { layers: ["main"] },
            Transform: { position: [0, 1, 3] },
          },
          id: "camera.left",
        },
        {
          components: {
            Camera: {
              far: 100,
              fovY: 60,
              kind: "perspective",
              near: 0.1,
              order: 1,
              viewport: [0.5, 0, 0.5, 1],
            },
            Transform: { position: [0, 1, 3] },
          },
          id: "camera.right",
        },
      ],
      resources: {
        ActiveCameras: {
          cameras: [
            { entity: "camera.left", order: 0 },
            { entity: "camera.right", order: 1 },
          ],
        },
      },
    }),
  });

  assert.deepEqual(capabilities.rendering, [
    "camera.helpers",
    "camera.multiple",
    "camera.perspective",
    "camera.render-target",
    "camera.viewport",
    "material.standard",
    "material.texture.base-color",
    "render-layers",
  ]);
});

test("derives overlay capabilities", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: assetsManifest([]),
    materials: materialsIr([]),
    overlays: {
      schema: "threenative.overlays",
      version: "0.1.0",
      overlays: [
        {
          entry: "overlay/index.html",
          id: "inventory",
          input: "pointer",
          messages: {
            overlayToGame: [{ name: "inventory:use-item", schema: { kind: "object", fields: { itemId: "string" }, required: ["itemId"] } }],
          },
          targetProfiles: ["desktop", "web"],
          transparent: true,
          zIndex: 20,
        },
      ],
    },
  });

  assert.deepEqual(capabilities.overlay, ["bridge", "input.pointer", "target.desktop", "target.web", "transparent", "webview"]);
});

test("derives UI screen stack and focus scope capabilities", () => {
  const capabilities = deriveRequiredCapabilities({
    assets: assetsManifest([]),
    materials: materialsIr([]),
    ui: uiIr(),
  });

  assert.deepEqual(capabilities.ui, [
    "action",
    "focus-scope",
    "input-capture.modal",
    "node.button",
    "node.column",
    "node.stack",
    "runtime",
    "screen-stack",
    "screen.menu",
    "screen.modal",
    "stack-policy.exclusiveModal",
    "stack-policy.push",
  ]);
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

function uiIr(): IUiIr {
  return {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "ui.root",
      kind: "stack",
      children: [
        { id: "pause.panel", kind: "column", children: [{ id: "resume", kind: "button", action: "Resume", label: "Resume" }] },
        { id: "confirm.dialog", kind: "column", children: [{ id: "confirm.cancel", kind: "button", action: "UiCancel", label: "Cancel" }] },
      ],
    },
    screens: [
      { id: "pause", role: "menu", root: "pause.panel", stackPolicy: "push", focusScope: { entry: "resume", inputCapture: "modal" } },
      { id: "confirm", role: "modal", root: "confirm.dialog", stackPolicy: "exclusiveModal", focusScope: { entry: "confirm.cancel", inputCapture: "modal" } },
    ],
    screenStack: { active: ["pause", "confirm"], policy: "exclusiveModal" },
  };
}
