import assert from "node:assert/strict";
import test from "node:test";

import {
  PERFORMANCE_PROOF_SCHEMA,
  PERFORMANCE_PROOF_VERSION,
  isPerformanceProofSidecarPassing,
  validatePerformanceProofSidecar,
  type PerformanceProofSidecar,
} from "./performanceProof.js";

function completeProof(overrides: Partial<PerformanceProofSidecar> = {}): PerformanceProofSidecar {
  return {
    schema: PERFORMANCE_PROOF_SCHEMA,
    version: PERFORMANCE_PROOF_VERSION,
    status: "pass",
    generatedBy: "@threenative/verify-tools performanceProof",
    targetProfile: "desktop-balanced",
    runtime: {
      adapter: "web-three",
      target: "web",
    },
    budgets: {
      activeLodBands: 4,
      drawCalls: 240,
      drawGroups: 120,
      entityCount: 2400,
      frameTimeMsP95: 16.7,
      frameTimeMsP99: 33.4,
      loadedTextureBytes: 96_000_000,
      textureVariantBytes: 96_000_000,
      visibleInstances: 1400,
    },
    metrics: {
      activeLodBands: { status: "measured", value: ["near", "mid", "far"] },
      drawCalls: { status: "measured", value: 180 },
      drawGroups: { status: "measured", value: 64 },
      entityCount: { status: "measured", value: 1800 },
      frameTimeMs: {
        status: "measured",
        value: {
          p50: 8.4,
          p95: 14.8,
          p99: 22.1,
          sampleCount: 600,
        },
      },
      loadedTextureBytes: { status: "measured", value: 72_000_000 },
      textureVariants: {
        status: "measured",
        value: {
          loadedBytes: 72_000_000,
          selectedVariantCount: 18,
        },
      },
      visibleInstances: { status: "measured", value: 980 },
    },
    ...overrides,
  };
}

test("should accept complete performance proof sidecar", () => {
  const diagnostics = validatePerformanceProofSidecar(completeProof(), { path: "artifacts/performance-proof.json" });

  assert.deepEqual(diagnostics, []);
  assert.equal(isPerformanceProofSidecarPassing(completeProof()), true);
});

test("should reject over-budget frame percentile", () => {
  const proof = completeProof({
    metrics: {
      ...completeProof().metrics,
      frameTimeMs: {
        status: "measured",
        value: {
          p50: 12.4,
          p95: 18.2,
          p99: 40.1,
          sampleCount: 600,
        },
      },
    },
  });

  const diagnostics = validatePerformanceProofSidecar(proof, { path: "artifacts/performance-proof.json" });

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_PERFORMANCE_PROOF_BUDGET_EXCEEDED" && diagnostic.message.includes("frame time p95")), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_PERFORMANCE_PROOF_STATUS_MISMATCH"), true);
  assert.equal(isPerformanceProofSidecarPassing(proof), false);
});

test("should accept stable unsupported diagnostics for non-promoted counters", () => {
  const proof = completeProof({
    runtime: {
      adapter: "bevy",
      target: "native",
    },
    metrics: {
      ...completeProof().metrics,
      drawGroups: {
        status: "unsupported",
        diagnostic: {
          code: "TN_PERFORMANCE_DRAW_GROUPS_UNSUPPORTED",
          message: "Native draw-group counting is not promoted for this adapter.",
          severity: "warning",
        },
      },
    },
  });

  assert.deepEqual(validatePerformanceProofSidecar(proof), []);
});

test("should not treat stale fail status as passing", () => {
  const proof = completeProof({ status: "fail" });
  const diagnostics = validatePerformanceProofSidecar(proof);

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_PERFORMANCE_PROOF_STATUS_STALE"), true);
  assert.equal(isPerformanceProofSidecarPassing(proof), false);
});
