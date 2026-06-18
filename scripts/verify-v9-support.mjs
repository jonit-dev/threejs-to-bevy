import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

import { verifyV9AudioSupport } from "./verify-v9-audio-support.mjs";
import { verifyV9DiagnosticsSupport } from "./verify-v9-diagnostics-support.mjs";
import { verifyV9EditorSupport } from "./verify-v9-editor-support.mjs";
import { verifyV9LocalDataSupport } from "./verify-v9-local-data-support.mjs";
import { verifyV9StressSupport } from "./verify-v9-stress-support.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV9Support(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const targets = resolveArtifactTargets({ gate: "support", owner: { kind: "aggregate", name: "support" }, root });

  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const steps = options.steps ?? [
    () => verifyV9AudioSupport({ repoRoot: root }),
    () => verifyV9LocalDataSupport({ repoRoot: root }),
    () => verifyV9DiagnosticsSupport({ repoRoot: root }),
    () => verifyV9EditorSupport({ repoRoot: root }),
    () => verifyV9StressSupport({ repoRoot: root }),
    () => runConformance(root),
  ];
  const results = [];
  for (const step of steps) {
    results.push(await step());
  }
  const ok = results.every((result) => result.ok !== false && result.status !== "fail");
  const phases = results.map((result) => ({
    artifactDir: result.artifacts?.artifactDir,
    code: result.code,
    diagnostics: result.diagnostics ?? [],
    reportPath: result.reportPath,
    status: result.status,
  }));
  const report = {
    artifacts: {
      reportPath,
      phases: Object.fromEntries(phases.filter((phase) => phase.code !== undefined).map((phase) => [phase.code, phase.reportPath])),
    },
    code: ok ? "TN_VERIFY_V9_SUPPORT_OK" : "TN_VERIFY_V9_SUPPORT_FAILED",
    diagnostics: phases.flatMap((phase) => phase.diagnostics),
    phases,
    status: ok ? "pass" : "fail",
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

function runConformance(root) {
  const result = spawnSync("pnpm", ["verify:conformance"], { cwd: root, encoding: "utf8" });
  return { code: "TN_VERIFY_CONFORMANCE", ok: result.status === 0, status: result.status === 0 ? "pass" : "fail" };
}

async function main() {
  const result = await verifyV9Support();
  process.stdout.write(result.ok ? `V9 support aggregate gate passed. Report: ${result.reportPath}\n` : `V9 support aggregate gate failed. Report: ${result.reportPath}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
