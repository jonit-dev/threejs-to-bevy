import assert from "node:assert/strict";
import test from "node:test";

import { validateEnvironmentSceneIr } from "./environment.js";
import type { IAssetsManifest, IEnvironmentSceneIr } from "./types.js";

test("environment should validate forest path terrain when path stays in bounds", () => {
  const diagnostics = validateEnvironmentSceneIr(makeScene(), makeAssets(), "environment.scene.json");

  assert.deepEqual(diagnostics, []);
});

test("environment should reject path point outside terrain bounds", () => {
  const scene = makeScene({
    path: { id: "forest.path.main", width: 2, points: [[0, 0, 0], [20, 0, 0]] },
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets(), "environment.scene.json");

  assert.equal(diagnostics[0]?.code, "TN_IR_ENVIRONMENT_PATH_POINT_OUT_OF_BOUNDS");
  assert.match(diagnostics[0]?.message ?? "", /point 1/);
});

test("environment should accept 4-layer splat heightmap terrain", () => {
  const scene = makeScene({
    terrain: makeHeightmapTerrain({
      splatLayers: [
        { texture: "tex.ground.grass", minSlope: 0, maxSlope: 18, weight: 0.7 },
        { texture: "tex.ground.dirt", minHeight: -0.2, maxHeight: 0.4, weight: 0.45 },
        { texture: "tex.ground.rock", minSlope: 18, maxSlope: 55, weight: 0.6 },
        { texture: "tex.ground.snow", minHeight: 0.5, maxHeight: 1.4, weight: 0.35 },
      ],
    }),
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets({ includeTerrain: true }), "environment.scene.json");

  assert.deepEqual(diagnostics, []);
});

test("environment should reject 5th splat terrain layer", () => {
  const scene = makeScene({
    terrain: makeHeightmapTerrain({
      splatLayers: [
        { texture: "tex.ground.grass" },
        { texture: "tex.ground.dirt" },
        { texture: "tex.ground.rock" },
        { texture: "tex.ground.snow" },
        { texture: "tex.ground.moss" },
      ],
    }),
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets({ includeTerrain: true }), "environment.scene.json");

  assert.equal(diagnostics[0]?.code, "TN_IR_ENVIRONMENT_TERRAIN_SPLAT_LAYER_LIMIT_EXCEEDED");
  assert.equal(diagnostics[0]?.path, "environment.scene.json/terrain/splatLayers");
});

test("environment should error when grid exceeds target profile budget", () => {
  const scene = makeScene({ terrain: makeHeightmapTerrain() });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets({ includeTerrain: true }), "environment.scene.json", undefined, {
    budgets: { maxTerrainCells: 1024 },
  });

  assert.equal(diagnostics[0]?.code, "TN_TERRAIN_BUDGET_EXCEEDED");
  assert.equal(diagnostics[0]?.path, "environment.scene.json/terrain/heightmap/asset");
});

test("environment should reject scatter spec above count budget", () => {
  const [scatter] = makeScene().scatter!;
  assert.ok(scatter);
  const scene = makeScene({ scatter: [{ ...scatter, count: 2001 }] });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets(), "environment.scene.json");

  assert.equal(diagnostics[0]?.code, "TN_IR_ENVIRONMENT_SCATTER_COUNT_INVALID");
});

test("environment should reject hero placement when asset is missing", () => {
  const scene = makeScene({
    instances: [{ id: "hero.missing", kind: "hero", sourceAsset: "env.Missing", position: [0, 0, 0] }],
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets(), "environment.scene.json");

  assert.equal(diagnostics[0]?.code, "TN_IR_ENVIRONMENT_SOURCE_ASSET_MISSING");
  assert.match(diagnostics[0]?.message ?? "", /hero.missing/);
});

test("environment should accept ordered LOD metadata for source assets", () => {
  const scene = makeScene({
    sourceAssets: [
      {
        asset: "model.env.Tree",
        category: "tree",
        id: "env.Tree",
        lod: [{ asset: "model.env.TreeLow", minDistance: 18, maxDistance: 60 }],
      },
    ],
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets({ includeLod: true }), "environment.scene.json");

  assert.deepEqual(diagnostics, []);
});

test("environment should accept visibility range and fade metadata when ordered and finite", () => {
  const scene = makeScene({
    sourceAssets: [
      {
        asset: "model.env.Tree",
        category: "tree",
        debug: { gizmo: true },
        id: "env.Tree",
        lod: [{ asset: "model.env.TreeLow", fade: { startDistance: 18, endDistance: 28 }, minDistance: 18, maxDistance: 60 }],
        visibility: { fade: { startDistance: 70, endDistance: 90 }, minDistance: 0, maxDistance: 100 },
      },
    ],
    instances: [
      {
        debug: { gizmo: true },
        id: "hero.tree",
        kind: "hero",
        position: [-3, 0, 2],
        sourceAsset: "env.Tree",
        tags: ["tree"],
        visibility: { minDistance: 0, maxDistance: 75 },
      },
    ],
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets({ includeLod: true }), "environment.scene.json");

  assert.deepEqual(diagnostics, []);
});

test("environment should reject invalid LOD metadata", () => {
  const scene = makeScene({
    sourceAssets: [
      {
        asset: "model.env.Tree",
        category: "tree",
        id: "env.Tree",
        lod: [
          { asset: "model.env.TreeLow", minDistance: 20, maxDistance: 40 },
          { asset: "model.env.Tree", minDistance: 10, maxDistance: 30 },
        ],
      },
    ],
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets({ includeLod: true }), "environment.scene.json");

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    ["TN_IR_ENVIRONMENT_LOD_CYCLE", "TN_IR_ENVIRONMENT_LOD_THRESHOLDS_UNSORTED"],
  );
  assert.equal(diagnostics[0]?.path, "environment.scene.json/sourceAssets/0/lod/1/asset");
});

test("environment should reject HLOD fade metadata when ranges overlap invalidly", () => {
  const scene = makeScene({
    sourceAssets: [
      {
        asset: "model.env.Tree",
        category: "tree",
        id: "env.Tree",
        lod: [{ asset: "model.env.TreeLow", fade: { startDistance: 30, endDistance: 20 }, minDistance: 18, maxDistance: 60 }],
        visibility: { fade: { startDistance: 10, endDistance: 5 }, minDistance: 20, maxDistance: 10 },
      },
    ],
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets({ includeLod: true }), "environment.scene.json");

  assert.deepEqual(
    diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path]),
    [
      ["TN_IR_RENDERER_VISIBILITY_RANGE_INVALID", "environment.scene.json/sourceAssets/0/lod/0/fade"],
      ["TN_IR_RENDERER_VISIBILITY_RANGE_INVALID", "environment.scene.json/sourceAssets/0/visibility"],
      ["TN_IR_RENDERER_VISIBILITY_RANGE_INVALID", "environment.scene.json/sourceAssets/0/visibility/fade"],
    ],
  );
});

test("environment should reject invalid LOD impostor metadata", () => {
  const scene = makeScene({
    sourceAssets: [
      {
        asset: "model.env.Tree",
        category: "tree",
        id: "env.Tree",
        lod: [
          {
            asset: "model.env.TreeLow",
            impostor: { material: "", mode: "sphericalBillboard" } as never,
            minDistance: 18,
            maxDistance: 60,
          },
        ],
      },
    ],
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets({ includeLod: true }), "environment.scene.json");

  assert.deepEqual(
    diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.path]),
    [
      ["TN_IR_ENVIRONMENT_LOD_IMPOSTOR_MODE_UNSUPPORTED", "environment.scene.json/sourceAssets/0/lod/0/impostor/mode"],
      ["TN_IR_ENVIRONMENT_LOD_IMPOSTOR_MATERIAL_INVALID", "environment.scene.json/sourceAssets/0/lod/0/impostor/material"],
    ],
  );
});

test("environment should reject backend-specific renderer and content fields", () => {
  const scene = {
    ...makeScene({
      sourceAssets: [
        {
          asset: "model.env.Tree",
          category: "tree",
          id: "env.Tree",
          nativeInstancing: true,
        } as IEnvironmentSceneIr["sourceAssets"][number],
      ],
      instances: [
        {
          id: "hero.tree",
          kind: "hero",
          position: [-3, 0, 2],
          sourceAsset: "env.Tree",
          tags: ["tree"],
          materialOverride: "mat.platform",
        } as IEnvironmentSceneIr["instances"][number],
      ],
    }),
    postProcessing: { bloom: true },
  } as IEnvironmentSceneIr;

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets(), "environment.scene.json");

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    [
      "TN_IR_ENVIRONMENT_FIELD_UNSUPPORTED",
      "TN_IR_ENVIRONMENT_FIELD_UNSUPPORTED",
      "TN_IR_ENVIRONMENT_FIELD_UNSUPPORTED",
    ],
  );
  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.path),
    [
      "environment.scene.json/postProcessing",
      "environment.scene.json/sourceAssets/0/nativeInstancing",
      "environment.scene.json/instances/0/materialOverride",
    ],
  );
});

test("environment should validate camera bookmarks with expected tags", () => {
  const scene = makeScene({
    bookmarks: [{ expectedTags: ["tree", "path-edge"], id: "bookmark.start", pitch: -5, position: [0, 1.7, 6], yaw: 180 }],
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets(), "environment.scene.json");

  assert.deepEqual(diagnostics, []);
});

test("environment should reject first-person controller with missing input action", () => {
  const scene = makeScene({
    controller: makeController({ input: { ...makeController().input, forward: "MoveForward" } }),
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets(), "environment.scene.json", {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [],
    axes: [{ id: "LookX", negative: [], positive: [], value: { axis: "deltaX", device: "pointer" } }],
  });

  assert.equal(diagnostics[0]?.code, "TN_IR_FIRST_PERSON_INPUT_ACTION_MISSING");
});

test("environment should reject invalid first-person pitch clamps", () => {
  const scene = makeScene({ controller: makeController({ pitch: { min: 20, max: -20 } }) });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets(), "environment.scene.json");

  assert.equal(diagnostics[0]?.code, "TN_IR_FIRST_PERSON_PITCH_CLAMP_INVALID");
});

test("walkability should reject blocking prop with missing instance reference", () => {
  const scene = makeScene({
    walkability: makeWalkability({ blockers: [{ collider: { radius: 1, type: "cylinder" }, id: "blocker.missing", instance: "missing" }] }),
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets(), "environment.scene.json");

  assert.equal(diagnostics[0]?.code, "TN_IR_WALKABILITY_BLOCKER_INSTANCE_MISSING");
});

test("walkability should reject self-intersecting walkable region", () => {
  const scene = makeScene({
    walkability: makeWalkability({ regions: [{ id: "region.invalid", points: [[-1, -1], [1, 1], [-1, 1], [1, -1]] }] }),
  });

  const diagnostics = validateEnvironmentSceneIr(scene, makeAssets(), "environment.scene.json");

  assert.equal(diagnostics[0]?.code, "TN_IR_WALKABILITY_REGION_SELF_INTERSECTS");
});

function makeScene(overrides: Partial<IEnvironmentSceneIr> = {}): IEnvironmentSceneIr {
  return {
    schema: "threenative.environment-scene",
    version: "0.1.0",
    sourceAssets: [{ asset: "model.env.Tree", category: "tree", id: "env.Tree" }],
    terrain: { bounds: { min: [-10, 0, -10], max: [10, 0, 10] }, heightMode: "flat", id: "terrain.main" },
    path: {
      clearingRadius: 2.5,
      edgeFalloff: 0.5,
      id: "forest.path.main",
      points: [[0, 0, 6], [0, 0, -6]],
      width: 2,
    },
    scatter: [
      {
        assetIds: ["env.Tree"],
        bounds: { min: [-8, 0, -8], max: [8, 0, 8] },
        count: 3,
        id: "scatter.trees",
        maxScale: 1.4,
        minScale: 1,
        seed: 7,
      },
    ],
    instances: [{ id: "hero.tree", kind: "hero", sourceAsset: "env.Tree", position: [-3, 0, 2], tags: ["tree"] }],
    ...overrides,
  };
}

function makeAssets(options: { includeLod?: boolean; includeTerrain?: boolean } = {}): IAssetsManifest {
  return {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [
      { format: "gltf", id: "model.env.Tree", kind: "model", path: "assets/environment/Tree.gltf" },
      ...(options.includeLod === true
        ? [{ format: "gltf" as const, id: "model.env.TreeLow", kind: "model" as const, path: "assets/environment/TreeLow.gltf" }]
        : []),
      ...(options.includeTerrain === true
        ? [
            { encoding: "u16-normalized" as const, format: "json" as const, height: 65, heightRange: { min: -1, max: 3 }, id: "heightmap.meadow", kind: "heightmap" as const, path: "assets/terrain/meadow.heightmap.json", width: 65 },
            { format: "png" as const, id: "tex.ground.grass", kind: "texture" as const, path: "assets/terrain/grass.png" },
            { format: "png" as const, id: "tex.ground.dirt", kind: "texture" as const, path: "assets/terrain/dirt.png" },
            { format: "png" as const, id: "tex.ground.rock", kind: "texture" as const, path: "assets/terrain/rock.png" },
            { format: "png" as const, id: "tex.ground.snow", kind: "texture" as const, path: "assets/terrain/snow.png" },
            { format: "png" as const, id: "tex.ground.moss", kind: "texture" as const, path: "assets/terrain/moss.png" },
          ]
        : []),
    ],
  };
}

function makeHeightmapTerrain(overrides: Partial<NonNullable<IEnvironmentSceneIr["terrain"]>> = {}): NonNullable<IEnvironmentSceneIr["terrain"]> {
  return {
    bounds: { min: [-32, -1, -32], max: [32, 3, 32] },
    heightmap: { asset: "heightmap.meadow", cellSize: 1, heightScale: 4, origin: [-32, 0, -32] },
    heightMode: "heightmap",
    id: "terrain.meadow",
    splatLayers: [{ texture: "tex.ground.grass" }],
    ...overrides,
  };
}

function makeController(overrides: Partial<IEnvironmentSceneIr["controller"]> = {}): NonNullable<IEnvironmentSceneIr["controller"]> {
  return {
    acceleration: 18,
    camera: "camera.firstPerson",
    height: 1.7,
    input: {
      backward: "MoveBackward",
      forward: "MoveForward",
      left: "MoveLeft",
      lookX: "LookX",
      lookY: "LookY",
      right: "MoveRight",
    },
    maxSpeed: 4.5,
    pitch: { min: -75, max: 75 },
    pointerLock: "required",
    sensitivity: 0.0025,
    ...overrides,
  };
}

function makeWalkability(overrides: Partial<NonNullable<IEnvironmentSceneIr["walkability"]>> = {}): NonNullable<IEnvironmentSceneIr["walkability"]> {
  return {
    blockers: [{ collider: { radius: 1, type: "cylinder" }, id: "blocker.hero", instance: "hero.tree" }],
    movementProfile: { boundary: "block", eyeHeight: 1.7, height: 1.8, maxStep: 0.35, radius: 0.35 },
    regions: [{ id: "path.walkable", points: [[-2, -6], [2, -6], [2, 6], [-2, 6]] }],
    terrain: { height: 0, surface: "terrain.main" },
    ...overrides,
  };
}
