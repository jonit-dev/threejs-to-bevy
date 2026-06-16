import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { compareConformanceReports, runCommand } from "./verify-conformance.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV8UiDisabled(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const bundlePath = options.bundlePath ?? resolve(root, "packages/ir/fixtures/conformance/v8-retained-ui-disabled/game.bundle");
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/conformance/v8-retained-ui-disabled");
  const webReportPath = options.webReportPath ?? resolve(artifactDir, "web.report.json");
  const bevyReportPath = options.bevyReportPath ?? resolve(artifactDir, "bevy.report.json");
  const comparisonReportPath = options.comparisonReportPath ?? resolve(artifactDir, "comparison.report.json");
  const run = options.run ?? runCommand;

  await mkdir(artifactDir, { recursive: true });

  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href);
  const conformance = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/conformance.js")).href);
  const bundle = await runtime.loadBundle(bundlePath);
  const webReport = conformance.reportWebConformance(bundle, runtime.mapWorld(bundle), "v8-retained-ui-disabled");
  await writeFile(webReportPath, `${JSON.stringify(webReport, null, 2)}\n`);

  const bevy = await run({
    args: [
      "run",
      "-p",
      "threenative_runtime",
      "--bin",
      "threenative_conformance",
      "--",
      bundlePath,
      "v8-retained-ui-disabled",
      bevyReportPath,
    ],
    command: "cargo",
    cwd: resolve(root, "runtime-bevy"),
    name: "bevy V8 disabled UI observation report",
    timeoutMs: 120000,
  });

  if (bevy.exitCode !== 0) {
    const report = {
      artifacts: { bevyReportPath, comparisonReportPath, webReportPath },
      diagnostics: [
        {
          actual: bevy.exitCode,
          code: "TN_V8_UI_DISABLED_BEVY_REPORT_FAILED",
          expected: 0,
          message: "Bevy disabled UI conformance report failed.",
          path: "steps.bevy",
          severity: "error",
        },
      ],
      status: "fail",
    };
    await writeFile(comparisonReportPath, `${JSON.stringify(report, null, 2)}\n`);
    return { ...report, ok: false };
  }

  const bevyReport = JSON.parse(await readFile(bevyReportPath, "utf8"));
  const comparison = compareConformanceReports(comparableUiReport(webReport), comparableUiReport(bevyReport), {
    artifactPaths: {
      bevyReport: bevyReportPath,
      comparisonReport: comparisonReportPath,
      webReport: webReportPath,
    },
    bundlePath,
    requiredPaths: ["$.ui"],
  });
  const comparisonReport = {
    ...comparison,
    artifacts: { bevyReportPath, comparisonReportPath, webReportPath },
    status: comparison.ok ? "pass" : "fail",
  };
  await writeFile(comparisonReportPath, `${JSON.stringify(comparisonReport, null, 2)}\n`);
  return {
    artifacts: { bevyReportPath, comparisonReportPath, webReportPath },
    diagnostics: comparison.diagnostics,
    ok: comparison.ok,
    status: comparison.ok ? "pass" : "fail",
  };
}

function comparableUiReport(report) {
  return {
    assets: [],
    diagnostics: report.diagnostics ?? [],
    entities: [],
    events: [],
    fixture: report.fixture,
    materials: [],
    resources: [],
    runtime: report.runtime,
    ui: report.ui,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await verifyV8UiDisabled();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
