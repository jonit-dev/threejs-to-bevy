import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runModelTestMaterialGate } from "./modelTestMaterialGate.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("should retain relocation and material artifacts in the owning verification report", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "tn-model-test-material-gate-"));
  try {
    const fixturePath = resolve(repositoryRoot, "packages/cli/fixtures/model-test/colored-metallic.glb");
    const report = await runModelTestMaterialGate({ artifactDir, fixturePath });

    assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
    assert.equal(report.relocation.sourceRootAbsent, true);
    assert.equal(report.relocation.buildPassed, true);
    assert.equal(report.relocation.validationPassed, true);
    assert.equal(report.materialEvidence.verdict, "matches-authored");
    assert.deepEqual(report.turntable.angles, [0, 90, 180, 270]);
    assert.equal(report.negativeControl.diagnosticCode, "TN_MODEL_TEST_MATERIAL_VERIFY_FAILED");
    assert.equal(report.negativeControl.verdict, "fallback-only");
    for (const path of [
      report.artifacts.contactSheet,
      report.artifacts.materialReport,
      report.artifacts.negativeControlReport,
      report.artifacts.negativeControlScreenshot,
      report.artifacts.turntableManifest,
    ]) {
      await access(resolve(repositoryRoot, path));
    }
    const retainedJson = await Promise.all([
      report.artifacts.materialReport,
      report.artifacts.negativeControlReport,
      report.artifacts.turntableManifest,
    ].map((path) => readFile(resolve(repositoryRoot, path), "utf8")));
    assert.equal(retainedJson.some((text) => text.includes(repositoryRoot)), false);
  } finally {
    await rm(artifactDir, { force: true, recursive: true });
  }
});
