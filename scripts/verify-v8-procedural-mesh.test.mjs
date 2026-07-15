import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { verifyV8ProceduralMesh } from "./verify-v8-procedural-mesh.mjs";

test("procedural mesh gate writes a failure report when visual capture throws", async () => {
  const artifactDir = await mkdtemp(resolve(tmpdir(), "threenative-procedural-mesh-"));
  const reportPath = resolve(artifactDir, "verification-report.json");

  try {
    const result = await verifyV8ProceduralMesh({
      artifactDir,
      physicsVerifier: async () => ({ diagnostics: [], ok: true, reportPath: resolve(artifactDir, "physics-report.json") }),
      reportPath,
      run: async () => ({ durationMs: 1, exitCode: 0, stderr: "", stdout: "" }),
      visualVerifier: async () => {
        throw new Error("preview readiness timeout");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.steps.at(-1)?.stderr, "preview readiness timeout");
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(report.status, "fail");
    assert.equal(report.steps.at(-1)?.name, "verify procedural mesh visual parity");
  } finally {
    await rm(artifactDir, { force: true, recursive: true });
  }
});
