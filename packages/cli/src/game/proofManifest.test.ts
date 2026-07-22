import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProofManifest, diffProofManifests, evaluateProofFreshness } from "./proofManifest.js";

test("reuses fresh unrelated proof when inputs match", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-proof-fresh-"));
  try {
    await mkdir(join(root, "content"), { recursive: true });
    await writeFile(join(root, "content", "game.scene.json"), "{}\n");
    const previous = await buildProofManifest({ projectPath: root });
    const previousPath = join(root, "previous-proof.json");
    await writeFile(previousPath, `${JSON.stringify(previous, null, 2)}\n`);

    const report = await evaluateProofFreshness({ previousPath, projectPath: root });

    assert.equal(report.fresh, true);
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.recommendations, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("selects playtest for script change", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-proof-script-change-"));
  try {
    await mkdir(join(root, "src", "scripts"), { recursive: true });
    await writeFile(join(root, "src", "scripts", "player.ts"), "export function update() {}\n");
    const previous = await buildProofManifest({ projectPath: root });
    const previousPath = join(root, "previous-proof.json");
    await writeFile(previousPath, `${JSON.stringify(previous, null, 2)}\n`);
    await writeFile(join(root, "src", "scripts", "player.ts"), "export function update(): void {}\n");

    const report = await evaluateProofFreshness({ previousPath, projectPath: root });

    assert.equal(report.fresh, false);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_SOURCE_HASH_MISMATCH"), true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_PROOF_STALE"), true);
    assert.equal(report.recommendations.some((recommendation) => recommendation.id === "run-playtest"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("proof diff reports asset file changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-proof-diff-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets", "hero.glb"), "old");
    const from = await buildProofManifest({ projectPath: root });
    const fromPath = join(root, "from.json");
    await writeFile(fromPath, `${JSON.stringify(from, null, 2)}\n`);
    await writeFile(join(root, "assets", "hero.glb"), "new");
    const to = await buildProofManifest({ projectPath: root });
    const toPath = join(root, "to.json");
    await writeFile(toPath, `${JSON.stringify(to, null, 2)}\n`);

    const diff = await diffProofManifests({ fromPath, toPath });

    assert.equal(diff.code, "TN_PROOF_DIFF");
    assert.equal(diff.changed.length, 1);
    assert.equal(diff.changed[0]?.to.path, "assets/hero.glb");
    assert.equal(diff.changed[0]?.to.role, "asset");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("hashes configured external source and bundle roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-proof-configured-"));
  try {
    await mkdir(join(root, "fixture/game.bundle"), { recursive: true });
    await mkdir(join(root, "example/playtests"), { recursive: true });
    await writeFile(join(root, "fixture/game.bundle/world.ir.json"), "{}\n");
    await writeFile(join(root, "fixture/game.bundle/manifest.json"), "{}\n");
    await writeFile(join(root, "example/playtests/flight.json"), "{}\n");
    await writeFile(join(root, "example/threenative.config.json"), JSON.stringify({ entry: "../fixture/game.bundle/world.ir.json", outDir: "../fixture/game.bundle" }));

    const manifest = await buildProofManifest({ projectPath: join(root, "example") });

    assert.ok(manifest.files.some((file) => file.role === "source" && file.path === "../fixture/game.bundle/world.ir.json"));
    assert.ok(manifest.files.some((file) => file.role === "bundle" && file.path === "../fixture/game.bundle/manifest.json"));
    assert.ok(manifest.files.some((file) => file.role === "source" && file.path === "playtests/flight.json"));
    assert.notEqual(manifest.sourceHash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert.ok(manifest.bundleHash);
    assert.notEqual(manifest.generatedAt, "1970-01-01T00:00:00.000Z");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
