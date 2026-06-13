import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle, observeAtmosphereProfile } from "@threenative/runtime-web-three";

export interface IV3AtmosphereReport {
  artifacts: {
    reportPath: string;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  observation: ReturnType<typeof observeAtmosphereProfile>;
  status: "fail" | "pass";
}

export async function verifyV3Atmosphere(options: { artifactDir: string; bundlePath: string }): Promise<IV3AtmosphereReport> {
  const bundle = await loadBundle(options.bundlePath);
  const observation = observeAtmosphereProfile(bundle.environmentScene?.atmosphere);
  const diagnostics: IV3AtmosphereReport["diagnostics"] = [...observation.diagnostics];
  if (observation.profileId === undefined) {
    diagnostics.push({ code: "TN_V3_ATMOSPHERE_MISSING", message: "V3 atmosphere verification requires an active atmosphere profile.", severity: "error" });
  }
  if (observation.fogMode === undefined) {
    diagnostics.push({ code: "TN_V3_ATMOSPHERE_FOG_MISSING", message: "V3 atmosphere verification requires enabled fog or haze.", severity: "error" });
  }
  if (observation.shadowMapSize === undefined) {
    diagnostics.push({ code: "TN_V3_ATMOSPHERE_SHADOWS_MISSING", message: "V3 atmosphere verification requires a shadow policy.", severity: "error" });
  }
  const reportPath = resolve(options.artifactDir, "v3-atmosphere-report.json");
  const report: IV3AtmosphereReport = {
    artifacts: { reportPath },
    diagnostics,
    observation,
    status: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "fail" : "pass",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
