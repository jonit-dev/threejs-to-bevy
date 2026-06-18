import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { compareConformanceReports } from "./verify-conformance.mjs";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifySceneLifecycle(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const bundlePath = options.bundlePath ?? resolve(root, "packages/ir/fixtures/conformance/scene-lifecycle/game.bundle");
  const targets = resolveArtifactTargets({ gate: "scene-lifecycle", owner: { kind: "package", packagePath: "packages/ir" }, root });
  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const webTracePath = options.webTracePath ?? resolve(artifactDir, "web-scene-lifecycle.json");
  const nativeTracePath = options.nativeTracePath ?? resolve(artifactDir, "native-scene-lifecycle.json");
  const diffPath = options.diffPath ?? resolve(artifactDir, "scene-lifecycle-diff.json");
  await mkdir(artifactDir, { recursive: true });

  const webReport = options.webReport ?? await runWebReport(root, bundlePath);
  await writeFile(webTracePath, `${JSON.stringify(webReport.sceneLifecycle, null, 2)}\n`);
  await runNativeReport(root, bundlePath, nativeTracePath, options.runNativeReport);
  const nativeLifecycle = JSON.parse(await readFile(nativeTracePath, "utf8"));
  const nativeReport = {
    ...webReport,
    runtime: "bevy",
    sceneLifecycle: nativeLifecycle.sceneLifecycle ?? nativeLifecycle,
  };
  await writeFile(nativeTracePath, `${JSON.stringify(nativeReport.sceneLifecycle, null, 2)}\n`);

  const comparison = compareConformanceReports(webReport, nativeReport, {
    artifactPaths: {
      comparisonReport: diffPath,
      leftReport: webTracePath,
      rightReport: nativeTracePath,
    },
    bundlePath,
    requiredPaths: [{ expected: "scene lifecycle trace", path: "$.sceneLifecycle" }],
  });
  await writeFile(diffPath, `${JSON.stringify({ comparison, nativeTracePath, webTracePath }, null, 2)}\n`);

  return {
    artifacts: { diffPath, nativeTracePath, webTracePath },
    comparison,
    ok: comparison.ok,
  };
}

async function runWebReport(root, bundlePath) {
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href);
  const bundle = await runtime.loadBundle(bundlePath);
  const mapped = runtime.mapWorld(bundle);
  return runtime.reportWebConformance(bundle, mapped, "scene-lifecycle");
}

async function runNativeReport(root, bundlePath, nativeTracePath, runner) {
  if (runner !== undefined) {
    await runner({ bundlePath, nativeTracePath, root });
    return;
  }
  const reportPath = `${nativeTracePath}.report.json`;
  await execFileAsync(
    "cargo",
    [
      "run",
      "--quiet",
      "-p",
      "threenative_runtime",
      "--bin",
      "threenative_conformance",
      "--",
      resolve(bundlePath),
      "scene-lifecycle",
      reportPath,
    ],
    { cwd: resolve(root, "runtime-bevy") },
  );
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  await writeFile(nativeTracePath, `${JSON.stringify(report.sceneLifecycle, null, 2)}\n`);
}

async function main() {
  const result = await verifySceneLifecycle({
    artifactDir: process.argv[3],
    bundlePath: process.argv[2],
  });
  if (result.ok) {
    process.stdout.write(`Scene lifecycle trace parity passed. Diff: ${result.artifacts.diffPath}\n`);
  } else {
    process.stderr.write(`${result.comparison.diagnostics[0]?.message ?? "Scene lifecycle trace parity failed."}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
