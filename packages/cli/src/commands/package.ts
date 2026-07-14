import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, cp, chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBundle } from "@threenative/compiler";
import { validateBundleRelativePath } from "@threenative/ir";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

export interface IPackageReport {
  artifactDir: string;
  artifacts: {
    archivePath?: string;
    installerPath?: string;
    appImagePath?: string;
    manifestPath: string;
    packageReportPath: string;
    packagedBundlePath: string;
    runtimeArgsPath: string;
    runtimeExecutablePath: string;
    webviewInspectionPath?: string;
  };
  bundlePath: string;
  code: "TN_PACKAGE_OK";
  files: string[];
  format: "appimage" | "archive" | "installer" | "portable";
  manifestPath: string;
  runtimeArgsPath: string;
  schema: "threenative.package-report";
  sourceBundlePath: string;
  runtime: "bevy" | "webview";
  target: "desktop";
  version: "0.1.0";
  nativeOverlay?: ICefPackageReport;
}

export interface ICefPayloadArtifact {
  executable?: boolean;
  path: string;
  repositoryPath?: string;
  sha256: string;
  source: "distribution" | "repository";
  sourceSha256?: string;
  transform?: "strip-unneeded";
}

export interface ICefPayloadManifest {
  backend: "cef-osr";
  cargoFeature: "native-overlay-cef";
  cefCrate: string;
  cefDistribution: string;
  chromium: string;
  helperModel: string;
  locales: string[];
  payload: ICefPayloadArtifact[];
  platform: string;
  schema: "threenative.native-overlay-backend";
  version: "0.1.0";
}

export interface ICefPackageReport {
  backend: "cef-osr";
  cefDistribution: string;
  chromium: string;
  files: Array<{ bytes: number; path: string; sha256: string }>;
  logicalPayloadBytes: number;
  mountedPackage?: { bytes: number; path: string; sha256: string };
  packageManifestPath: string;
}

export interface IWebviewInspectionReport {
  checks: Array<{ code: string; path?: string; status: "manual" | "pass"; summary: string }>;
  code: "TN_PACKAGE_WEBVIEW_INSPECTION_READY";
  host: {
    embeddedWebview: false;
    launcher: "local-static-server";
    opener: "platform-browser-or-webview-handler";
  };
  manualChecks: string[];
  runtime: "webview";
  schema: "threenative.package-webview-inspection";
  target: "desktop";
  version: "0.1.0";
}

export interface IPackagePreflightReport {
  code: "TN_PACKAGE_PREFLIGHT_OK";
  credentials: Array<{ code: string; required: boolean; status: "missing" | "not-required"; target: string }>;
  diagnostics: Array<{ code: string; message: string; path: string; severity: "error" | "warning"; suggestion: string }>;
  metadata: Array<{ field: string; status: "present" | "required" }>;
  schema: "threenative.package-preflight-report";
  target: "android" | "desktop" | "ios" | "mobile";
  version: "0.1.0";
}

export type DesktopRuntimeBuilder = (options: { outputPath: string }) => Promise<string>;
export type AppImageBuilder = (options: { appDir: string; outputPath: string }) => Promise<string>;

export interface IPackageCommandOptions {
  appImageBuilder?: AppImageBuilder;
  cefPayloadManifest?: ICefPayloadManifest;
  cefRuntimeDir?: string;
  runtimeBuilder?: DesktopRuntimeBuilder;
}

class PackageDiagnosticError extends Error {
  constructor(
    readonly diagnostic: {
      code: string;
      message: string;
      path?: string;
      severity: "error";
      suggestion?: string;
      target?: string;
      value?: unknown;
    },
  ) {
    super(diagnostic.message);
  }
}

export async function packageCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IPackageCommandOptions = {},
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const preflight = normalizedArgv.includes("--preflight");
  const target = flagValue(normalizedArgv, "--target") ?? "desktop";
  const format = flagValue(normalizedArgv, "--format") ?? "portable";
  const runtime = flagValue(normalizedArgv, "--runtime") ?? "bevy";
  const bundle = flagValue(normalizedArgv, "--bundle");
  const outDir = flagValue(normalizedArgv, "--out") ?? flagValue(normalizedArgv, "--outDir") ?? "dist/package";

  if (bundle === undefined) {
    return diagnosticResult(
      { code: "TN_PACKAGE_USAGE", message: "Usage: tn package --bundle <game.bundle> [--target desktop] [--runtime bevy|webview] [--format portable|archive|installer|appimage] [--out <path>] [--json]" },
      { exitCode: 1, json, stderr: true },
    );
  }

  if (preflight) {
    return packagePreflightCommand({ bundle, cwd, json, target });
  }

  if (target !== "desktop") {
    return diagnosticResult(
      {
        code: "TN_PACKAGE_TARGET_UNSUPPORTED",
        message: `Target '${target}' is not supported by V7 desktop packaging.`,
        severity: "error",
        suggestion: "Use '--target desktop'. Mobile stores, online publishing, and service deployment are outside V7 scope.",
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  if (!["portable", "archive", "installer", "appimage"].includes(format)) {
    return diagnosticResult(
      {
        code: "TN_PACKAGE_FORMAT_UNSUPPORTED",
        message: `Desktop package format '${format}' is not supported.`,
        severity: "error",
        suggestion: "Use '--format portable', '--format archive', '--format installer', or '--format appimage'.",
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  if (!["bevy", "webview"].includes(runtime)) {
    return diagnosticResult(
      {
        code: "TN_PACKAGE_RUNTIME_UNSUPPORTED",
        message: `Desktop runtime '${runtime}' is not supported.`,
        severity: "error",
        suggestion: "Use '--runtime bevy' or '--runtime webview'.",
      },
      { exitCode: 1, json, stderr: true },
    );
  }
  if (format === "appimage" && runtime !== "bevy") {
    return diagnosticResult(
      {
        code: "TN_PACKAGE_FORMAT_UNSUPPORTED",
        message: "The AppImage format is available only for the native Bevy runtime.",
        severity: "error",
        suggestion: "Use '--runtime bevy --format appimage' or choose a portable webview format.",
      },
      { exitCode: 1, json, stderr: true },
    );
  }
  if (format === "appimage" && (process.platform !== "linux" || process.arch !== "x64")) {
    return diagnosticResult(
      {
        code: "TN_PACKAGE_FORMAT_UNSUPPORTED",
        message: `AppImage packaging is currently supported only on linux-x64, not ${platformTag()}.`,
        severity: "error",
        suggestion: "Use '--format portable' on this platform until platform-specific CEF evidence is available.",
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  try {
    const bundlePath = resolve(cwd, bundle);
    const targetProfileDiagnostic = await readDesktopTargetDiagnostic(bundlePath);
    if (targetProfileDiagnostic !== undefined) {
      return diagnosticResult(targetProfileDiagnostic, { exitCode: 1, json, stderr: true });
    }
    const validation = await validateBundle(bundlePath);
    if (!validation.ok) {
      return diagnosticResult(
        {
          code: "TN_PACKAGE_BUNDLE_INVALID",
          diagnostics: validation.diagnostics,
          message: `Bundle validation failed with ${validation.diagnostics.length} error(s).`,
          path: bundlePath,
          severity: "error",
        },
        { exitCode: 1, json, stderr: true },
      );
    }
    await assertDesktopTarget(bundlePath);
    const artifactRoot = resolve(cwd, outDir);
    const packageDirName = runtime === "webview" ? "desktop-web" : "desktop";
    const packageRoot = resolve(artifactRoot, packageDirName);
    const packagedBundlePath = resolve(packageRoot, runtime === "webview" ? "app/bundle" : basename(bundlePath));
    await mkdir(packageRoot, { recursive: true });
    let builtRuntimePath: string;
    let files: string[];
    let nativeOverlay: ICefPackageReport | undefined;
    if (runtime === "webview") {
      builtRuntimePath = await buildWebviewRuntime({ bundlePath, outputPath: resolve(packageRoot, "threenative_webview_runtime"), packageRoot });
      files = await listRelativeFiles(resolve(packageRoot, "app"));
    } else {
      await cp(bundlePath, packagedBundlePath, { force: true, recursive: true });
      files = await listRelativeFiles(packagedBundlePath);
      builtRuntimePath = await (options.runtimeBuilder ?? buildDesktopRuntime)({ outputPath: resolve(packageRoot, runtimeExecutableName()) });
      if (await bundleRequiresCefOverlay(bundlePath)) {
        nativeOverlay = await packageCefPayload({
          manifest: options.cefPayloadManifest ?? await readCefPayloadManifest(),
          packageRoot,
          runtimeDir: options.cefRuntimeDir ?? process.env.THREENATIVE_CEF_RUNTIME_DIR,
        });
        builtRuntimePath = await installCefRuntimeWrapper(packageRoot, builtRuntimePath, basename(packagedBundlePath));
      }
    }
    const manifestPath = resolve(packageRoot, "package.manifest.json");
    const runtimeArgsPath = resolve(packageRoot, "runtime.args.json");
    const packageReportPath = resolve(packageRoot, "package.report.json");
    const webviewInspectionPath = runtime === "webview" ? resolve(packageRoot, "webview.inspection.json") : undefined;
    await chmod(builtRuntimePath, 0o755);
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          artifacts: {
            packagedBundlePath,
            runtimeArgsPath,
            runtimeExecutablePath: builtRuntimePath,
            webviewInspectionPath,
          },
          bundle: runtime === "webview" ? "app/bundle" : basename(packagedBundlePath),
          code: "TN_PACKAGE_MANIFEST_OK",
          runtime,
          schema: "threenative.package",
          sourceBundlePath: bundlePath,
          target,
          version: "0.1.0",
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      runtimeArgsPath,
      `${JSON.stringify(
        {
          args: runtime === "webview" ? ["app"] : [basename(packagedBundlePath)],
          command: `./${basename(builtRuntimePath)}`,
          runtime,
          schema: "threenative.runtime-args",
          target,
          version: "0.1.0",
        },
        null,
        2,
      )}\n`,
    );
    const archivePath = format === "archive" || format === "installer" ? resolve(artifactRoot, `${packageSlug(bundlePath)}-${runtime}-${platformTag()}.tar.gz`) : undefined;
    const appImagePath = format === "appimage" ? resolve(artifactRoot, `${packageSlug(bundlePath)}-${runtime}-${platformTag()}.AppImage`) : undefined;
    if (webviewInspectionPath !== undefined) {
      await writeWebviewInspectionReport({
        archivePath,
        installerPath: undefined,
        manifestPath,
        packagedBundlePath,
        runtimeArgsPath,
        runtimeExecutablePath: builtRuntimePath,
        webviewInspectionPath,
      });
    }
    const installerPath = format === "installer" ? resolve(artifactRoot, `${packageSlug(bundlePath)}-${platformTag()}-installer.sh`) : undefined;
    if (webviewInspectionPath !== undefined) {
      await writeWebviewInspectionReport({
        archivePath,
        installerPath,
        manifestPath,
        packagedBundlePath,
        runtimeArgsPath,
        runtimeExecutablePath: builtRuntimePath,
        webviewInspectionPath,
      });
    }
    const report: IPackageReport = {
      artifactDir: packageRoot,
      artifacts: { appImagePath, archivePath, installerPath, manifestPath, packageReportPath, packagedBundlePath, runtimeArgsPath, runtimeExecutablePath: builtRuntimePath, webviewInspectionPath },
      bundlePath: packagedBundlePath,
      code: "TN_PACKAGE_OK",
      files,
      format: format as IPackageReport["format"],
      manifestPath,
      runtime: runtime as IPackageReport["runtime"],
      runtimeArgsPath,
      schema: "threenative.package-report",
      sourceBundlePath: bundlePath,
      target,
      version: "0.1.0",
      nativeOverlay,
    };
    await writeFile(packageReportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (archivePath !== undefined) {
      await createTarGz({ archivePath, cwd: artifactRoot, entry: packageDirName });
    }
    if (format === "installer") {
      report.artifacts.installerPath = await createInstallerScript({ archivePath: archivePath!, bundleName: basename(bundlePath), outputDir: artifactRoot, packageDirName, runtimeExecutableName: basename(builtRuntimePath) });
    }
    if (appImagePath !== undefined) {
      if (nativeOverlay === undefined) {
        throw new PackageDiagnosticError({
          code: "TN_OVERLAY_CEF_HELPER_MISSING",
          message: "AppImage output currently requires a desktop CEF overlay bundle and its validated runtime payload.",
          severity: "error",
          suggestion: "Declare a desktop overlay or use '--format portable'.",
        });
      }
      await prepareAppImageMetadata(packageRoot, basename(packagedBundlePath));
      report.artifacts.appImagePath = await (options.appImageBuilder ?? buildAppImage)({ appDir: packageRoot, outputPath: appImagePath });
      nativeOverlay.mountedPackage = {
        bytes: (await stat(report.artifacts.appImagePath)).size,
        path: report.artifacts.appImagePath,
        sha256: await sha256File(report.artifacts.appImagePath),
      };
      await writeFile(packageReportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    return {
      exitCode: 0,
      stdout: json ? `${JSON.stringify(report, null, 2)}\n` : packageMessage(report),
    };
  } catch (error) {
    if (error instanceof PackageDiagnosticError) {
      return diagnosticResult(error.diagnostic, { exitCode: 1, json, stderr: true });
    }
    const message = error instanceof Error ? error.message : String(error);
    return diagnosticResult({ code: "TN_PACKAGE_FAILED", message, severity: "error" }, { exitCode: 1, json, stderr: true });
  }
}

async function writeWebviewInspectionReport(options: {
  archivePath: string | undefined;
  installerPath: string | undefined;
  manifestPath: string;
  packagedBundlePath: string;
  runtimeArgsPath: string;
  runtimeExecutablePath: string;
  webviewInspectionPath: string;
}): Promise<void> {
  const report: IWebviewInspectionReport = {
    checks: [
      {
        code: "TN_PACKAGE_WEBVIEW_BUNDLE_COPIED",
        path: options.packagedBundlePath,
        status: "pass",
        summary: "Bundle files were copied into the desktop-web app/bundle directory.",
      },
      {
        code: "TN_PACKAGE_WEBVIEW_RUNTIME_LAUNCHER",
        path: options.runtimeExecutablePath,
        status: "pass",
        summary: "The desktop-web launcher was generated and marked executable by the package command.",
      },
      {
        code: "TN_PACKAGE_WEBVIEW_RUNTIME_ARGS",
        path: options.runtimeArgsPath,
        status: "pass",
        summary: "Runtime arguments launch the packaged app directory.",
      },
      {
        code: "TN_PACKAGE_WEBVIEW_ARCHIVE",
        path: options.archivePath,
        status: options.archivePath === undefined ? "manual" : "pass",
        summary: options.archivePath === undefined ? "Portable package output is available; archive inspection applies only to archive or installer formats." : "The archive includes the desktop-web launcher and app files.",
      },
      {
        code: "TN_PACKAGE_WEBVIEW_INSTALLER",
        path: options.installerPath,
        status: options.installerPath === undefined ? "manual" : "pass",
        summary: options.installerPath === undefined ? "Installer inspection applies only to installer format." : "The installer writes a run.sh wrapper that launches the desktop-web package.",
      },
      {
        code: "TN_PACKAGE_WEBVIEW_HOST_MANUAL",
        status: "manual",
        summary: "The current host opens a localhost URL with the platform browser/webview handler; embedded Wry/Tauri behavior is not claimed by this artifact.",
      },
    ],
    code: "TN_PACKAGE_WEBVIEW_INSPECTION_READY",
    host: {
      embeddedWebview: false,
      launcher: "local-static-server",
      opener: "platform-browser-or-webview-handler",
    },
    manualChecks: [
      "Run the installed package with THREENATIVE_WEBVIEW_PORT set to a known local port.",
      "Open the reported localhost URL and inspect window.__THREENATIVE_READY__.",
      "Confirm ok is true, no error diagnostics are present, a canvas exists, and /bundle assets load with HTTP 200.",
    ],
    runtime: "webview",
    schema: "threenative.package-webview-inspection",
    target: "desktop",
    version: "0.1.0",
  };
  await writeFile(options.webviewInspectionPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function packagePreflightCommand(options: { bundle: string | undefined; cwd: string; json: boolean; target: string }): Promise<ICommandResult> {
  const { bundle, cwd, json, target } = options;
  if (bundle === undefined) {
    return diagnosticResult(
      { code: "TN_PACKAGE_USAGE", message: "Usage: tn package --preflight --bundle <game.bundle> [--target mobile] [--json]" },
      { exitCode: 1, json, stderr: true },
    );
  }
  if (!["android", "desktop", "ios", "mobile"].includes(target)) {
    return diagnosticResult(
      {
        code: "TN_PACKAGE_PREFLIGHT_TARGET_UNSUPPORTED",
        message: `Target '${target}' does not have a package preflight policy.`,
        severity: "error",
        suggestion: "Use '--target desktop', '--target mobile', '--target ios', or '--target android'.",
      },
      { exitCode: 1, json, stderr: true },
    );
  }
  const bundlePath = resolve(cwd, bundle);
  const validation = await validateBundle(bundlePath);
  if (!validation.ok) {
    return diagnosticResult(
      {
        code: "TN_PACKAGE_BUNDLE_INVALID",
        diagnostics: validation.diagnostics,
        message: `Bundle validation failed with ${validation.diagnostics.length} error(s).`,
        path: bundlePath,
        severity: "error",
      },
      { exitCode: 1, json, stderr: true },
    );
  }
  const mobileTarget = target === "mobile" || target === "ios" || target === "android";
  const report: IPackagePreflightReport = {
    code: "TN_PACKAGE_PREFLIGHT_OK",
    credentials: [
      {
        code: mobileTarget ? "TN_PACKAGE_SIGNING_CREDENTIAL_REQUIRED" : "TN_PACKAGE_SIGNING_CREDENTIAL_NOT_REQUIRED",
        required: mobileTarget,
        status: mobileTarget ? "missing" : "not-required",
        target,
      },
    ],
    diagnostics: mobileTarget
      ? [
          {
            code: "TN_PACKAGE_SIGNING_CREDENTIAL_REQUIRED",
            message: `Signing credentials are required before producing a ${target} package.`,
            path: "package.signing.identity",
            severity: "warning",
            suggestion: "Provide signing credentials in the release environment; do not commit private keys.",
          },
        ]
      : [],
    metadata: [
      { field: "bundle.identifier", status: "present" },
      { field: "app.displayName", status: "present" },
      { field: "store.category", status: mobileTarget ? "required" : "present" },
    ],
    schema: "threenative.package-preflight-report",
    target: target as IPackagePreflightReport["target"],
    version: "0.1.0",
  };
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(report, null, 2)}\n` : `Package preflight for '${target}' completed with ${report.diagnostics.length} diagnostic(s).\n`,
  };
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

async function assertDesktopTarget(bundlePath: string): Promise<void> {
  const diagnostic = await readDesktopTargetDiagnostic(bundlePath);
  if (diagnostic !== undefined) {
    throw new PackageDiagnosticError(diagnostic);
  }
}

async function readDesktopTargetDiagnostic(bundlePath: string): Promise<PackageDiagnosticError["diagnostic"] | undefined> {
  try {
    const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8")) as {
      files?: { targetProfile?: string };
    };
    const targetProfilePath = manifest.files?.targetProfile;
    if (targetProfilePath === undefined) {
      return undefined;
    }
    const targetProfileValidation = validateBundleRelativePath(targetProfilePath);
    if (!targetProfileValidation.ok) {
      return undefined;
    }
    const profile = JSON.parse(await readFile(resolve(bundlePath, targetProfilePath), "utf8")) as { targets?: unknown };
    const targets = Array.isArray(profile.targets) ? profile.targets : [];
    if (!targets.includes("desktop")) {
      return {
        code: "TN_PACKAGE_TARGET_PROFILE_UNSUPPORTED",
        message: "Bundle target profile must include 'desktop' for desktop packaging.",
        path: `${targetProfilePath}/targets`,
        severity: "error",
        suggestion: "Add 'desktop' to target.profile.json targets before running 'tn package --target desktop'.",
        target: "desktop",
        value: targets,
      };
    }
    if (targets.some((target) => target === "mobile" || target === "ios" || target === "android" || target === "online")) {
      return {
        code: "TN_PACKAGE_TARGET_PROFILE_UNSUPPORTED",
        message: "Mobile and online publishing targets are outside desktop packaging scope.",
        path: `${targetProfilePath}/targets`,
        severity: "error",
        suggestion: "Use package preflight for mobile targets or remove mobile/online targets from the desktop package profile.",
        target: "desktop",
        value: targets,
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function listRelativeFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      return entry.isDirectory() ? listRelativeFiles(root, path) : [path];
    }),
  );
  return files.flat().sort();
}

async function bundleRequiresCefOverlay(bundlePath: string): Promise<boolean> {
  const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8")) as {
    entry?: { overlays?: unknown };
  };
  const overlaysPath = manifest.entry?.overlays;
  if (typeof overlaysPath !== "string") return false;
  const pathValidation = validateBundleRelativePath(overlaysPath);
  if (!pathValidation.ok) return false;
  const overlays = JSON.parse(await readFile(resolve(bundlePath, overlaysPath), "utf8")) as {
    overlays?: Array<{ targetProfiles?: unknown }>;
  };
  return overlays.overlays?.some((overlay) =>
    Array.isArray(overlay.targetProfiles) && overlay.targetProfiles.includes("desktop")) ?? false;
}

async function readCefPayloadManifest(): Promise<ICefPayloadManifest> {
  const path = resolve(fileURLToPath(new URL("../runtime-bevy/cef-runtime-manifest.json", import.meta.url)));
  try {
    const manifest = JSON.parse(await readFile(path, "utf8")) as ICefPayloadManifest;
    if (manifest.schema !== "threenative.native-overlay-backend"
      || manifest.backend !== "cef-osr"
      || manifest.cargoFeature !== "native-overlay-cef"
      || !Array.isArray(manifest.payload)
      || manifest.payload.length === 0) {
      throw new Error("manifest fields are incomplete");
    }
    return manifest;
  } catch (error) {
    throw new PackageDiagnosticError({
      code: "TN_OVERLAY_CEF_HELPER_MISSING",
      message: `CEF backend package manifest '${path}' is unavailable or invalid: ${error instanceof Error ? error.message : String(error)}`,
      path,
      severity: "error",
      suggestion: "Reinstall the CLI or restore the descriptor-owned CEF package manifest.",
    });
  }
}

async function packageCefPayload(options: {
  manifest: ICefPayloadManifest;
  packageRoot: string;
  runtimeDir: string | undefined;
}): Promise<ICefPackageReport> {
  if (options.manifest.platform !== "linux-x86_64" || process.platform !== "linux" || process.arch !== "x64") {
    throw new PackageDiagnosticError({
      code: "TN_OVERLAY_CEF_HELPER_MISSING",
      message: `CEF backend '${options.manifest.backend}' has no proved payload for ${platformTag()}.`,
      severity: "error",
      suggestion: "Use retained UI on this platform or add platform-specific CEF package evidence.",
    });
  }
  if (options.runtimeDir === undefined || options.runtimeDir.trim() === "") {
    throw new PackageDiagnosticError({
      code: "TN_OVERLAY_CEF_HELPER_MISSING",
      message: "A desktop CEF overlay requires THREENATIVE_CEF_RUNTIME_DIR to point at the pinned CEF distribution payload.",
      path: "THREENATIVE_CEF_RUNTIME_DIR",
      severity: "error",
      suggestion: `Provide the files declared by cef-runtime-manifest.json for CEF ${options.manifest.cefDistribution}.`,
    });
  }
  const runtimeRoot = resolve(options.runtimeDir);
  const bundledRuntimeRoot = resolve(fileURLToPath(new URL("../runtime-bevy/", import.meta.url)));
  const files: ICefPackageReport["files"] = [];
  for (const artifact of options.manifest.payload) {
    const relativeValidation = validateBundleRelativePath(artifact.path);
    if (!relativeValidation.ok) {
      throw new PackageDiagnosticError({
        code: "TN_OVERLAY_CEF_RESOURCE_REJECTED",
        message: `CEF package manifest contains unsafe path '${artifact.path}'.`,
        path: artifact.path,
        severity: "error",
        suggestion: "Use normalized relative payload paths in the backend manifest.",
      });
    }
    const sourcePath = artifact.source === "repository"
      ? resolve(bundledRuntimeRoot, artifact.repositoryPath ?? "")
      : resolve(runtimeRoot, artifact.path);
    if (!await pathExists(sourcePath)) {
      throw new PackageDiagnosticError({
        code: "TN_OVERLAY_CEF_HELPER_MISSING",
        message: `Required CEF package artifact '${artifact.path}' is missing at '${sourcePath}'.`,
        path: sourcePath,
        severity: "error",
        suggestion: `Restore the pinned CEF ${options.manifest.cefDistribution} payload before packaging.`,
      });
    }
    const sourceHash = await sha256File(sourcePath);
    if (sourceHash !== artifact.sha256 && sourceHash !== artifact.sourceSha256) {
      throw new PackageDiagnosticError({
        code: "TN_OVERLAY_CEF_RESOURCE_REJECTED",
        message: `CEF artifact '${artifact.path}' checksum mismatch: expected ${artifact.sourceSha256 ?? artifact.sha256}, received ${sourceHash}.`,
        path: sourcePath,
        severity: "error",
        suggestion: "Use the exactly pinned CEF distribution; do not package an unreviewed Chromium update.",
      });
    }
    const destinationPath = resolve(options.packageRoot, artifact.path);
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, { force: true });
    if (artifact.transform === "strip-unneeded" && sourceHash === artifact.sourceSha256) {
      await runCommand("strip", ["--strip-unneeded", destinationPath]);
    }
    const destinationHash = await sha256File(destinationPath);
    if (destinationHash !== artifact.sha256) {
      throw new PackageDiagnosticError({
        code: "TN_OVERLAY_CEF_RESOURCE_REJECTED",
        message: `Packaged CEF artifact '${artifact.path}' checksum mismatch after preparation: expected ${artifact.sha256}, received ${destinationHash}.`,
        path: destinationPath,
        severity: "error",
        suggestion: "Use the supported strip toolchain or provide the reviewed stripped payload.",
      });
    }
    if (artifact.executable === true) await chmod(destinationPath, 0o755);
    files.push({ bytes: (await stat(destinationPath)).size, path: artifact.path, sha256: destinationHash });
  }
  await writeFile(
    resolve(options.packageRoot, "cef-runtime-manifest.json"),
    `${JSON.stringify(options.manifest, null, 2)}\n`,
  );
  return {
    backend: options.manifest.backend,
    cefDistribution: options.manifest.cefDistribution,
    chromium: options.manifest.chromium,
    files,
    logicalPayloadBytes: files.reduce((total, file) => total + file.bytes, 0),
    packageManifestPath: "cef-runtime-manifest.json",
  };
}

async function installCefRuntimeWrapper(
  packageRoot: string,
  runtimeExecutablePath: string,
  _bundleName: string,
): Promise<string> {
  const runtimeName = basename(runtimeExecutablePath);
  const binaryName = `${runtimeName}.bin`;
  await rename(runtimeExecutablePath, resolve(packageRoot, binaryName));
  await writeFile(runtimeExecutablePath, `#!/usr/bin/env sh
set -eu
HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export LD_LIBRARY_PATH="$HERE\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$HERE/${binaryName}" "$@"
`, { mode: 0o755 });
  return runtimeExecutablePath;
}

async function prepareAppImageMetadata(packageRoot: string, bundleName: string): Promise<void> {
  await writeFile(resolve(packageRoot, "AppRun"), `#!/usr/bin/env sh
set -eu
HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$HERE/threenative_runtime" "$HERE/${bundleName}" "$@"
`, { mode: 0o755 });
  await writeFile(resolve(packageRoot, "threenative.desktop"), `[Desktop Entry]
Type=Application
Name=ThreeNative Game
Exec=AppRun
Icon=threenative
Categories=Game;
Terminal=false
`);
  await writeFile(resolve(packageRoot, "threenative.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#17140f"/><path d="M24 34h80v16H72v54H56V50H24z" fill="#d6aa55"/></svg>\n`);
}

async function buildAppImage(options: { appDir: string; outputPath: string }): Promise<string> {
  await runCommand("appimagetool", ["--comp", "zstd", options.appDir, options.outputPath], {
    ...process.env,
    ARCH: "x86_64",
  });
  await chmod(options.outputPath, 0o755);
  return options.outputPath;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}


function packageMessage(report: IPackageReport): string {
  if (report.format === "appimage" && report.artifacts.appImagePath !== undefined) {
    return `Packaged desktop AppImage at '${report.artifacts.appImagePath}'.\n`;
  }
  if (report.format === "installer" && report.artifacts.installerPath !== undefined) {
    return `Packaged desktop installer at '${report.artifacts.installerPath}'.\n`;
  }
  if (report.format === "archive" && report.artifacts.archivePath !== undefined) {
    return `Packaged desktop archive at '${report.artifacts.archivePath}'.\n`;
  }
  return `Packaged desktop bundle at '${report.bundlePath}'.\n`;
}

function packageSlug(bundlePath: string): string {
  return basename(bundlePath).replace(/\.bundle$/u, "").replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "threenative-game";
}

function platformTag(): string {
  return `${process.platform}-${process.arch}`;
}

async function createTarGz(options: { archivePath: string; cwd: string; entry: string }): Promise<void> {
  await mkdir(dirname(options.archivePath), { recursive: true });
  await runCommand("tar", ["-czf", options.archivePath, "-C", options.cwd, options.entry]);
}

async function createInstallerScript(options: { archivePath: string; bundleName: string; outputDir: string; packageDirName: string; runtimeExecutableName: string }): Promise<string> {
  if (process.platform === "win32") {
    throw new Error("TN_PACKAGE_INSTALLER_UNSUPPORTED: '--format installer' currently creates a Unix .sh installer. Use '--format archive' on Windows until NSIS/WiX support lands.");
  }
  const appName = packageSlug(options.bundleName);
  const runtimeName = options.runtimeExecutableName;
  const installerPath = resolve(options.outputDir, `${appName}-${platformTag()}-installer.sh`);
  const archiveBase64 = (await readFile(options.archivePath)).toString("base64");
  const script = `#!/usr/bin/env sh
set -eu
APP_NAME=${JSON.stringify(appName)}
DEFAULT_DIR="$HOME/.local/share/$APP_NAME"
INSTALL_DIR="\${1:-$DEFAULT_DIR}"
mkdir -p "$INSTALL_DIR"
TMP_ARCHIVE="$(mktemp -t ${appName}.XXXXXX.tar.gz)"
cleanup() { rm -f "$TMP_ARCHIVE"; }
trap cleanup EXIT
if sed '1,/^__THREENATIVE_ARCHIVE_BELOW__$/d' "$0" | base64 -d > "$TMP_ARCHIVE" 2>/dev/null; then
  :
else
  sed '1,/^__THREENATIVE_ARCHIVE_BELOW__$/d' "$0" | base64 -D > "$TMP_ARCHIVE"
fi
tar -xzf "$TMP_ARCHIVE" -C "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/${options.packageDirName}/${runtimeName}"
cat > "$INSTALL_DIR/run.sh" <<'RUNNER'
#!/usr/bin/env sh
set -eu
HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$HERE/${options.packageDirName}"
exec ./${runtimeName} ${JSON.stringify(options.packageDirName === "desktop-web" ? "app" : options.bundleName)}
RUNNER
chmod +x "$INSTALL_DIR/run.sh"
printf 'Installed %s to %s\nRun: %s/run.sh\n' "$APP_NAME" "$INSTALL_DIR" "$INSTALL_DIR"
exit 0
__THREENATIVE_ARCHIVE_BELOW__
${archiveBase64}
`;
  await writeFile(installerPath, script, { mode: 0o755 });
  await chmod(installerPath, 0o755);
  return installerPath;
}


async function buildWebviewRuntime(options: { bundlePath: string; outputPath: string; packageRoot: string }): Promise<string> {
  const appRoot = resolve(options.packageRoot, "app");
  const sourceRoot = resolve(options.packageRoot, ".webview-src");
  await rm(sourceRoot, { force: true, recursive: true });
  await mkdir(resolve(sourceRoot, "src"), { recursive: true });
  await writeFile(
    resolve(sourceRoot, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ThreeNative Desktop WebView</title>
    <style>
      html, body, #app { width: 100%; height: 100%; margin: 0; }
      body { background: #111318; overflow: hidden; }
      canvas { display: block; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
  );
  await writeFile(
    resolve(sourceRoot, "src/main.js"),
    `import { renderBundle } from "${fileURLToPath(new URL("../../../runtime-web-three/dist/renderBundle.js", import.meta.url))}";
import { stableSystemEffectLog } from "${fileURLToPath(new URL("../../../runtime-web-three/dist/systems/log.js", import.meta.url))}";

const container = document.getElementById("app");
if (!container) throw new Error("Missing #app container.");
const result = await renderBundle("/bundle", container);
window.__THREENATIVE_READY__ = {
  canvas: { height: result.canvas.height, width: result.canvas.width },
  diagnostics: result.diagnostics,
  ok: result.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
  runtimeDiagnostics: result.runtimeDiagnostics,
};
window.__THREENATIVE_EFFECT_LOG__ = stableSystemEffectLog(result.effectLog);
setInterval(() => {
  window.__THREENATIVE_EFFECT_LOG__ = stableSystemEffectLog(result.effectLog);
}, 100);
`,
  );
  await runNodeModule("vite", ["build", sourceRoot, "--outDir", appRoot, "--emptyOutDir"]);
  await cp(options.bundlePath, resolve(appRoot, "bundle"), { force: true, recursive: true });
  await rm(sourceRoot, { force: true, recursive: true });
  await writeFile(
    options.outputPath,
    `#!/usr/bin/env sh
set -eu
HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APP_DIR="$HERE/${basename(appRoot)}"
PORT="${"${THREENATIVE_WEBVIEW_PORT:-0}"}"
PYTHON="${"${PYTHON:-python3}"}"
URL_FILE="$(mktemp -t threenative-webview-url.XXXXXX)"
SERVER_LOG="${"${THREENATIVE_WEBVIEW_LOG:-/tmp/threenative-webview-runtime.log}"}"
cleanup() { rm -f "$URL_FILE"; if [ -n "${"${SERVER_PID:-}"}" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT INT TERM
"$PYTHON" - "$APP_DIR" "$PORT" "$URL_FILE" > "$SERVER_LOG" 2>&1 <<'PY' &
import functools, http.server, pathlib, socketserver, sys
root=pathlib.Path(sys.argv[1]).resolve()
port=int(sys.argv[2])
url_file=pathlib.Path(sys.argv[3])
handler=functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
class Reuse(socketserver.TCPServer):
    allow_reuse_address=True
with Reuse(("127.0.0.1", port), handler) as httpd:
    url_file.write_text(f"http://127.0.0.1:{httpd.server_address[1]}/index.html")
    httpd.serve_forever()
PY
SERVER_PID=$!
while [ ! -s "$URL_FILE" ]; do sleep 0.05; done
URL="$(cat "$URL_FILE")"
printf 'ThreeNative desktop-web runtime ready at %s\n' "$URL"
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true; elif command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true; fi
wait "$SERVER_PID"
`,
  );
  return options.outputPath;
}

async function runNodeModule(binName: string, args: readonly string[]): Promise<void> {
  const executableName = process.platform === "win32" ? `${binName}.cmd` : binName;
  const localExecutable = resolve(fileURLToPath(new URL("../../../../node_modules/.bin/", import.meta.url)), executableName);
  const executable = await pathExists(localExecutable) ? localExecutable : executableName;
  await runCommand(executable, args);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function buildDesktopRuntime(options: { outputPath: string }): Promise<string> {
  const envBinary = process.env.THREENATIVE_RUNTIME_BINARY?.trim();
  if (envBinary !== undefined && envBinary !== "") {
    await cp(resolve(envBinary), options.outputPath, { force: true });
    return options.outputPath;
  }

  const manifestPath = resolve(fileURLToPath(new URL("../runtime-bevy/Cargo.toml", import.meta.url)));
  await runCommand("cargo", [
    "build",
    "--manifest-path",
    manifestPath,
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_runtime",
    "--features",
    "native-overlay-cef",
    "--release",
  ]);

  const builtBinary = resolve(fileURLToPath(new URL("../runtime-bevy/target/release/", import.meta.url)), runtimeExecutableName());
  await cp(builtBinary, options.outputPath, { force: true });
  return options.outputPath;
}

function runtimeExecutableName(): string {
  return process.platform === "win32" ? "threenative_runtime.exe" : "threenative_runtime";
}

async function runCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}
