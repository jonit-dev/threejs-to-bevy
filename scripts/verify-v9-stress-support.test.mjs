import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV9StressSupport } from "./verify-v9-stress-support.mjs";

test("should fail when stress report omits required UI light cube or animation metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-stress-"));
  try {
    const artifactDir = join(root, "artifacts");
    const stressReportPath = join(artifactDir, "stress-report.json");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(stressReportPath, `${JSON.stringify({ metrics: { audioEmitterCount: 1 } })}\n`);

    const result = await verifyV9StressSupport({ artifactDir, repoRoot: root, stressReportPath, writeArtifacts: false });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path.endsWith("/metrics/uiNodeCount")), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path.endsWith("/metrics/lightCount")), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path.endsWith("/metrics/cubeCount")), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path.endsWith("/metrics/animatedModelCount")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
