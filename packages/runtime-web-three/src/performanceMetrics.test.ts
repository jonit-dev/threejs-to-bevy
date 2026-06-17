import assert from "node:assert/strict";
import test from "node:test";

import { collectPerformanceSummary, summarizeFrameTimings } from "./performanceMetrics.js";

test("performanceMetrics should summarize frame timing samples with average p95 and worst frame", () => {
  const summary = summarizeFrameTimings([10, 12, 14, 20]);

  assert.equal(summary.averageFrameMs, 14);
  assert.equal(summary.p95FrameMs, 20);
  assert.equal(summary.worstFrameMs, 20);
});

test("should include support overlay metrics when diagnostics are enabled", () => {
  const summary = collectPerformanceSummary({
    frameSamples: [16],
    instancingPlan: { diagnostics: [], groups: [], instanceCount: 0, uninstanced: [], uninstancedRepeatedPropCount: 0 },
    loadMs: 12,
    rendererInfo: { render: { calls: 2, triangles: 24 } },
    supportMetrics: {
      audioVoiceCount: 6,
      debugDrawCount: 10,
      localDataSlotCount: 3,
      memoryEstimateBytes: 2048,
      saveLatencyMs: 4,
      uiNodeCount: 12,
    },
    textureBytes: 0,
  });

  assert.equal(summary.audioVoiceCount, 6);
  assert.equal(summary.debugDrawCount, 10);
  assert.equal(summary.localDataSlotCount, 3);
  assert.equal(summary.memoryEstimateBytes, 2048);
  assert.equal(summary.saveLatencyMs, 4);
  assert.equal(summary.uiNodeCount, 12);
});

test("performanceMetrics should include renderer draw and texture metrics", () => {
  const summary = collectPerformanceSummary({
    bundleBytes: 4096,
    environmentInstanceCount: 5,
    frameSamples: [10],
    instancingPlan: { diagnostics: [], groups: [{ count: 3, instanceIds: ["a", "b", "c"], sourceAsset: "env.Grass" }], instanceCount: 3, uninstanced: [], uninstancedRepeatedPropCount: 0 },
    loadMs: 25,
    rendererInfo: { memory: { geometries: 2, textures: 4 }, programs: [{}, {}], render: { calls: 5, triangles: 300 } },
    sourceAssetCount: 2,
    textureBytes: 1024,
  });

  assert.equal(summary.bundleBytes, 4096);
  assert.equal(summary.drawCalls, 5);
  assert.equal(summary.drawEstimate, 5);
  assert.equal(summary.environmentInstances, 5);
  assert.equal(summary.instancingGroupCount, 1);
  assert.equal(summary.sourceAssets, 2);
  assert.equal(summary.triangles, 300);
  assert.equal(summary.triangleEstimate, 300);
  assert.equal(summary.textures, 4);
  assert.equal(summary.textureEstimate, 4);
  assert.equal(summary.textureBytes, 1024);
});
