import assert from "node:assert/strict";
import test from "node:test";

import { collectPerformanceSummary, summarizeFrameTimings } from "./performanceMetrics.js";

test("performanceMetrics should summarize frame timing samples with average p95 and worst frame", () => {
  const summary = summarizeFrameTimings([10, 12, 14, 20]);

  assert.equal(summary.averageFrameMs, 14);
  assert.equal(summary.p95FrameMs, 20);
  assert.equal(summary.worstFrameMs, 20);
});

test("performanceMetrics should include renderer draw and texture metrics", () => {
  const summary = collectPerformanceSummary({
    frameSamples: [10],
    instancingPlan: { diagnostics: [], groups: [{ count: 3, instanceIds: ["a", "b", "c"], sourceAsset: "env.Grass" }], instanceCount: 3, uninstanced: [], uninstancedRepeatedPropCount: 0 },
    loadMs: 25,
    rendererInfo: { memory: { geometries: 2, textures: 4 }, programs: [{}, {}], render: { calls: 5, triangles: 300 } },
    textureBytes: 1024,
  });

  assert.equal(summary.drawCalls, 5);
  assert.equal(summary.triangles, 300);
  assert.equal(summary.textures, 4);
  assert.equal(summary.textureBytes, 1024);
});
