import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collectPerformanceSummary, createEnvironmentRuntime, loadBundle } from "@threenative/runtime-web-three";

import { evaluatePerformanceGate } from "./performanceGate.js";

type V3RendererEvidence = {
  instancingSource: "model-asset-backed-plan" | "placeholder-runtime-plan";
  metricsSource: "synthetic-estimate";
  modelAssetBackedGroups: number;
  placeholderGroups: number;
  sourceAssetCount: number;
  instanceCount: number;
  groupCount: number;
  drawEstimate: number;
  triangleEstimate: number;
  textureEstimate: number;
  textureBytes: number;
  bundleBytes: number;
  note: string;
};

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
  rendererEvidence?: V3RendererEvidence;
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
  const rendererEvidence = collectRendererEvidence(bundle, instancingPlan);
  const rawSamples = { frameMs: [11, 12, 13, 14, 16, 18], loadMs: 75 };
  const textureBytes = await sumTextureBytes(options.bundlePath, bundle.assets.assets);
  const bundleBytes = await sumBundleBytes(options.bundlePath);
  const renderCalls = Math.max(1, instancingPlan.groups.length + instancingPlan.uninstanced.length);
  const renderTriangles = (bundle.environmentScene?.instances.length ?? 0) * 64;
  const metrics = collectPerformanceSummary({
    bundleBytes,
    environmentInstanceCount: bundle.environmentScene?.instances.length ?? 0,
    frameSamples: rawSamples.frameMs,
    instancingPlan,
    loadMs: rawSamples.loadMs,
    rendererInfo: {
      memory: { geometries: Math.max(1, instancingPlan.groups.length), textures: bundle.assets.assets.filter((asset) => asset.kind === "texture").length },
      programs: [{}],
      render: { calls: renderCalls, triangles: renderTriangles },
    },
    sourceAssetCount: bundle.environmentScene?.sourceAssets.length ?? 0,
    textureBytes,
  });
  rendererEvidence.bundleBytes = bundleBytes;
  rendererEvidence.drawEstimate = renderCalls;
  rendererEvidence.instanceCount = bundle.environmentScene?.instances.length ?? 0;
  rendererEvidence.groupCount = instancingPlan.groups.length;
  rendererEvidence.sourceAssetCount = bundle.environmentScene?.sourceAssets.length ?? 0;
  rendererEvidence.textureBytes = textureBytes;
  rendererEvidence.textureEstimate = bundle.assets.assets.filter((asset) => asset.kind === "texture").length;
  rendererEvidence.triangleEstimate = renderTriangles;
  const metricsPath = resolve(options.artifactDir, "v3-performance-summary.json");
  const rawSamplesPath = resolve(options.artifactDir, "v3-performance-samples.json");
  const reportPath = resolve(options.artifactDir, "v3-environment-report.json");
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
  await writeFile(rawSamplesPath, `${JSON.stringify(rawSamples, null, 2)}\n`);
  const gate = evaluatePerformanceGate({ artifactPath: metricsPath, metrics, targetProfile: bundle.targetProfile });
  const diagnostics = [
    ...instancingPlan.diagnostics.map((diagnostic) => ({ code: diagnostic.code, likelyArea: "runtime-web", message: diagnostic.message, severity: diagnostic.severity })),
    {
      code: "TN_V3_ENVIRONMENT_SYNTHETIC_RENDERER_METRICS",
      likelyArea: "verify",
      message: "V3 environment verifier uses synthetic frame/renderer samples; use browser capture artifacts for real renderer timings and draw statistics.",
      severity: "warning",
    },
    ...(rendererEvidence.placeholderGroups > 0
      ? [
          {
            code: "TN_V3_ENVIRONMENT_PLACEHOLDER_INSTANCING_EVIDENCE",
            likelyArea: "runtime-web",
            message: `${rendererEvidence.placeholderGroups} instancing group(s) are backed only by the placeholder runtime plan because their source assets do not resolve to model files in assets.manifest.json.`,
            severity: "warning",
          },
        ]
      : []),
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
    rendererEvidence,
    status: gate.status,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function collectRendererEvidence(
  bundle: Awaited<ReturnType<typeof loadBundle>>,
  instancingPlan: NonNullable<ReturnType<typeof createEnvironmentRuntime>>["instancingPlan"],
): V3RendererEvidence {
  const sourceAssets = new Map((bundle.environmentScene?.sourceAssets ?? []).map((asset) => [asset.id, asset]));
  const assets = new Map(bundle.assets.assets.map((asset) => [asset.id, asset]));
  const modelAssetBackedGroups = instancingPlan.groups.filter((group) => {
    const sourceAsset = sourceAssets.get(group.sourceAsset);
    const asset = sourceAsset === undefined ? undefined : assets.get(sourceAsset.asset);
    return asset?.kind === "model" && asset.path !== undefined;
  }).length;
  const placeholderGroups = instancingPlan.groups.length - modelAssetBackedGroups;
  return {
    instancingSource: placeholderGroups === 0 && instancingPlan.groups.length > 0 ? "model-asset-backed-plan" : "placeholder-runtime-plan",
    metricsSource: "synthetic-estimate",
    modelAssetBackedGroups,
    placeholderGroups,
    sourceAssetCount: 0,
    instanceCount: 0,
    groupCount: 0,
    drawEstimate: 0,
    triangleEstimate: 0,
    textureEstimate: 0,
    textureBytes: 0,
    bundleBytes: 0,
    note: "createEnvironmentRuntime uses placeholder geometry for synchronous verification; loadEnvironmentAssetInstances performs real glTF mesh instancing when model assets are present.",
  };
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

async function sumBundleBytes(bundlePath: string): Promise<number> {
  let total = 0;
  async function visit(path: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) {
        await visit(child);
      } else if (entry.isFile()) {
        total += (await stat(child)).size;
      }
    }
  }
  await visit(bundlePath);
  return total;
}
