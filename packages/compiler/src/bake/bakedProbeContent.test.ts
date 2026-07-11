import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { IAssetsManifest, IEnvironmentSceneIr, IMaterialsIr, IWorldIr } from "@threenative/ir";
import { applyBakedProbeContent } from "./bakedProbeContent.js";
import { computeProbeSceneContentHash } from "./probeBaker.js";

test("baked probe content embeds by authored probe id and diagnoses stale scene hashes", async () => {
  const root = await mkdtemp(join(process.cwd(), "tmp-baked-probe-content-"));
  try {
    await mkdir(join(root, "content/lighting"), { recursive: true });
    const world: IWorldIr = { entities: [], schema: "threenative.world", version: "0.1.0" };
    const materials: IMaterialsIr = { materials: [], schema: "threenative.materials", version: "0.1.0" };
    const assets: IAssetsManifest = { assets: [{ format: "generated", id: "mesh.wall", kind: "mesh", primitive: "box", size: [1, 1, 1] }], schema: "threenative.assets", version: "0.1.0" };
    const environment = scene();
    const currentHash = computeProbeSceneContentHash(world, materials, environment, assets);
    const source = { bakeVersion: 1 as const, coefficients: Array(27).fill(0.1), format: "sh2" as const, sceneContentHash: currentHash };
    await writeFile(join(root, "content/lighting/alcove.probes.json"), JSON.stringify({ probes: [{ id: "probe.center", source }], sceneContentHash: currentHash, sceneId: "alcove", schema: "threenative.baked-probes", version: "0.1.0" }));
    const fresh = await applyBakedProbeContent(root, world, materials, environment, assets);
    assert.deepEqual(fresh.diagnostics, []);
    assert.deepEqual(fresh.environment.lightProbes?.[0]?.source, source);

    const changedAssets: IAssetsManifest = { ...assets, assets: [{ format: "generated", id: "mesh.wall", kind: "mesh", primitive: "box", size: [2, 1, 1] }] };
    const stale = await applyBakedProbeContent(root, world, materials, environment, changedAssets);
    assert.equal(stale.diagnostics[0]?.code, "TN_IR_LIGHT_PROBE_BAKE_STALE");
    assert.match(stale.diagnostics[0]?.suggestion ?? "", /tn bake gi/);

    await writeFile(join(root, "content/lighting/alcove.probes.json"), JSON.stringify({ probes: [{ id: "probe.center", source: { ...source, sceneContentHash: `sha256:${"b".repeat(64)}` } }], sceneContentHash: currentHash, sceneId: "alcove", schema: "threenative.baked-probes", version: "0.1.0" }));
    const mismatched = await applyBakedProbeContent(root, world, materials, environment, assets);
    assert.equal(mismatched.diagnostics[0]?.code, "TN_IR_LIGHT_PROBE_BAKE_STALE");
    assert.match(mismatched.diagnostics[0]?.path ?? "", /source\/sceneContentHash/);
    assert.notDeepEqual(mismatched.environment.lightProbes?.[0]?.source, source);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function scene(): IEnvironmentSceneIr {
  return {
    instances: [],
    lightProbes: [{ bounds: { max: [1, 1, 1], min: [-1, -1, -1] }, id: "probe.center", influenceRadius: 2, intent: "irradiance", source: { asset: "tex.env", mode: "equirect" } }],
    path: { id: "path", points: [[0, 0, 0], [1, 0, 0]], width: 1 },
    schema: "threenative.environment-scene",
    sourceAssets: [],
    version: "0.1.0",
  };
}
