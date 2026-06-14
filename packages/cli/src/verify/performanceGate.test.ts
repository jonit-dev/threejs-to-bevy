import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePerformanceGate } from "./performanceGate.js";

test("performanceGate should pass when web metrics are within budget", () => {
  const result = evaluatePerformanceGate({ artifactPath: "metrics.json", metrics: makeMetrics(), targetProfile: makeProfile() });

  assert.equal(result.status, "pass");
  assert.deepEqual(result.diagnostics, []);
});

test("performanceGate should fail when p95 frame time exceeds the threshold", () => {
  const result = evaluatePerformanceGate({
    artifactPath: "metrics.json",
    metrics: { ...makeMetrics(), p95FrameMs: 30 },
    targetProfile: makeProfile(),
  });

  assert.equal(result.status, "fail");
  assert.equal(result.diagnostics[0]?.code, "TN_PERF_BUDGET_EXCEEDED");
  assert.equal(result.diagnostics[0]?.metric, "p95FrameMs");
  assert.equal(result.diagnostics[0]?.actual, 30);
  assert.equal(result.diagnostics[0]?.threshold, 24);
  assert.equal(result.diagnostics[0]?.artifactPath, "metrics.json");
  assert.match(result.diagnostics[0]?.message ?? "", /p95FrameMs measured 30/);
  assert.match(result.diagnostics[0]?.message ?? "", /metrics\.json/);
});

test("performanceGate should separate warnings from hard failures", () => {
  const result = evaluatePerformanceGate({
    artifactPath: "metrics.json",
    metrics: { ...makeMetrics(), averageFrameMs: 17 },
    targetProfile: {
      ...makeProfile(),
      performance: {
        ...makeProfile().performance,
        averageFrameMs: { max: 18, warn: 16 },
      },
    },
  });

  assert.equal(result.status, "pass");
  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.warnings[0]?.code, "TN_PERF_BUDGET_WARNING");
  assert.equal(result.warnings[0]?.metric, "averageFrameMs");
  assert.equal(result.warnings[0]?.actual, 17);
  assert.equal(result.warnings[0]?.threshold, 16);
});

test("performanceGate should fail when repeated vegetation is not instanced", () => {
  const result = evaluatePerformanceGate({
    artifactPath: "metrics.json",
    metrics: { ...makeMetrics(), uninstancedRepeatedProps: 2 },
    targetProfile: makeProfile(),
  });

  assert.equal(result.status, "fail");
  assert.match(result.diagnostics[0]?.message ?? "", /uninstancedRepeatedProps/);
});

function makeMetrics() {
  return {
    averageFrameMs: 12,
    bundleBytes: 4096,
    drawCalls: 10,
    drawEstimate: 10,
    environmentInstances: 8,
    geometries: 4,
    instancedGroups: 2,
    instancingGroupCount: 2,
    instances: 8,
    loadMs: 100,
    p95FrameMs: 14,
    programs: 1,
    sourceAssets: 2,
    textureEstimate: 3,
    textures: 3,
    textureBytes: 1000,
    triangleEstimate: 500,
    triangles: 500,
    uninstancedRepeatedProps: 0,
    worstFrameMs: 16,
  };
}

function makeProfile() {
  return {
    schema: "threenative.target-profile" as const,
    version: "0.1.0" as const,
    targets: ["web"] as const,
    performance: {
      averageFrameMs: { max: 18 },
      drawCalls: { max: 120 },
      instancedGroups: { max: 32 },
      instances: { max: 1600 },
      loadMs: { max: 2200 },
      p95FrameMs: { max: 24 },
      requiredTarget: "web" as const,
      textureBytes: { max: 18000000 },
      triangles: { max: 450000 },
      uninstancedRepeatedProps: { max: 0 },
      worstFrameMs: { max: 36 },
    },
  };
}
