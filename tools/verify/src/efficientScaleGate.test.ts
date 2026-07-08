import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { runEfficientScaleGate } from "./efficientScaleGate.js";
import type { CommandOptions, CommandResult } from "./runner.js";

test("efficient scale gate accepts dense performance proof sidecar", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-efficient-scale-"));
  try {
    const result = await runEfficientScaleGate({
      root,
      run: fakeRun(root, denseProof({ entityCount: 220, visibleInstances: 180 })),
    });
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as { ok: boolean; thresholds: { minEntityCount: number; minVisibleInstances: number } };

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(report.ok, true);
    assert.equal(report.thresholds.minEntityCount, 180);
    assert.equal(report.thresholds.minVisibleInstances, 120);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("efficient scale gate rejects low-density proof sidecar", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-efficient-scale-low-density-"));
  try {
    const result = await runEfficientScaleGate({
      root,
      run: fakeRun(root, denseProof({ entityCount: 20, visibleInstances: 10 })),
    });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_EFFICIENT_SCALE_ENTITY_DENSITY_LOW"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_EFFICIENT_SCALE_VISIBLE_DENSITY_LOW"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function fakeRun(root: string, proof: Record<string, unknown>): (options: CommandOptions) => Promise<CommandResult> {
  return async (options) => {
    if (options.name === "performance proof dense-world benchmark") {
      const proofPath = resolve(root, "examples/dense-world-benchmark/artifacts/efficient-scale/performance-proof.json");
      await mkdir(resolve(proofPath, ".."), { recursive: true });
      await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
    }
    return {
      durationMs: 1,
      exitCode: 0,
      stderr: "",
      stdout: "{}\n",
    };
  };
}

function denseProof(options: { entityCount: number; visibleInstances: number }): Record<string, unknown> {
  return {
    schema: "threenative.performance-proof",
    version: "0.1.0",
    status: "pass",
    generatedBy: "test",
    targetProfile: "dense-world",
    runtime: {
      adapter: "web-three",
      target: "web",
    },
    budgets: {
      activeLodBands: 8,
      drawCalls: 300,
      drawGroups: 120,
      entityCount: 5000,
      frameTimeMsP95: 24,
      frameTimeMsP99: 33.4,
      loadedTextureBytes: 134217728,
      textureVariantBytes: 134217728,
      visibleInstances: 2000,
    },
    metrics: {
      activeLodBands: { status: "measured", value: ["default"] },
      drawCalls: { status: "measured", value: 180 },
      drawGroups: { status: "measured", value: 16 },
      entityCount: { status: "measured", value: options.entityCount },
      frameTimeMs: { status: "measured", value: { p50: 10, p95: 16, p99: 20, sampleCount: 90 } },
      loadedTextureBytes: { status: "measured", value: 0 },
      textureVariants: { status: "measured", value: { loadedBytes: 0, selectedVariantCount: 0 } },
      visibleInstances: { status: "measured", value: options.visibleInstances },
    },
  };
}
