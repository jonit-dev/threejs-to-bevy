import assert from "node:assert/strict";
import test from "node:test";
import type { IAssetsManifest, IEnvironmentSceneIr, IMaterialsIr, IWorldIr } from "@threenative/ir";
import { bakeGiProbes, computeProbeSceneContentHash } from "./probeBaker.js";
import type { ISceneRayQuery, SceneRayVec3 } from "./sceneRayQuery.js";

test("probe baker should produce warm SH facing a lit red wall", () => {
  const report = bakeGiProbes({
    albedoByEntity: new Map([["wall.red", [1, 0.01, 0.01] as const]]),
    assets: assets(),
    environment: environment(),
    materials: materials(),
    query: redWallQuery,
    rayCount: 192,
    seed: 42,
    world: world(),
  });
  const coefficients = report.probes[0]?.source.coefficients;
  assert.ok(coefficients);
  assert.equal(coefficients.length, 27);
  assert.ok(coefficients[0]! > coefficients[1]! * 1.1);
  assert.ok(report.hitCount > 0);
});

test("probe baker should be deterministic across runs and ignore prior baked payloads in its content hash", () => {
  const input = { albedoByEntity: new Map([["wall.red", [1, 0.01, 0.01] as const]]), assets: assets(), environment: environment(), materials: materials(), query: redWallQuery, rayCount: 96, seed: 7, world: world() };
  const first = bakeGiProbes(input);
  const rebakeEnvironment = environment();
  rebakeEnvironment.lightProbes![0]!.source = first.probes[0]!.source;
  const second = bakeGiProbes({ ...input, environment: rebakeEnvironment });
  assert.deepEqual(second, first);
});

test("probe scene content hash should match emitted JSON when optional fields are undefined", () => {
  const inMemoryEnvironment = { ...environment(), budgets: undefined };
  const emittedEnvironment = JSON.parse(JSON.stringify(inMemoryEnvironment)) as IEnvironmentSceneIr;

  assert.equal(
    computeProbeSceneContentHash(world(), materials(), inMemoryEnvironment, assets()),
    computeProbeSceneContentHash(world(), materials(), emittedEnvironment, assets()),
  );
});

const redWallQuery: ISceneRayQuery = {
  occluded: () => false,
  raycast(origin: SceneRayVec3, direction: SceneRayVec3, maxDistance: number) {
    if (direction[0] >= -0.05) return null;
    const distance = Math.min(maxDistance, Math.abs((-2 - origin[0]) / direction[0]));
    return { distance, entityId: "wall.red", normal: [1, 0, 0], point: [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance] };
  },
};

function environment(): IEnvironmentSceneIr {
  return {
    atmosphere: {
      active: true,
      ambient: { color: "#ffffff", intensity: 0.5, mode: "constant" },
      colorManagement: { exposure: 1, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" },
      id: "atmosphere.test",
      shadows: { bias: 0, cascadeCount: 1, enabled: true, mapSize: 1024, maxDistance: 100, normalBias: 0, receiverPolicy: "terrain-and-path" },
      sky: { color: "#ffffff" },
      sun: { castsShadow: true, color: "#ffffff", direction: [-1, -1, 0], id: "sun", intensity: 2 },
    },
    instances: [],
    lightProbes: [{ bounds: { max: [1, 1, 1], min: [-1, -1, -1] }, id: "probe.center", influenceRadius: 4, intent: "irradiance", source: { asset: "tex.placeholder", mode: "equirect" } }],
    path: { id: "path", points: [[0, 0, 0], [1, 0, 0]], width: 1 },
    schema: "threenative.environment-scene",
    sourceAssets: [],
    version: "0.1.0",
  };
}

function materials(): IMaterialsIr { return { materials: [{ color: "#ff0000", id: "mat.red", kind: "standard" }], schema: "threenative.materials", version: "0.1.0" }; }
function assets(): IAssetsManifest { return { assets: [{ format: "generated", id: "mesh.wall", kind: "mesh", primitive: "box", size: [1, 1, 1] }], schema: "threenative.assets", version: "0.1.0" }; }
function world(): IWorldIr { return { entities: [{ components: { MeshRenderer: { material: "mat.red", mesh: "mesh.wall" } }, id: "wall.red" }], schema: "threenative.world", version: "0.1.0" }; }
