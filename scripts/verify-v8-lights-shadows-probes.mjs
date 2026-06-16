import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV8LightsShadowsProbes(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v8/lights-shadows");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const projectPath = resolve(root, "examples/v3-environment");
  const bundlePath = resolve(projectPath, "dist/forest.bundle");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir, bundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("build v3 environment shadow fixture", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "build", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir, bundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("validate v3 environment shadow fixture", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir, bundlePath, ok: false, reportPath, steps });
  }

  const verifyScene =
    options.sceneVerifier ??
    (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/v3Scene.js")).href)).verifyV3Scene;
  let sceneReport;
  try {
    sceneReport = await verifyScene({ artifactDir, bundlePath });
  } catch (error) {
    const sceneReportPath = resolve(artifactDir, "v3-scene-report.json");
    steps.push({
      durationMs: 0,
      exitCode: 1,
      name: "capture web/native shadow screenshots",
      stderr: error instanceof Error ? error.message : String(error),
      stdout: sceneReportPath,
    });
    await mkdir(artifactDir, { recursive: true });
    await writeFile(
      sceneReportPath,
      `${JSON.stringify({
        artifacts: {
          sideBySideContactSheetPath: resolve(artifactDir, "screenshots/threejs-bevy-side-by-side.png"),
        },
        captures: [],
        diagnostics: [
          {
            code: "TN_V8_LIGHTS_SHADOWS_NATIVE_CAPTURE_FAILED",
            message: error instanceof Error ? error.message : String(error),
            severity: "error",
          },
        ],
        status: "fail",
      }, null, 2)}\n`,
    );
    const verifyLightsShadowsOnFailure =
      options.lightsShadowsVerifier ??
      (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/v8LightsShadows.js")).href)).verifyV8LightsShadows;
    const lightsShadowsReport = await verifyLightsShadowsOnFailure({
      artifactDir,
      bundlePath,
      sceneReportPath,
    });
    return writeReport({
      artifactDir,
      bundlePath,
      diagnostics: [
        {
          code: "TN_VERIFY_V8_LIGHTS_SHADOWS_CAPTURE_FAILED",
          message: error instanceof Error ? error.message : String(error),
          severity: "error",
        },
      ],
      ok: false,
      reportPath,
      lightsShadowsReportPath: lightsShadowsReport.artifacts.reportPath,
      sceneReportPath,
      steps,
    });
  }
  steps.push({ durationMs: 0, exitCode: sceneReport.status === "pass" ? 0 : 1, name: "capture web/native shadow screenshots", stderr: "", stdout: sceneReport.artifacts.reportPath });
  if (sceneReport.status !== "pass") {
    return writeReport({
      artifactDir,
      bundlePath,
      ok: false,
      reportPath,
      sceneReportPath: sceneReport.artifacts.reportPath,
      steps,
      visualContactSheetPath: sceneReport.artifacts.sideBySideContactSheetPath,
    });
  }

  const verifyAtmosphere =
    options.atmosphereVerifier ??
    (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/v3Atmosphere.js")).href)).verifyV3Atmosphere;
  const atmosphereReport = await verifyAtmosphere({ artifactDir, bundlePath });
  steps.push({ durationMs: 0, exitCode: atmosphereReport.status === "pass" ? 0 : 1, name: "verify shadow policy metadata", stderr: "", stdout: atmosphereReport.artifacts.reportPath });
  if (atmosphereReport.status !== "pass") {
    return writeReport({
      artifactDir,
      atmosphereReportPath: atmosphereReport.artifacts.reportPath,
      bundlePath,
      ok: false,
      reportPath,
      sceneReportPath: sceneReport.artifacts.reportPath,
      steps,
      visualContactSheetPath: sceneReport.artifacts.sideBySideContactSheetPath,
    });
  }

  const verifyLightingColor =
    options.lightingColorVerifier ??
    (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/v3LightingColor.js")).href)).verifyV3LightingColor;
  const lightingColorReport = await verifyLightingColor({ artifactDir, sceneReportPath: sceneReport.artifacts.reportPath });
  steps.push({ durationMs: 0, exitCode: lightingColorReport.status === "pass" ? 0 : 1, name: "record lighting color drift metrics", stderr: "", stdout: lightingColorReport.artifacts.reportPath });
  if (lightingColorReport.status !== "pass") {
    return writeReport({
      artifactDir,
      atmosphereReportPath: atmosphereReport.artifacts.reportPath,
      bundlePath,
      lightingColorReportPath: lightingColorReport.artifacts.reportPath,
      ok: false,
      reportPath,
      sceneReportPath: sceneReport.artifacts.reportPath,
      steps,
      visualContactSheetPath: sceneReport.artifacts.sideBySideContactSheetPath,
    });
  }

  const verifyLightsShadows =
    options.lightsShadowsVerifier ??
    (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/v8LightsShadows.js")).href)).verifyV8LightsShadows;
  const lightsShadowsReport = await verifyLightsShadows({
    artifactDir,
    atmosphereReportPath: atmosphereReport.artifacts.reportPath,
    bundlePath,
    sceneReportPath: sceneReport.artifacts.reportPath,
  });
  steps.push({
    durationMs: 0,
    exitCode: lightsShadowsReport.status === "pass" ? 0 : 1,
    name: "verify v8 lights/shadows trace",
    stderr: lightsShadowsReport.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    stdout: lightsShadowsReport.artifacts.reportPath,
  });

  return writeReport({
    artifactDir,
    atmosphereReportPath: atmosphereReport.artifacts.reportPath,
    bundlePath,
    lightingColorReportPath: lightingColorReport.artifacts.reportPath,
    lightsShadowsReportPath: lightsShadowsReport.artifacts.reportPath,
    ok: lightsShadowsReport.status === "pass",
    reportPath,
    sceneReportPath: sceneReport.artifacts.reportPath,
    steps,
    visualContactSheetPath: lightsShadowsReport.artifacts.contactSheetPath ?? sceneReport.artifacts.sideBySideContactSheetPath,
  });
}

async function writeReport({
  artifactDir,
  atmosphereReportPath,
  bundlePath,
  diagnostics,
  lightingColorReportPath,
  lightsShadowsReportPath,
  ok,
  reportPath,
  sceneReportPath,
  steps,
  visualContactSheetPath,
}) {
  await mkdir(artifactDir, { recursive: true });
  const report = {
    artifacts: {
      atmosphereReportPath: atmosphereReportPath ?? resolve(artifactDir, "v3-atmosphere-report.json"),
      bundlePath,
      lightingColorReportPath: lightingColorReportPath ?? resolve(artifactDir, "v3-lighting-color-report.json"),
      lightsShadowsReportPath: lightsShadowsReportPath ?? resolve(artifactDir, "v8-lights-shadows-report.json"),
      reportPath,
      sceneReportPath: sceneReportPath ?? resolve(artifactDir, "v3-scene-report.json"),
      visualContactSheetPath: visualContactSheetPath ?? resolve(artifactDir, "screenshots/threejs-bevy-side-by-side.png"),
    },
    code: ok ? "TN_VERIFY_V8_LIGHTS_SHADOWS_OK" : "TN_VERIFY_V8_LIGHTS_SHADOWS_FAILED",
    scope: {
      prd: "V8-12",
      provenSlice: "shadow-policy-and-shadow-sensitive-capture-trace",
      visualParity: "not-asserted",
    },
    ...(diagnostics === undefined ? {} : { diagnostics }),
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV8LightsShadowsProbes();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V8 lights/shadows trace passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V8 lights/shadows trace failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
