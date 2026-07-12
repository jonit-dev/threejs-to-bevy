import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import type { StepSummary, VerificationDiagnostic } from "./runner.js";

export interface WebviewPackageGateResult {
  diagnostics: VerificationDiagnostic[];
  measurements: WebviewPackageMeasurements | undefined;
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

export interface WebviewPackageMeasurements {
  appBytes: number;
  archiveBytes: number;
  bundleFileCount: number;
  fileCount: number;
  inputServiceCount: number;
  overlayAssetCount: number;
  overlayCount: number;
  packageBytes: number;
  saveSlotCount: number;
  settingsCount: number;
  startupChecks: string[];
  startupMs: number;
}

export interface WebviewPackageGateOptions {
  bundlePath?: string;
  keepPackage?: boolean;
  reportPath?: string;
  root?: string;
  runPackage?: PackageRunner;
}

export interface PackageRunnerResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export type PackageRunner = (options: { args: readonly string[]; cwd: string }) => PackageRunnerResult;

const DEFAULT_BUNDLE = "examples/chess/dist/chess.bundle";

export async function runWebviewPackageGate(options: WebviewPackageGateOptions = {}): Promise<WebviewPackageGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "webview-package", owner: { kind: "aggregate", name: "webview-package" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const bundlePath = resolve(root, options.bundlePath ?? DEFAULT_BUNDLE);
  const diagnostics: VerificationDiagnostic[] = [];
  const steps: StepSummary[] = [];
  const packageOut = resolve(dirname(reportPath), "package-output");
  const startedAt = new Date().toISOString();
  let measurements: WebviewPackageMeasurements | undefined;
  let linkedArtifacts: Record<string, string> = {};

  await rm(packageOut, { force: true, recursive: true });
  await mkdir(packageOut, { recursive: true });
  const runPackage = options.runPackage ?? defaultPackageRunner(root);
  const args = [
    "package",
    "--bundle",
    bundlePath,
    "--out",
    packageOut,
    "--runtime",
    "webview",
    "--format",
    "installer",
    "--json",
  ];
  const started = Date.now();
  const result = runPackage({ args, cwd: root });
  steps.push({
    durationMs: Date.now() - started,
    exitCode: result.exitCode,
    name: "tn package --runtime webview --format installer",
    stderr: tail(result.stderr),
    stdout: tail(result.stdout),
  });
  if (result.exitCode !== 0) {
    diagnostics.push({
      code: "TN_VERIFY_WEBVIEW_PACKAGE_COMMAND_FAILED",
      message: `webview package command failed with exit code ${result.exitCode}.`,
      severity: "error",
      step: "tn package --runtime webview",
      suggestedFix: "Build the CLI/runtime-web packages and rerun the focused webview package gate.",
    });
  } else {
    const packageReport = parseJsonObject(result.stdout);
    if (packageReport === undefined) {
      diagnostics.push({
        code: "TN_VERIFY_WEBVIEW_PACKAGE_JSON_INVALID",
        message: "webview package command did not print a JSON package report.",
        severity: "error",
        step: "tn package --runtime webview",
        suggestedFix: "Keep package --json stdout as the package.report.json payload.",
      });
    } else {
      const packageArtifacts = artifactsFromPackageReport(packageReport);
      linkedArtifacts = Object.fromEntries(
        Object.entries(packageArtifacts).map(([key, value]) => [key, toRepoRelative(root, value)]),
      );
      measurements = await inspectPackagedWebview({ bundlePath, diagnostics, packageArtifacts, root });
    }
  }

  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        artifacts: {
          bundlePath: toRepoRelative(root, bundlePath),
          linkedArtifacts,
          measurements,
          packagePreserved: true,
        },
        code: ok ? "TN_VERIFY_WEBVIEW_PACKAGE_OK" : "TN_VERIFY_WEBVIEW_PACKAGE_FAILED",
        diagnostics,
        generatedBy: "@threenative/verify-tools webviewPackageGate",
        ok,
        schema: "threenative.verify.webview-package",
        startedAt,
        status: ok ? "pass" : "fail",
        steps,
        version: "0.1.0",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { diagnostics, measurements, ok, reportPath, steps };
}

async function inspectPackagedWebview(options: {
  bundlePath: string;
  diagnostics: VerificationDiagnostic[];
  packageArtifacts: PackageArtifacts;
  root: string;
}): Promise<WebviewPackageMeasurements> {
  const [packageReport, inspection, runtimeArgs, systems, localData, ui, overlays] = await Promise.all([
    readJsonObject(options.packageArtifacts.packageReportPath, options.diagnostics, "package.report.json"),
    readJsonObject(options.packageArtifacts.webviewInspectionPath, options.diagnostics, "webview.inspection.json"),
    readJsonObject(options.packageArtifacts.runtimeArgsPath, options.diagnostics, "runtime.args.json"),
    readJsonObject(resolve(options.bundlePath, "systems.ir.json"), options.diagnostics, "systems.ir.json"),
    readOptionalJsonObject(resolve(options.bundlePath, "local-data.ir.json"), options.diagnostics, "local-data.ir.json"),
    readJsonObject(resolve(options.bundlePath, "ui.ir.json"), options.diagnostics, "ui.ir.json"),
    readOptionalJsonObject(resolve(options.bundlePath, "overlays.ir.json"), options.diagnostics, "overlays.ir.json"),
  ]);

  assertValue(packageReport?.schema === "threenative.package-report", options.diagnostics, "TN_VERIFY_WEBVIEW_PACKAGE_REPORT_INVALID", "desktop-web package.report.json must use schema threenative.package-report.");
  assertValue(inspection?.schema === "threenative.package-webview-inspection", options.diagnostics, "TN_VERIFY_WEBVIEW_INSPECTION_INVALID", "desktop-web webview.inspection.json must use schema threenative.package-webview-inspection.");
  assertValue(runtimeArgs?.runtime === "webview" && Array.isArray(runtimeArgs.args) && runtimeArgs.args.includes("app"), options.diagnostics, "TN_VERIFY_WEBVIEW_RUNTIME_ARGS_INVALID", "desktop-web runtime.args.json must launch the packaged app directory.");

  const startupChecks = readInspectionChecks(inspection);
  const overlayCount = readArray(overlays?.overlays).length;
  for (const required of ["TN_PACKAGE_WEBVIEW_BUNDLE_COPIED", "TN_PACKAGE_WEBVIEW_RUNTIME_LAUNCHER", "TN_PACKAGE_WEBVIEW_RUNTIME_ARGS"]) {
    assertValue(startupChecks.includes(required), options.diagnostics, "TN_VERIFY_WEBVIEW_STARTUP_CHECK_MISSING", `desktop-web inspection must include startup check ${required}.`);
  }

  const inputServices = readServices(systems).filter((service) => service.startsWith("ui."));
  assertValue(inputServices.length > 0, options.diagnostics, "TN_VERIFY_WEBVIEW_INPUT_PROOF_MISSING", "The packaged fixture must include UI/input-facing services for desktop-web inspection.");
  if (overlayCount === 0) assertValue(readArray(ui?.focusOrder).length > 0, options.diagnostics, "TN_VERIFY_WEBVIEW_INPUT_FOCUS_MISSING", "A retained-UI-only packaged fixture must include retained UI focus order evidence.");

  const settingsCount = readArray(localData?.settings).length;
  const saveSlotCount = readArray(localData?.saveSlots).length;
  assertValue(overlayCount > 0, options.diagnostics, "TN_VERIFY_WEBVIEW_OVERLAY_PROOF_MISSING", "The packaged webview proof bundle must declare at least one generated overlay.");
  if (overlayCount === 0) {
    assertValue(settingsCount > 0, options.diagnostics, "TN_VERIFY_WEBVIEW_SETTINGS_PROOF_MISSING", "A retained-UI-only packaged fixture must include settings persistence metadata.");
    assertValue(saveSlotCount > 0, options.diagnostics, "TN_VERIFY_WEBVIEW_SAVE_PROOF_MISSING", "A retained-UI-only packaged fixture must include save-slot metadata.");
  }

  const files = readArray(packageReport?.files);
  const [archiveBytes, appBytes, packageBytes] = await Promise.all([
    fileSize(options.packageArtifacts.archivePath),
    directoryBytes(options.packageArtifacts.appPath),
    directoryBytes(options.packageArtifacts.packageRoot),
  ]);
  const startup = await measureLauncherStartup(options.packageArtifacts, options.diagnostics);
  const overlayProof = await inspectPackagedOverlays(overlays, options.packageArtifacts.appPath, options.diagnostics);

  return {
    appBytes,
    archiveBytes,
    bundleFileCount: files.filter((entry) => typeof entry === "string" && entry.startsWith("bundle/")).length,
    fileCount: files.length,
    inputServiceCount: inputServices.length,
    overlayAssetCount: overlayProof.assetCount,
    overlayCount: overlayProof.overlayCount,
    packageBytes,
    saveSlotCount,
    settingsCount,
    startupChecks,
    startupMs: startup.durationMs,
  };
}

async function inspectPackagedOverlays(
  overlays: Record<string, unknown> | undefined,
  appPath: string,
  diagnostics: VerificationDiagnostic[],
): Promise<{ assetCount: number; overlayCount: number }> {
  const declarations = readArray(overlays?.overlays).map(readObject).filter((entry): entry is Record<string, unknown> => entry !== undefined);
  let assetCount = 0;
  for (const declaration of declarations) {
    const entry = readString(declaration.entry);
    if (entry === undefined) continue;
    const packagedEntry = resolve(appPath, "bundle", entry);
    let html: string;
    try {
      html = await readFile(packagedEntry, "utf8");
    } catch {
      diagnostics.push({
        code: "TN_VERIFY_WEBVIEW_OVERLAY_ENTRY_MISSING",
        message: `Packaged webview bundle is missing declared overlay entry '${entry}'.`,
        path: packagedEntry,
        severity: "error",
        suggestedFix: "Build the overlay before tn build and ensure tn package copies the complete game bundle.",
      });
      continue;
    }
    const references = localStyleAndScriptReferences(html);
    for (const extension of ["css", "js"] as const) {
      if (!references.some((reference) => extension === "css" ? /\.css$/i.test(reference) : /\.(?:js|mjs)$/i.test(reference))) {
        diagnostics.push({
          code: "TN_VERIFY_WEBVIEW_OVERLAY_ASSET_REFERENCE_MISSING",
          message: `Packaged overlay entry '${entry}' must reference a local ${extension.toUpperCase()} asset.`,
          path: packagedEntry,
          severity: "error",
          suggestedFix: "Run the production overlay build so its entry HTML references compiled local CSS and JavaScript.",
        });
      }
    }
    for (const reference of references) {
      const packagedAsset = resolve(dirname(packagedEntry), reference);
      try {
        const stats = await stat(packagedAsset);
        if (!stats.isFile() || stats.size === 0) throw new Error("empty asset");
        assetCount += 1;
      } catch {
        diagnostics.push({
          code: "TN_VERIFY_WEBVIEW_OVERLAY_ASSET_MISSING",
          message: `Packaged overlay entry '${entry}' references missing or empty local asset '${reference}'.`,
          path: packagedAsset,
          severity: "error",
          suggestedFix: "Keep compiled overlay CSS and JavaScript beside the declared entry and include them in the game bundle.",
        });
      }
    }
  }
  return { assetCount, overlayCount: declarations.length };
}

function localStyleAndScriptReferences(html: string): string[] {
  const references = new Set<string>();
  for (const match of html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)=["']([^"']+)["'][^>]*>/gi)) {
    const reference = match[1];
    if (reference === undefined || /^(?:[a-z]+:|\/\/|\/)/i.test(reference)) continue;
    const path = reference.split(/[?#]/, 1)[0];
    if (path !== undefined && /\.(?:css|js|mjs)$/i.test(path)) references.add(path);
  }
  return [...references];
}

interface PackageArtifacts {
  appPath: string;
  archivePath: string;
  packageReportPath: string;
  packageRoot: string;
  runtimeArgsPath: string;
  runtimeExecutablePath: string;
  webviewInspectionPath: string;
}

function artifactsFromPackageReport(report: Record<string, unknown>): PackageArtifacts {
  const artifacts = readObject(report.artifacts);
  if (artifacts === undefined) {
    throw new Error("Package report missing artifacts.");
  }
  const packageReportPath = readString(artifacts.packageReportPath);
  const packageRoot = packageReportPath === undefined ? "" : dirname(packageReportPath);
  return {
    appPath: join(packageRoot, "app"),
    archivePath: requireString(artifacts.archivePath, "archivePath"),
    packageReportPath: requireString(artifacts.packageReportPath, "packageReportPath"),
    packageRoot,
    runtimeArgsPath: requireString(artifacts.runtimeArgsPath, "runtimeArgsPath"),
    runtimeExecutablePath: requireString(artifacts.runtimeExecutablePath, "runtimeExecutablePath"),
    webviewInspectionPath: requireString(artifacts.webviewInspectionPath, "webviewInspectionPath"),
  };
}

async function measureLauncherStartup(artifacts: PackageArtifacts, diagnostics: VerificationDiagnostic[]): Promise<{ durationMs: number }> {
  const started = Date.now();
  return await new Promise<{ durationMs: number }>((resolvePromise) => {
    const child = spawn(artifacts.runtimeExecutablePath, ["app"], {
      cwd: artifacts.packageRoot,
      env: {
        ...process.env,
        THREENATIVE_WEBVIEW_PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill("SIGTERM");
        diagnostics.push({
          code: "TN_VERIFY_WEBVIEW_STARTUP_TIMEOUT",
          message: "desktop-web launcher did not report a ready localhost URL within 5 seconds.",
          path: artifacts.runtimeExecutablePath,
          severity: "error",
          suggestedFix: "Fix the generated webview launcher or its static server startup path.",
        });
        resolvePromise({ durationMs: Date.now() - started });
      }
    }, 5000);
    child.stdout.on("data", (chunk: Buffer) => {
      if (!resolved && chunk.toString("utf8").includes("ThreeNative desktop-web runtime ready at ")) {
        resolved = true;
        clearTimeout(timeout);
        child.kill("SIGTERM");
        resolvePromise({ durationMs: Date.now() - started });
      }
    });
    child.on("error", (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        diagnostics.push({
          code: "TN_VERIFY_WEBVIEW_STARTUP_FAILED",
          message: `desktop-web launcher failed to start: ${error.message}`,
          path: artifacts.runtimeExecutablePath,
          severity: "error",
          suggestedFix: "Ensure the generated webview launcher is executable and can start the local static server.",
        });
        resolvePromise({ durationMs: Date.now() - started });
      }
    });
    child.on("exit", (code, signal) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        diagnostics.push({
          code: "TN_VERIFY_WEBVIEW_STARTUP_EXITED",
          message: `desktop-web launcher exited before ready with ${signal ?? `exit code ${code}`}.`,
          path: artifacts.runtimeExecutablePath,
          severity: "error",
          suggestedFix: "Inspect the generated webview launcher and static server log.",
        });
        resolvePromise({ durationMs: Date.now() - started });
      }
    });
  });
}

function defaultPackageRunner(root: string): PackageRunner {
  return ({ args, cwd }) => {
    const result = spawnSync(process.execPath, [resolve(root, "packages/cli/dist/index.js"), ...args], {
      cwd,
      encoding: "utf8",
    });
    return {
      exitCode: result.status ?? 1,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  };
}

async function readJsonObject(path: string, diagnostics: VerificationDiagnostic[], name: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = parseJsonObject(await readFile(path, "utf8"));
    if (parsed === undefined) {
      diagnostics.push({
        code: "TN_VERIFY_WEBVIEW_JSON_INVALID",
        message: `${name} is not a JSON object.`,
        path,
        severity: "error",
      });
    }
    return parsed;
  } catch {
    diagnostics.push({
      code: "TN_VERIFY_WEBVIEW_ARTIFACT_MISSING",
      message: `${name} is missing from the webview package proof.`,
      path,
      severity: "error",
    });
    return undefined;
  }
}

async function readOptionalJsonObject(path: string, diagnostics: VerificationDiagnostic[], name: string): Promise<Record<string, unknown> | undefined> {
  try {
    await access(path);
  } catch {
    return undefined;
  }
  return readJsonObject(path, diagnostics, name);
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return readObject(parsed);
  } catch {
    const objectStart = text.indexOf("{");
    if (objectStart < 0) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(text.slice(objectStart)) as unknown;
      return readObject(parsed);
    } catch {
      return undefined;
    }
  }
}

function readInspectionChecks(value: Record<string, unknown> | undefined): string[] {
  return readArray(value?.checks)
    .map((entry) => readObject(entry)?.code)
    .filter((entry): entry is string => typeof entry === "string");
}

function readServices(value: Record<string, unknown> | undefined): string[] {
  return readArray(value?.systems).flatMap((system) => readArray(readObject(system)?.services)).filter((entry): entry is string => typeof entry === "string");
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requireString(value: unknown, field: string): string {
  const stringValue = readString(value);
  if (stringValue === undefined) {
    throw new Error(`Package report missing ${field}.`);
  }
  return stringValue;
}

function assertValue(value: boolean, diagnostics: VerificationDiagnostic[], code: string, message: string): void {
  if (!value) {
    diagnostics.push({ code, message, severity: "error" });
  }
}

async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size;
}

async function directoryBytes(path: string): Promise<number> {
  let total = 0;
  const entries = await import("node:fs/promises").then((fs) => fs.readdir(path, { withFileTypes: true }));
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      total += await directoryBytes(child);
    } else if (entry.isFile()) {
      total += (await stat(child)).size;
    }
  }
  return total;
}

function tail(value: string): string {
  return value.length <= 4000 ? value : value.slice(-4000);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runWebviewPackageGate({ keepPackage: process.argv.includes("--keep-package") });
  process.stdout.write(`${JSON.stringify({
    diagnostics: result.diagnostics,
    measurements: result.measurements,
    ok: result.ok,
    reportPath: result.reportPath,
  }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
