import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV3VisualPerformance } from "./v3VisualPerformance.js";

test("v3VisualPerformance should require performance artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v3-visual-"));
  try {
    const report = makeReport(root);
    await assert.rejects(() => verifyV3VisualPerformance(report));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("v3VisualPerformance should include performance summary beside visual artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v3-visual-"));
  try {
    const report = makeReport(root);
    await writeFile(report.artifacts.metricsPath, "{}");
    await writeFile(report.artifacts.rawSamplesPath, "{}");

    const result = await verifyV3VisualPerformance(report);

    assert.match(result.artifacts.metricsPath, /v3-performance-summary\.json$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function makeReport(root: string) {
  return {
    artifacts: {
      metricsPath: join(root, "v3-performance-summary.json"),
      rawSamplesPath: join(root, "v3-performance-samples.json"),
      reportPath: join(root, "v3-environment-report.json"),
    },
    diagnostics: [],
    instancing: { groups: 1, instances: 2, uninstancedRepeatedProps: 0 },
    metrics: {
      averageFrameMs: 12,
      drawCalls: 1,
      geometries: 1,
      instancedGroups: 1,
      instances: 2,
      loadMs: 1,
      p95FrameMs: 12,
      programs: 1,
      textures: 1,
      textureBytes: 1,
      triangles: 1,
      uninstancedRepeatedProps: 0,
      worstFrameMs: 12,
    },
    status: "pass" as const,
  };
}
