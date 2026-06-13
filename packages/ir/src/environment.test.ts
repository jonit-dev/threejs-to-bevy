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

function makeAssets(): IAssetsManifest {
  return {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [{ format: "gltf", id: "model.env.Tree", kind: "model", path: "assets/environment/Tree.gltf" }],
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
