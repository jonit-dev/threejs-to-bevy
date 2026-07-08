import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import { authoringCommand } from "./authoring.js";
import { worldCommand } from "./world.js";

test("should generate valid biome world when meadow requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-world-generate-"));
  try {
    const result = await worldCommand(["generate", "--biome", "meadow", "--seed", "7", "--size", "9", "--project", root, "--json"]);
    const payload = JSON.parse(result.stdout) as { code: string; environmentPath: string; heightmapPath: string; provenance: Array<{ id: string }> };
    const validate = await authoringCommand(["validate", "--project", root, "--json"]);
    const environment = JSON.parse(await readFile(join(root, "content/environment/world.environment.json"), "utf8")) as {
      provenance: { catalogRecords: unknown[] };
      scatter: unknown[];
      terrain: { heightMode: string; heightmap: { asset: string } };
    };
    const assets = JSON.parse(await readFile(join(root, "content/assets/world.assets.json"), "utf8")) as {
      assets: Array<{ id: string; type: string }>;
      provenance: { catalogRecords: unknown[] };
    };
    const heightmap = JSON.parse(await readFile(join(root, "assets/terrain/world-meadow.heightmap.json"), "utf8")) as { samples: number[] };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_WORLD_GENERATE_OK");
    assert.equal(payload.environmentPath, "content/environment/world.environment.json");
    assert.equal(payload.heightmapPath, "assets/terrain/world-meadow.heightmap.json");
    assert.equal(validate.exitCode, 0);
    assert.equal(environment.terrain.heightMode, "heightmap");
    assert.equal(environment.terrain.heightmap.asset, "heightmap.world.meadow");
    assert.ok(environment.scatter.length > 0);
    assert.equal(assets.assets.some((asset) => asset.id === "heightmap.world.meadow" && asset.type === "heightmap"), true);
    assert.equal(assets.provenance.catalogRecords.length > 0, true);
    assert.equal(environment.provenance.catalogRecords.length > 0, true);
    assert.equal(payload.provenance.length > 0, true);
    assert.equal(heightmap.samples.length, 81);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should be idempotent when re-run with same seed", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-world-idempotent-"));
  try {
    const args = ["generate", "--biome", "forest", "--seed", "11", "--size", "9", "--project", root, "--json"];
    const first = await worldCommand(args);
    const firstEnvironment = await readFile(join(root, "content/environment/world.environment.json"), "utf8");
    const firstAssets = await readFile(join(root, "content/assets/world.assets.json"), "utf8");
    const firstHeightmap = await readFile(join(root, "assets/terrain/world-forest.heightmap.json"), "utf8");
    const second = await worldCommand(args);

    assert.equal(first.exitCode, 0);
    assert.equal(second.exitCode, 0);
    assert.equal(await readFile(join(root, "content/environment/world.environment.json"), "utf8"), firstEnvironment);
    assert.equal(await readFile(join(root, "content/assets/world.assets.json"), "utf8"), firstAssets);
    assert.equal(await readFile(join(root, "assets/terrain/world-forest.heightmap.json"), "utf8"), firstHeightmap);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should write world proof artifact with terrain and scatter counts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-world-proof-"));
  try {
    const generated = await worldCommand(["generate", "--biome", "canyon", "--seed", "5", "--size", "9", "--flatten-radius", "1", "--project", root, "--json"]);
    const proof = await worldCommand(["proof", "--project", root, "--json"]);
    const payload = JSON.parse(proof.stdout) as { code: string; flatPlaneRisk: boolean; previewImage: string; scatterLayers: number };
    const artifact = JSON.parse(await readFile(join(root, "artifacts/world/world-proof.json"), "utf8")) as { code: string };
    const preview = PNG.sync.read(await readFile(join(root, "artifacts/world/world-preview.png")));

    assert.equal(generated.exitCode, 0);
    assert.equal(proof.exitCode, 0);
    assert.equal(payload.code, "TN_WORLD_PROOF_OK");
    assert.equal(payload.flatPlaneRisk, false);
    assert.equal(payload.previewImage, "artifacts/world/world-preview.png");
    assert.equal(preview.width, 9);
    assert.equal(preview.height, 9);
    assert.equal(payload.scatterLayers > 0, true);
    assert.equal(artifact.code, "TN_WORLD_PROOF_OK");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail world proof for flat generated heightmaps", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-world-proof-flat-"));
  try {
    const generated = await worldCommand(["generate", "--biome", "meadow", "--seed", "9", "--size", "9", "--flatten-radius", "1", "--project", root, "--json"]);
    await writeFile(join(root, "assets/terrain/world-meadow.heightmap.json"), `${JSON.stringify({ samples: Array.from({ length: 81 }, () => 0) }, null, 2)}\n`);
    const proof = await worldCommand(["proof", "--project", root, "--json"]);
    const payload = JSON.parse(proof.stdout) as { code: string; diagnostics: Array<{ code: string }>; flatPlaneRisk: boolean };

    assert.equal(generated.exitCode, 0);
    assert.equal(proof.exitCode, 1);
    assert.equal(payload.code, "TN_WORLD_PROOF_FAILED");
    assert.equal(payload.flatPlaneRisk, true);
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_WORLD_PROOF_HEIGHTMAP_FLAT"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
