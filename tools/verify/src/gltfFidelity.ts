import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface GltfFidelityVerificationResult {
  diagnostics: GltfFidelityDiagnostic[];
  ok: boolean;
  reportPath?: string;
}

export interface GltfFidelityConformanceReport {
  gltfFidelity?: {
    assets: Array<{
      assetId: string;
      customAttributes: unknown[];
      materials: unknown[];
      morphTargets: unknown[];
    }>;
  };
}

export interface GltfFidelityDiagnostic {
  code: string;
  message: string;
  path: string;
  severity: "error";
}

export function analyzeGltfFidelityReports(web: GltfFidelityConformanceReport, bevy: GltfFidelityConformanceReport): GltfFidelityDiagnostic[] {
  const diagnostics: GltfFidelityDiagnostic[] = [];
  const webAssets = indexedAssets(web);
  const bevyAssets = indexedAssets(bevy);
  for (const assetId of [...new Set([...webAssets.keys(), ...bevyAssets.keys()])].sort((left, right) => left.localeCompare(right))) {
    const webAsset = webAssets.get(assetId);
    const bevyAsset = bevyAssets.get(assetId);
    if (webAsset === undefined || bevyAsset === undefined) {
      diagnostics.push({
        code: "TN_GLTF_FIDELITY_ASSET_DRIFT",
        message: `glTF fidelity asset '${assetId}' is present in ${webAsset === undefined ? "Bevy" : "web"} report only.`,
        path: `gltfFidelity/assets/${assetId}`,
        severity: "error",
      });
      continue;
    }
    compareJson(webAsset.materials, bevyAsset.materials, `gltfFidelity/assets/${assetId}/materials`, diagnostics);
    compareJson(webAsset.morphTargets, bevyAsset.morphTargets, `gltfFidelity/assets/${assetId}/morphTargets`, diagnostics);
    compareJson(webAsset.customAttributes, bevyAsset.customAttributes, `gltfFidelity/assets/${assetId}/customAttributes`, diagnostics);
  }
  return diagnostics;
}

export async function verifyGltfFidelityReports(
  web: GltfFidelityConformanceReport,
  bevy: GltfFidelityConformanceReport,
  options: { reportPath?: string } = {},
): Promise<GltfFidelityVerificationResult> {
  const diagnostics = analyzeGltfFidelityReports(web, bevy);
  const reportPath = options.reportPath ?? resolve("tools/verify/artifacts/gltf-fidelity/verification-report.json");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({ bevy: bevy.gltfFidelity, diagnostics, ok: diagnostics.length === 0, schema: "threenative.verify.gltf-fidelity", version: "0.1.0", web: web.gltfFidelity }, null, 2)}\n`);
  return { diagnostics, ok: diagnostics.length === 0, reportPath };
}

function indexedAssets(report: GltfFidelityConformanceReport): Map<string, NonNullable<GltfFidelityConformanceReport["gltfFidelity"]>["assets"][number]> {
  return new Map((report.gltfFidelity?.assets ?? []).map((asset) => [asset.assetId, asset]));
}

function compareJson(left: unknown, right: unknown, path: string, diagnostics: GltfFidelityDiagnostic[]): void {
  const leftJson = stableJson(left);
  const rightJson = stableJson(right);
  if (leftJson === rightJson) {
    return;
  }
  diagnostics.push({
    code: "TN_GLTF_FIDELITY_METADATA_DRIFT",
    message: `glTF fidelity metadata differs at ${path}.`,
    path,
    severity: "error",
  });
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortJson(item)]));
  }
  return value;
}
