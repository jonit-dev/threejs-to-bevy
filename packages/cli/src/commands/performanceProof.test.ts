import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadBundle } from "@threenative/runtime-web-three";

import { performanceProofCommand } from "./performanceProof.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const structuredSourceStarterPath = resolve(repoRoot, "templates/structured-source-starter");

test("performance proof writes versioned web runtime sidecar", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-performance-proof-"));
  try {
    await cp(structuredSourceStarterPath, root, { recursive: true });
    const result = await performanceProofCommand(["proof", "--project", root, "--frames", "3", "--out", "artifacts/performance-proof.json", "--json"], process.cwd(), {
      collector: async ({ bundlePath }) => ({
        bundle: await loadBundle(bundlePath),
        runtime: {
          frameSamplesMs: [10, 12, 14],
          renderer: {
            drawCalls: 1,
            geometries: 1,
            programs: 1,
            textures: 0,
            triangles: 12,
          },
          runtimeDiagnostics: {
            scene: {
              entityCount: 3,
              visibleMeshCount: 2,
            },
          },
        },
        textureBytes: 0,
        textureVariantCount: 0,
      }),
    });
    const payload = JSON.parse(result.stdout) as { artifactPath: string; code: string; report: { metrics: { entityCount: { value: number }; frameTimeMs: { value: { p95: number; sampleCount: number } } }; schema: string; status: string } };
    const report = JSON.parse(await readFile(join(root, "artifacts/performance-proof.json"), "utf8")) as typeof payload.report;

    assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(payload.code, "TN_PERFORMANCE_PROOF_OK");
    assert.equal(payload.artifactPath, join(root, "artifacts/performance-proof.json"));
    assert.equal(report.schema, "threenative.performance-proof");
    assert.equal(report.status, "pass");
    assert.equal(report.metrics.frameTimeMs.value.p95, 14);
    assert.equal(report.metrics.frameTimeMs.value.sampleCount, 3);
    assert.equal(report.metrics.entityCount.value, 3);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("performance proof fails when measured frame time exceeds budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-performance-proof-budget-"));
  try {
    await cp(structuredSourceStarterPath, root, { recursive: true });
    const result = await performanceProofCommand(["proof", "--project", root, "--frames", "3", "--json"], process.cwd(), {
      collector: async ({ bundlePath }) => ({
        bundle: await loadBundle(bundlePath),
        runtime: {
          frameSamplesMs: [50, 55, 60],
          renderer: {
            drawCalls: 1,
            geometries: 1,
            programs: 1,
            textures: 0,
            triangles: 12,
          },
          runtimeDiagnostics: {
            scene: {
              entityCount: 3,
              visibleMeshCount: 2,
            },
          },
        },
        textureBytes: 0,
        textureVariantCount: 0,
      }),
    });
    const payload = JSON.parse(result.stdout) as { code: string; diagnostics: Array<{ code: string; message: string }>; report: { status: string } };

    assert.equal(result.exitCode, 1);
    assert.equal(payload.code, "TN_PERFORMANCE_PROOF_FAILED");
    assert.equal(payload.report.status, "fail");
    assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_PERFORMANCE_PROOF_BUDGET_EXCEEDED" && diagnostic.message.includes("frame time p95")), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
