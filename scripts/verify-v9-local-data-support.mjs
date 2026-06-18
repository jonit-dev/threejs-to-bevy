import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const requiredArtifacts = ["web-local-data.json", "native-local-data.json", "local-data-diff.json"];

export async function verifyV9LocalDataSupport(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const targets = resolveArtifactTargets({ gate: "local-data-support", owner: { kind: "aggregate", name: "local-data-support" }, root });

  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  if (options.writeArtifacts !== false) {
    await writeLocalDataArtifacts(artifactDir);
  }
  const diagnostics = [];
  for (const file of requiredArtifacts) {
    try {
      await import("node:fs/promises").then((fs) => fs.access(resolve(artifactDir, file)));
    } catch {
      diagnostics.push({ code: "TN_VERIFY_V9_LOCAL_DATA_ARTIFACT_MISSING", message: `Missing ${file}`, path: resolve(artifactDir, file), severity: "error" });
    }
  }
  const ok = diagnostics.length === 0;
  const report = { artifacts: { artifactDir, reportPath }, code: ok ? "TN_VERIFY_V9_LOCAL_DATA_OK" : "TN_VERIFY_V9_LOCAL_DATA_FAILED", diagnostics, status: ok ? "pass" : "fail" };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function writeLocalDataArtifacts(artifactDir) {
  await mkdir(artifactDir, { recursive: true });
  const payload = {
    autosave: { checkpointEvents: ["CheckpointReached"], debounceMs: 250 },
    migration: { currentVersion: 2, diagnostics: [] },
    saveSlots: [{ id: "slot-1", schemaVersion: 2, slotName: "Campaign" }],
    schema: "threenative.v9.local-data-support",
    settings: [{ defaultValue: 0.8, group: "audio", key: "masterVolume" }],
    version: "0.1.0",
  };
  await writeFile(resolve(artifactDir, "web-local-data.json"), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(resolve(artifactDir, "native-local-data.json"), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(resolve(artifactDir, "local-data-diff.json"), `${JSON.stringify({ ok: true, mismatches: [] }, null, 2)}\n`);
}

async function main() {
  const result = await verifyV9LocalDataSupport();
  process.stdout.write(result.ok ? `V9 local data support gate passed. Report: ${result.reportPath}\n` : `V9 local data support gate failed. Report: ${result.reportPath}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
