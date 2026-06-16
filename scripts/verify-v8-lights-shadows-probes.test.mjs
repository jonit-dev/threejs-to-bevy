import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV8LightsShadowsProbes } from "./verify-v8-lights-shadows-probes.mjs";

test("should run focused V8-12 lights/shadows trace", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "tn-v8-lights-shadows-gate-"));
  try {
    const commands = [];
    const result = await verifyV8LightsShadowsProbes({
      artifactDir,
      repoRoot: process.cwd(),
      atmosphereVerifier: async ({ artifactDir }) => ({
        artifacts: { reportPath: join(artifactDir, "v3-atmosphere-report.json") },
        status: "pass",
      }),
      lightingColorVerifier: async ({ artifactDir }) => ({
        artifacts: { reportPath: join(artifactDir, "v3-lighting-color-report.json") },
        status: "pass",
      }),
      lightsShadowsVerifier: async ({ artifactDir }) => ({
        artifacts: {
          contactSheetPath: join(artifactDir, "screenshots/threejs-bevy-side-by-side.png"),
          reportPath: join(artifactDir, "v8-lights-shadows-report.json"),
        },
        diagnostics: [],
        status: "pass",
      }),
      sceneVerifier: async ({ artifactDir }) => ({
        artifacts: {
          reportPath: join(artifactDir, "v3-scene-report.json"),
          sideBySideContactSheetPath: join(artifactDir, "screenshots/threejs-bevy-side-by-side.png"),
        },
        status: "pass",
      }),
      run: async ({ args, command, cwd, name }) => {
        commands.push({ args, command, cwd, name });
        return { durationMs: 1, exitCode: 0, stderr: "", stdout: "" };
      },
    });
    const report = JSON.parse(await readFile(result.reportPath, "utf8"));

    assert.equal(report.status, "pass");
    assert.equal(report.scope.prd, "V8-12");
    assert.equal(report.scope.visualParity, "not-asserted");
    assert.match(report.artifacts.lightsShadowsReportPath, /v8-lights-shadows-report\.json$/);
    assert.match(report.artifacts.visualContactSheetPath, /threejs-bevy-side-by-side\.png$/);
    assert.deepEqual(commands.map((command) => command.name), [
      "build cli",
      "build v3 environment shadow fixture",
      "validate v3 environment shadow fixture",
    ]);
    assert.deepEqual(report.steps.slice(-4).map((step) => step.name), [
      "capture web/native shadow screenshots",
      "verify shadow policy metadata",
      "record lighting color drift metrics",
      "verify v8 lights/shadows trace",
    ]);
  } finally {
    await rm(artifactDir, { force: true, recursive: true });
  }
});
