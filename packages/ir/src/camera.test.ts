import assert from "node:assert/strict";
import test from "node:test";

import { validateCameraViews } from "./camera.js";
import type { IAssetsManifest, IMaterialsIr, IWorldIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

test("should accept ordered active cameras with split-screen viewports", () => {
  const diagnostics: IIrDiagnostic[] = [];
  validateCameraViews(makeWorld(), makeMaterials(), makeAssets(), "world.ir.json", diagnostics);
  assert.deepEqual(diagnostics, []);
});

test("should reject a render target cycle when a camera samples its own texture", () => {
  const diagnostics: IIrDiagnostic[] = [];
  validateCameraViews(
    makeWorld({
      entities: [
        {
          components: {
            Camera: {
              far: 100,
              fovY: 60,
              kind: "perspective",
              layers: ["monitor"],
              near: 0.1,
              target: { asset: "rt.monitor", kind: "texture" },
            },
            Transform: { position: [0, 1, 3] },
          },
          id: "camera.monitor",
        },
        {
          components: {
            MeshRenderer: { material: "mat.monitor", mesh: "mesh.monitor" },
            RenderLayers: { layers: ["monitor"] },
            Transform: { position: [0, 1, 0] },
          },
          id: "mesh.monitor",
        },
      ],
      resources: {
        ActiveCameras: {
          cameras: [{ entity: "camera.monitor", order: 0 }],
        },
      },
    }),
    makeMaterials([{ baseColorTexture: "rt.monitor", color: "#ffffff", id: "mat.monitor", kind: "standard" }]),
    makeAssets(),
    "world.ir.json",
    diagnostics,
  );

  assert.equal(diagnostics[0]?.code, "TN_IR_CAMERA_RENDER_TARGET_CYCLE");
  assert.equal(diagnostics[0]?.path, "world.ir.json/entities/0/components/Camera/target");
});

test("should reject raw backend projection payloads with explicit unsupported diagnostic", () => {
  const diagnostics: IIrDiagnostic[] = [];
  validateCameraViews(
    makeWorld({
      entities: [
        {
          components: {
            Camera: {
              far: 100,
              fovY: 60,
              kind: "perspective",
              near: 0.1,
              projection: { backend: "bevy", kind: "backend", payload: { type: "PerspectiveProjection" } },
            },
            Transform: { position: [0, 1, 3] },
          },
          id: "camera.main",
        },
      ],
    }),
    makeMaterials(),
    makeAssets(),
    "world.ir.json",
    diagnostics,
  );

  assert.equal(diagnostics[0]?.code, "TN_IR_CAMERA_CUSTOM_PROJECTION_UNSUPPORTED");
});

test("should accept color render target referenced by material", () => {
  const diagnostics: IIrDiagnostic[] = [];
  validateCameraViews(
    makeWorld({
      entities: [
        {
          components: {
            Camera: {
              far: 100,
              fovY: 60,
              kind: "perspective",
              layers: ["capture"],
              near: 0.1,
              target: { asset: "rt.monitor", kind: "texture" },
            },
            Transform: { position: [0, 1, 3] },
          },
          id: "camera.monitor",
        },
        {
          components: {
            MeshRenderer: { material: "mat.monitor", mesh: "mesh.monitor" },
            RenderLayers: { layers: ["display"] },
            Transform: { position: [0, 1, 0] },
          },
          id: "mesh.monitor",
        },
      ],
      resources: {
        ActiveCameras: {
          cameras: [{ entity: "camera.monitor", order: 0 }],
        },
      },
    }),
    makeMaterials([{ baseColorTexture: "rt.monitor", color: "#ffffff", id: "mat.monitor", kind: "standard" }]),
    makeAssets(),
    "world.ir.json",
    diagnostics,
  );

  assert.deepEqual(diagnostics, []);
});

test("should reject unsupported depth target sampling", () => {
  const diagnostics: IIrDiagnostic[] = [];
  validateCameraViews(
    makeWorld({
      entities: [
        {
          components: {
            Camera: {
              far: 100,
              fovY: 60,
              kind: "perspective",
              near: 0.1,
              target: { asset: "rt.depth", kind: "depth", sample: true },
            },
            Transform: { position: [0, 1, 3] },
          },
          id: "camera.depth",
        },
      ],
    }),
    makeMaterials(),
    makeAssets([
      { format: "depth24plus", height: 256, id: "rt.depth", kind: "render-target", usage: "depth", width: 256 },
    ]),
    "world.ir.json",
    diagnostics,
  );

  assert.equal(diagnostics[0]?.code, "TN_IR_CAMERA_DEPTH_TARGET_SAMPLING_UNSUPPORTED");
  assert.equal(diagnostics[0]?.path, "world.ir.json/entities/0/components/Camera/target");
});

test("should accept finite portable custom projection matrix", () => {
  const diagnostics: IIrDiagnostic[] = [];
  validateCameraViews(
    makeWorld({
      entities: [
        {
          components: {
            Camera: {
              far: 100,
              fovY: 60,
              kind: "perspective",
              near: 0.1,
              projection: {
                handedness: "right",
                kind: "matrix",
                matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.002, -0.2002, 0, 0, -1, 0],
              },
            },
            Transform: { position: [0, 1, 3] },
          },
          id: "camera.main",
        },
      ],
    }),
    makeMaterials(),
    makeAssets(),
    "world.ir.json",
    diagnostics,
  );

  assert.deepEqual(diagnostics, []);
});

function makeWorld(overrides: Partial<IWorldIr> = {}): IWorldIr {
  const entities = overrides.entities ?? [
    {
      components: {
        Camera: {
          far: 100,
          fovY: 60,
          kind: "perspective",
          near: 0.1,
          order: 0,
          viewport: [0, 0, 0.5, 1],
        },
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
  ];
  const cameras = entities
    .filter((entity) => entity.components.Camera !== undefined)
    .map((entity, index) => ({ entity: entity.id, order: entity.components.Camera?.order ?? index }));
  return {
    entities,
    resources: overrides.resources ?? {
      ActiveCameras: {
        cameras,
      },
    },
    schema: "threenative.world",
    version: "0.1.0",
  };
}

function makeMaterials(materials: IMaterialsIr["materials"] = []): IMaterialsIr {
  return { materials, schema: "threenative.materials", version: "0.1.0" };
}

function makeAssets(assets: IAssetsManifest["assets"] = [
  { format: "rgba8", height: 256, id: "rt.monitor", kind: "render-target", usage: "color", width: 256 },
]): IAssetsManifest {
  return { assets, schema: "threenative.assets", version: "0.1.0" };
}
