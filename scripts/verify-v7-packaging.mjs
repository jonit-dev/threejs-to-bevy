import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV7Packaging(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v7/packaging");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const fixtureBundlePath =
    options.bundlePath ?? resolve(root, "packages/ir/fixtures/conformance/v7-scripting-lifecycle/game.bundle");
  const cliBin = resolve(root, "packages/cli/dist/index.js");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result;
  }

  let desktopPayload;
  const desktopPackage = await step(
    "package v7 desktop fixture",
    process.execPath,
    [
      cliBin,
      "package",
      "--bundle",
      fixtureBundlePath,
      "--target",
      "desktop",
      "--out",
      artifactDir,
      "--json",
    ],
    { timeoutMs: 120000 },
  );
  if (desktopPackage.exitCode !== 0) {
    return writeReport({
      artifactDir,
      bundlePath: fixtureBundlePath,
      ok: false,
      reportPath,
      startedAt,
      startedAtMs,
      steps,
    });
  }
  desktopPayload = JSON.parse(desktopPackage.stdout);

  const manifest = JSON.parse(await readFile(desktopPayload.manifestPath, "utf8"));
  const runtimeArgs = JSON.parse(await readFile(desktopPayload.runtimeArgsPath, "utf8"));
  const artifactCheck = {
    durationMs: 0,
    exitCode:
      manifest.schema === "threenative.package" &&
      manifest.target === "desktop" &&
      runtimeArgs.command === "threenative_runtime" &&
      runtimeArgs.args?.[0] === "game.bundle"
        ? 0
        : 1,
    name: "inspect packaged desktop artifacts",
    stderr: "",
    stdout: JSON.stringify({ manifestPath: desktopPayload.manifestPath, runtimeArgsPath: desktopPayload.runtimeArgsPath }),
  };
  steps.push(artifactCheck);
  if (artifactCheck.exitCode !== 0) {
    return writeReport({
      artifactDir,
      bundlePath: fixtureBundlePath,
      desktopPayload,
      ok: false,
      reportPath,
      startedAt,
      startedAtMs,
      steps,
    });
  }

  const unsupportedTarget = await step(
    "reject v7 mobile packaging target",
    process.execPath,
    [cliBin, "package", "--bundle", fixtureBundlePath, "--target", "mobile", "--out", artifactDir, "--json"],
    { timeoutMs: 120000 },
  );
  let unsupportedDiagnostic;
  try {
    unsupportedDiagnostic = JSON.parse(unsupportedTarget.stderr);
  } catch {
    unsupportedDiagnostic = undefined;
  }
  if (unsupportedTarget.exitCode === 0 || unsupportedDiagnostic?.code !== "TN_PACKAGE_TARGET_UNSUPPORTED") {
    return writeReport({
      artifactDir,
      bundlePath: fixtureBundlePath,
      desktopPayload,
      ok: false,
      reportPath,
      startedAt,
      startedAtMs,
      steps,
      unsupportedDiagnostic,
    });
  }

  return writeReport({
    artifactDir,
    bundlePath: fixtureBundlePath,
    desktopPayload,
    ok: true,
    reportPath,
    startedAt,
    startedAtMs,
    steps,
    unsupportedDiagnostic,
  });
}

async function writeReport({
  artifactDir,
  bundlePath,
  desktopPayload,
  ok,
  reportPath,
  startedAt,
  startedAtMs,
  steps,
  unsupportedDiagnostic,
}) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const failedStep = steps.find((step) => step.exitCode !== 0 && step.name !== "reject v7 mobile packaging target");
  const diagnostics =
    failedStep === undefined
      ? []
      : [
          {
            code: "TN_VERIFY_V7_PACKAGING_STEP_FAILED",
            message: `V7 packaging verification failed at '${failedStep.name}'.`,
            path: `steps.${steps.indexOf(failedStep)}`,
            severity: "error",
            step: failedStep.name,
          },
        ];
  const report = {
    artifacts: {
      bundlePath,
      desktopArtifactDir: desktopPayload?.artifactDir ?? resolve(artifactDir, "desktop"),
      desktopBundlePath: desktopPayload?.bundlePath ?? resolve(artifactDir, "desktop/game.bundle"),
      desktopManifestPath: desktopPayload?.manifestPath ?? resolve(artifactDir, "desktop/package.manifest.json"),
      desktopRuntimeArgsPath: desktopPayload?.runtimeArgsPath ?? resolve(artifactDir, "desktop/runtime.args.json"),
      reportPath,
    },
    code: ok ? "TN_VERIFY_V7_PACKAGING_OK" : "TN_VERIFY_V7_PACKAGING_FAILED",
    diagnostics,
    durationMs: Date.now() - startedAtMs,
    schema: "threenative.verify.v7.packaging",
    status: ok ? "pass" : "fail",
    startedAt: startedAt.toISOString(),
    steps,
    unsupportedTargetDiagnostic: unsupportedDiagnostic,
    version: "0.1.0",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV7Packaging();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V7 packaging verification passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V7 packaging verification failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
