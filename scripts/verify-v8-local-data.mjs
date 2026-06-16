import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compareConformanceReports, runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV8LocalData(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v8-local-data");
  const bundlePath = resolve(root, "packages/ir/fixtures/conformance/v8-local-data/game.bundle");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const webReportPath = options.webReportPath ?? resolve(artifactDir, "web.report.json");
  const bevyReportPath = options.bevyReportPath ?? resolve(artifactDir, "bevy.report.json");
  const comparisonReportPath = options.comparisonReportPath ?? resolve(artifactDir, "comparison.report.json");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  for (const [name, filter] of [
    ["build ir", "@threenative/ir"],
    ["build ui", "@threenative/ui"],
    ["build sdk", "@threenative/sdk"],
    ["build r3f", "@threenative/r3f"],
    ["build compiler", "@threenative/compiler"],
    ["build web runtime", "@threenative/runtime-web-three"],
  ]) {
    if (!(await step(name, "pnpm", ["--filter", filter, "build"], { timeoutMs: 120000 }))) {
      return writeReport({ artifactDir, bevyReportPath, bundlePath, checks: {}, comparisonReportPath, ok: false, reportPath, steps, webReportPath });
    }
  }

  for (const [name, command, args, cwd] of [
    ["test ir local data validation", "pnpm", ["--filter", "@threenative/ir", "test", "--", "--run", "local data"], root],
    ["test web local data conformance", "pnpm", ["--filter", "@threenative/runtime-web-three", "test", "--", "--run", "local data"], root],
    ["test native local data loader", "cargo", ["test", "-p", "threenative_loader", "local_data", "--quiet"], resolve(root, "runtime-bevy")],
    ["test bevy local data conformance", "cargo", ["test", "-p", "threenative_runtime", "local_data", "--quiet"], resolve(root, "runtime-bevy")],
  ]) {
    if (!(await step(name, command, args, { cwd, timeoutMs: 120000 }))) {
      return writeReport({ artifactDir, bevyReportPath, bundlePath, checks: {}, comparisonReportPath, ok: false, reportPath, steps, webReportPath });
    }
  }

  await mkdir(artifactDir, { recursive: true });
  const { loadBundle } = await import("../packages/runtime-web-three/dist/loadBundle.js");
  const { mapWorld } = await import("../packages/runtime-web-three/dist/mapWorld.js");
  const { reportWebConformance } = await import("../packages/runtime-web-three/dist/conformance.js");
  const bundle = await loadBundle(bundlePath);
  const webReport = reportWebConformance(bundle, mapWorld(bundle), "v8-local-data");
  await writeFile(webReportPath, `${JSON.stringify(webReport, null, 2)}\n`);

  if (!(await step("write bevy local data conformance report", "cargo", [
    "run",
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_conformance",
    "--",
    bundlePath,
    "v8-local-data",
    bevyReportPath,
  ], { cwd: resolve(root, "runtime-bevy"), timeoutMs: 120000 }))) {
    return writeReport({ artifactDir, bevyReportPath, bundlePath, checks: {}, comparisonReportPath, ok: false, reportPath, steps, webReportPath });
  }

  const bevyReport = JSON.parse(await readFile(bevyReportPath, "utf8"));
  const comparison = compareConformanceReports(localDataOnlyReport(webReport), localDataOnlyReport(bevyReport), {
    artifactPaths: {
      bevyReport: bevyReportPath,
      comparisonReport: comparisonReportPath,
      webReport: webReportPath,
    },
    bundlePath,
    requiredPaths: [{ expected: "local data observation", path: "$.localData" }],
  });
  await writeFile(comparisonReportPath, `${JSON.stringify(comparison, null, 2)}\n`);

  const checks = {
    localData: {
      checkpoints: webReport.localData?.checkpoints.length ?? 0,
      migrations: webReport.localData?.migrations.length ?? 0,
      saveSlots: webReport.localData?.saveSlots.length ?? 0,
      settings: webReport.localData?.settings.length ?? 0,
      storage: webReport.localData?.storage,
      ok:
        webReport.localData?.storage === "local-only"
        && webReport.localData.saveSlots.length === 1
        && webReport.localData.settings.length === 4
        && webReport.localData.migrations.length === 1
        && webReport.localData.checkpoints.length === 1,
    },
    parity: {
      diagnostics: comparison.diagnostics.length,
      ok: comparison.ok,
    },
  };
  const ok = Object.values(checks).every((check) => check.ok);
  return writeReport({ artifactDir, bevyReportPath, bundlePath, checks, comparisonReportPath, ok, reportPath, steps, webReportPath });
}

function localDataOnlyReport(report) {
  return {
    assets: [],
    diagnostics: [],
    entities: [],
    events: [],
    fixture: report.fixture,
    localData: report.localData,
    materials: [],
    resources: [],
    runtime: report.runtime,
  };
}

async function writeReport({ artifactDir, bevyReportPath, bundlePath, checks, comparisonReportPath, ok, reportPath, steps, webReportPath }) {
  await mkdir(artifactDir, { recursive: true });
  const report = {
    artifacts: {
      bevyReportPath,
      bundlePath,
      comparisonReportPath,
      reportPath,
      webReportPath,
    },
    checks,
    code: ok ? "TN_V8_LOCAL_DATA_OK" : "TN_V8_LOCAL_DATA_FAILED",
    ok,
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV8LocalData();
  if (json) {
    process.stdout.write(`${JSON.stringify({ artifacts: result.artifacts, code: result.code, status: result.ok ? "pass" : "fail" }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V8 local-data verification passed. Report: ${result.artifacts.reportPath}\n`);
  } else {
    process.stderr.write(`V8 local-data verification failed. Report: ${result.artifacts.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
