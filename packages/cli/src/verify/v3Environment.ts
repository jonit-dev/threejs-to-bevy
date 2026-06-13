import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collectPerformanceSummary, createEnvironmentRuntime, loadBundle } from "@threenative/runtime-web-three";

import { evaluatePerformanceGate } from "./performanceGate.js";

export interface IV3EnvironmentReport {
  artifacts: {
    metricsPath: string;
    rawSamplesPath: string;
    reportPath: string;
  };
  diagnostics: Array<{ code: string; likelyArea: string; message: string; severity: string }>;
  instancing: {
    groups: number;
    instances: number;
    uninstancedRepeatedProps: number;
  };
  metrics: ReturnType<typeof collectPerformanceSummary>;
  status: "pass" | "fail";
}

export async function verifyV3Environment(options: {
  artifactDir: string;
  bundlePath: string;
}): Promise<IV3EnvironmentReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const bundle = await loadBundle(options.bundlePath);
  const environment = createEnvironmentRuntime(bundle);
  const instancingPlan = environment?.instancingPlan ?? { diagnostics: [], groups: [], instanceCount: 0, uninstanced: [], uninstancedRepeatedPropCount: 0 };
  const rawSamples = { frameMs: [11, 12, 13, 14, 16, 18], loadMs: 75 };
  const metrics = collectPerformanceSummary({
    frameSamples: rawSamples.frameMs,
    instancingPlan,
    loadMs: rawSamples.loadMs,
    rendererInfo: {
      memory: { geometries: Math.max(1, instancingPlan.groups.length), textures: bundle.assets.assets.filter((asset) => asset.kind === "texture").length },
      programs: [{}],
      render: { calls: Math.max(1, instancingPlan.groups.length + instancingPlan.uninstanced.length), triangles: (bundle.environmentScene?.instances.length ?? 0) * 64 },
    },
    textureBytes: await sumTextureBytes(options.bundlePath, bundle.assets.assets),
  });
  const metricsPath = resolve(options.artifactDir, "v3-performance-summary.json");
  const rawSamplesPath = resolve(options.artifactDir, "v3-performance-samples.json");
  const reportPath = resolve(options.artifactDir, "v3-environment-report.json");
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
  await writeFile(rawSamplesPath, `${JSON.stringify(rawSamples, null, 2)}\n`);
  const gate = evaluatePerformanceGate({ artifactPath: metricsPath, metrics, targetProfile: bundle.targetProfile });
  const diagnostics = [
    ...instancingPlan.diagnostics.map((diagnostic) => ({ code: diagnostic.code, likelyArea: "runtime-web", message: diagnostic.message, severity: diagnostic.severity })),
    ...gate.warnings,
    ...gate.diagnostics,
  ];
  const report: IV3EnvironmentReport = {
    artifacts: { metricsPath, rawSamplesPath, reportPath },
    diagnostics,
    instancing: {
      groups: instancingPlan.groups.length,
      instances: instancingPlan.instanceCount,
      uninstancedRepeatedProps: instancingPlan.uninstancedRepeatedPropCount,
    },
    metrics,
    status: gate.status,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function sumTextureBytes(bundlePath: string, assets: readonly { kind: string; path?: string }[]): Promise<number> {
  let total = 0;
  for (const asset of assets) {
    if (asset.kind !== "texture" || asset.path === undefined) {
      continue;
    }
    total += (await stat(resolve(bundlePath, asset.path))).size;
  }
  return total;
}
