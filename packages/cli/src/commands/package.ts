import { spawn } from "node:child_process";
import { cp, chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
    manifestPath: string;
    packageReportPath: string;
    packagedBundlePath: string;
    runtimeArgsPath: string;
    runtimeExecutablePath: string;
  };
  bundlePath: string;
  code: "TN_PACKAGE_OK";
  files: string[];
  format: "archive" | "installer" | "portable";
  manifestPath: string;
  runtimeArgsPath: string;
  schema: "threenative.package-report";
  sourceBundlePath: string;
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

export interface IPackageCommandOptions {
  runtimeBuilder?: DesktopRuntimeBuilder;
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
  const bundle = flagValue(normalizedArgv, "--bundle");
  const outDir = flagValue(normalizedArgv, "--out") ?? flagValue(normalizedArgv, "--outDir") ?? "dist/package";

  if (bundle === undefined) {
    return diagnosticResult(
      { code: "TN_PACKAGE_USAGE", message: "Usage: tn package --bundle <game.bundle> [--target desktop] [--format portable|archive|installer] [--out <path>] [--json]" },
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

  if (!["portable", "archive", "installer"].includes(format)) {
    return diagnosticResult(
      {
        code: "TN_PACKAGE_FORMAT_UNSUPPORTED",
        message: `Desktop package format '${format}' is not supported.`,
        severity: "error",
        suggestion: "Use '--format portable', '--format archive', or '--format installer'.",
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  try {
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
    await assertDesktopTarget(bundlePath);
    const artifactRoot = resolve(cwd, outDir);
    const packageRoot = resolve(artifactRoot, "desktop");
    const packagedBundlePath = resolve(packageRoot, basename(bundlePath));
    await mkdir(packageRoot, { recursive: true });
    await cp(bundlePath, packagedBundlePath, { force: true, recursive: true });
    const files = await listRelativeFiles(packagedBundlePath);
    const manifestPath = resolve(packageRoot, "package.manifest.json");
    const runtimeArgsPath = resolve(packageRoot, "runtime.args.json");
    const runtimeExecutablePath = resolve(packageRoot, runtimeExecutableName());
    const packageReportPath = resolve(packageRoot, "package.report.json");
    const builtRuntimePath = await (options.runtimeBuilder ?? buildDesktopRuntime)({ outputPath: runtimeExecutablePath });
    await chmod(builtRuntimePath, 0o755);
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          artifacts: {
            packagedBundlePath,
            runtimeArgsPath,
            runtimeExecutablePath: builtRuntimePath,
          },
          bundle: basename(packagedBundlePath),
          code: "TN_PACKAGE_MANIFEST_OK",
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
          args: [basename(packagedBundlePath)],
          command: `./${basename(builtRuntimePath)}`,
          schema: "threenative.runtime-args",
          target,
          version: "0.1.0",
        },
        null,
        2,
      )}\n`,
    );
    const archivePath = format === "archive" || format === "installer" ? resolve(artifactRoot, `${packageSlug(bundlePath)}-${platformTag()}.tar.gz`) : undefined;
    if (archivePath !== undefined) {
      await createTarGz({ archivePath, cwd: artifactRoot, entry: "desktop" });
    }
    const installerPath = format === "installer" ? await createInstallerScript({ archivePath: archivePath!, bundleName: basename(bundlePath), outputDir: artifactRoot }) : undefined;
    const report: IPackageReport = {
      artifactDir: packageRoot,
      artifacts: { archivePath, installerPath, manifestPath, packageReportPath, packagedBundlePath, runtimeArgsPath, runtimeExecutablePath: builtRuntimePath },
      bundlePath: packagedBundlePath,
      code: "TN_PACKAGE_OK",
      files,
      format: format as IPackageReport["format"],
      manifestPath,
      runtimeArgsPath,
      schema: "threenative.package-report",
      sourceBundlePath: bundlePath,
      target,
      version: "0.1.0",
    };
    await writeFile(packageReportPath, `${JSON.stringify(report, null, 2)}\n`);
    return {
      exitCode: 0,
      stdout: json ? `${JSON.stringify(report, null, 2)}\n` : packageMessage(report),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return diagnosticResult({ code: "TN_PACKAGE_FAILED", message, severity: "error" }, { exitCode: 1, json, stderr: true });
  }
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
  const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8")) as {
    files?: { targetProfile?: string };
  };
  const targetProfilePath = manifest.files?.targetProfile;
  if (targetProfilePath === undefined) {
    throw new Error("Bundle manifest does not reference target.profile.json.");
  }
  const targetProfileValidation = validateBundleRelativePath(targetProfilePath);
  if (!targetProfileValidation.ok) {
    throw new Error(targetProfileValidation.message ?? `Bundle target profile path '${targetProfilePath}' is invalid.`);
  }
  const profile = JSON.parse(await readFile(resolve(bundlePath, targetProfilePath), "utf8")) as { targets?: unknown };
  const targets = Array.isArray(profile.targets) ? profile.targets : [];
  if (!targets.includes("desktop")) {
    throw new Error("Bundle target profile must include 'desktop' for V7 desktop packaging.");
  }
  if (targets.some((target) => target === "mobile" || target === "ios" || target === "android" || target === "online")) {
    throw new Error("Mobile and online publishing targets are outside V7 desktop packaging scope.");
  }
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


function packageMessage(report: IPackageReport): string {
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

async function createInstallerScript(options: { archivePath: string; bundleName: string; outputDir: string }): Promise<string> {
  if (process.platform === "win32") {
    throw new Error("TN_PACKAGE_INSTALLER_UNSUPPORTED: '--format installer' currently creates a Unix .sh installer. Use '--format archive' on Windows until NSIS/WiX support lands.");
  }
  const appName = packageSlug(options.bundleName);
  const runtimeName = runtimeExecutableName();
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
chmod +x "$INSTALL_DIR/desktop/${runtimeName}"
cat > "$INSTALL_DIR/run.sh" <<'RUNNER'
#!/usr/bin/env sh
set -eu
HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$HERE/desktop"
exec ./${runtimeName} ${JSON.stringify(options.bundleName)}
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
    "--release",
  ]);

  const builtBinary = resolve(fileURLToPath(new URL("../runtime-bevy/target/release/", import.meta.url)), runtimeExecutableName());
  await cp(builtBinary, options.outputPath, { force: true });
  return options.outputPath;
}

function runtimeExecutableName(): string {
  return process.platform === "win32" ? "threenative_runtime.exe" : "threenative_runtime";
}

async function runCommand(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
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
