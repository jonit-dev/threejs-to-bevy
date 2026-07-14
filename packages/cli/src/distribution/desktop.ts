import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, chmod, cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, relative, resolve } from "node:path";

import {
  distributionRegistryRow,
  normalizeDistribution,
  validateDistribution,
  type DistributionArchitecture,
  type DistributionFormat,
  type DistributionPlatform,
  type IDistributionSource,
} from "@threenative/ir";

import { buildWebDistribution } from "./web.js";
import { generateTauriShell, TAURI_CLI_REQUIRED_VERSION } from "./tauri.js";
import { assertCredentialCanariesAbsent, redactCredentialCanaries, signingStatus, type DistributionSigningStatus, type ICredentialHandle } from "./signing.js";

export type DesktopDistributionPlatform = Extract<DistributionPlatform, "linux" | "macos" | "windows">;

export interface IDesktopDistributionPlan {
  adapter: "bevy" | "tauri";
  format: DistributionFormat;
  platform: DesktopDistributionPlatform;
  runtime: "bevy" | "webview";
  signing: DistributionSigningStatus;
  sourceHash: string;
}

export interface IDesktopDistributionReport {
  architecture: string;
  artifact: { bytes: number; path: string; sha256: string };
  build: { status: "passed" };
  bundleSha256: string;
  code: "TN_PACKAGE_DESKTOP_OK";
  format: DistributionFormat;
  host: NodeJS.Platform;
  platform: DesktopDistributionPlatform;
  reproductionCommand: string;
  runtime: "webview";
  schema: "threenative.package-report";
  signing: { credentialRef?: string; status: DistributionSigningStatus };
  sourceHash: string;
  toolchain: { cargo: "locked"; linuxDeployStrip?: "host-patched"; tauriCli: "2.11.4"; tauriRuntime: "2.11.5" };
  version: "0.1.0";
}

export function resolveDesktopDistributionPlan(options: {
  credential?: ICredentialHandle;
  distribution: IDistributionSource;
  format: DistributionFormat;
  platform: DesktopDistributionPlatform;
  release: boolean;
  runtime: "bevy" | "webview";
  unsigned: boolean;
}): IDesktopDistributionPlan {
  const diagnostics = validateDistribution(options.distribution);
  if (diagnostics.length > 0) throw new Error(`TN_PACKAGE_DISTRIBUTION_INVALID: ${diagnostics[0]?.message ?? "invalid distribution"}`);
  const distribution = normalizeDistribution(options.distribution);
  const registry = distributionRegistryRow(options.platform, options.runtime);
  if (registry === undefined || !registry.formats.includes(options.format)) {
    throw new Error(`TN_PACKAGE_FORMAT_UNSUPPORTED: '${options.platform}/${options.runtime}/${options.format}' is not registered.`);
  }
  const declared = distribution.targets.find(({ platform, runtime }) => platform === options.platform && runtime === options.runtime);
  if (declared === undefined || !declared.formats.includes(options.format)) {
    throw new Error(`TN_PACKAGE_TARGET_UNDECLARED: '${options.platform}/${options.runtime}/${options.format}' is not declared by the project.`);
  }
  return {
    adapter: options.runtime === "bevy" ? "bevy" : "tauri",
    format: options.format,
    platform: options.platform,
    runtime: options.runtime,
    signing: signingStatus({ credential: options.credential, release: options.release, signable: registry.signable, unsigned: options.unsigned }),
    sourceHash: createHash("sha256").update(JSON.stringify(distribution)).digest("hex"),
  };
}

export async function buildDesktopWebviewDistribution(options: {
  commandRunner?: DesktopCommandRunner;
  credential?: ICredentialHandle;
  distribution: IDistributionSource;
  format: "appimage" | "tar";
  outputPath: string;
  platform: DesktopDistributionPlatform;
  projectPath: string;
  release: boolean;
  sourceBundlePath: string;
  tauriCliPath: string;
  unsigned: boolean;
}): Promise<IDesktopDistributionReport> {
  const plan = resolveDesktopDistributionPlan({ ...options, runtime: "webview" });
  if (options.platform !== "linux" || process.platform !== "linux") {
    throw new Error("TN_PACKAGE_WRONG_HOST: This adapter slice currently proves Linux webview artifacts only.");
  }
  const projectPath = resolve(options.projectPath);
  const outputPath = resolve(options.outputPath);
  const distribution = normalizeDistribution(options.distribution);
  const architecture = hostDistributionArchitecture();
  const registry = distributionRegistryRow(options.platform, "webview");
  if (registry === undefined || !registry.architectures.includes(architecture)) {
    throw new Error(`TN_PACKAGE_ARCHITECTURE_UNSUPPORTED: '${options.platform}/webview/${architecture}' is not an implemented registry architecture.`);
  }
  const declaredTarget = distribution.targets.find(({ platform, runtime }) => platform === options.platform && runtime === "webview");
  if (declaredTarget?.architecture !== undefined && declaredTarget.architecture !== architecture) {
    throw new Error(`TN_PACKAGE_ARCHITECTURE_WRONG_HOST: Target requires '${declaredTarget.architecture}', but this host is '${architecture}'.`);
  }
  await assertSafeDesktopOutput({ outputPath, projectPath, sourceBundlePath: resolve(options.sourceBundlePath) });
  const commandRunner = options.commandRunner ?? runDesktopCommand;
  const webOutput = resolve(projectPath, ".threenative/cache/distribution/web-static");
  const web = await buildWebDistribution({ bundlePath: resolve(options.sourceBundlePath), format: "static", outputPath: webOutput });
  const shell = await generateTauriShell({
    distribution,
    platform: options.platform,
    projectPath,
    webArtifactPath: resolve(webOutput, "artifact"),
  });
  const targetDir = resolve(projectPath, ".threenative/cache/tauri-target");
  const xdgCacheHome = resolve(projectPath, ".threenative/cache/xdg");
  const env = { ...process.env, CARGO_TARGET_DIR: targetDir, SOURCE_DATE_EPOCH: "0", XDG_CACHE_HOME: xdgCacheHome };
  await commandRunner("cargo", ["generate-lockfile"], { cwd: shell.shellPath, env });
  await rm(outputPath, { force: true, recursive: true });
  await mkdir(outputPath, { recursive: true });

  let artifactPath: string;
  let linuxDeployStrip: "host-patched" | undefined;
  if (options.format === "tar") {
    await commandRunner("cargo", ["build", "--release", "--locked"], { cwd: shell.shellPath, env });
    const stagePath = resolve(outputPath, "artifact");
    await mkdir(stagePath, { recursive: true });
    await cp(resolve(targetDir, "release", executableName()), resolve(stagePath, executableName()));
    await writeFile(resolve(stagePath, "README.txt"), `${distribution.app.displayName} - embedded local webview release\n`);
    artifactPath = resolve(outputPath, `${artifactStem(distribution.app.displayName, distribution.app.version)}_linux-${architecture}.tar.gz`);
    await commandRunner("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-czf", artifactPath, "-C", stagePath, "."], { cwd: outputPath, env });
  } else {
    const tauriArgs = ["build", "--ci", "--bundles", "appimage", "--config", '{"bundle":{"active":true}}'] as const;
    try {
      await commandRunner(options.tauriCliPath, tauriArgs, { cwd: shell.shellPath, env });
    } catch (error) {
      const linuxDeployPath = resolve(xdgCacheHome, "tauri", `linuxdeploy-${process.arch === "x64" ? "x86_64" : process.arch}.AppImage`);
      if (!await pathExists(linuxDeployPath)) throw error;
      await patchLinuxDeployStrip({ commandRunner, env, linuxDeployPath, projectPath });
      linuxDeployStrip = "host-patched";
      await commandRunner(options.tauriCliPath, tauriArgs, { cwd: shell.shellPath, env });
    }
    const appImageArchitecture = tauriAppImageArchitecture(architecture);
    const generated = resolve(targetDir, "release/bundle/appimage", `${distribution.app.displayName}_${distribution.app.version}_${appImageArchitecture}.AppImage`);
    artifactPath = resolve(outputPath, `${artifactStem(distribution.app.displayName, distribution.app.version)}_${appImageArchitecture}.AppImage`);
    await cp(generated, artifactPath);
  }
  const report: IDesktopDistributionReport = {
    architecture,
    artifact: { bytes: (await stat(artifactPath)).size, path: basename(artifactPath), sha256: await sha256File(artifactPath) },
    build: { status: "passed" },
    bundleSha256: web.bundleSha256,
    code: "TN_PACKAGE_DESKTOP_OK",
    format: options.format,
    host: process.platform,
    platform: options.platform,
    reproductionCommand: `tn package build --project . --target ${options.platform} --runtime webview --format ${options.format} --unsigned --json`,
    runtime: "webview",
    schema: "threenative.package-report",
    signing: { ...(options.credential === undefined ? {} : { credentialRef: options.credential.reference }), status: plan.signing },
    sourceHash: plan.sourceHash,
    toolchain: { cargo: "locked", ...(linuxDeployStrip === undefined ? {} : { linuxDeployStrip }), tauriCli: TAURI_CLI_REQUIRED_VERSION, tauriRuntime: "2.11.5" },
    version: "0.1.0",
  };
  const credentials = options.credential === undefined ? [] : [options.credential];
  const serializedReport = await verifyDesktopCredentialOutputs({ artifactPath, credentials, report });
  await writeFile(resolve(outputPath, "package-report.json"), serializedReport);
  return report;
}

export async function verifyDesktopCredentialOutputs(options: {
  artifactPath: string;
  credentials: readonly ICredentialHandle[];
  report: IDesktopDistributionReport;
}): Promise<string> {
  const serializedReport = `${JSON.stringify(redactCredentialCanaries(options.report, options.credentials), null, 2)}\n`;
  assertCredentialCanariesAbsent([serializedReport, await readFile(options.artifactPath)], options.credentials);
  return serializedReport;
}

async function assertSafeDesktopOutput(options: { outputPath: string; projectPath: string; sourceBundlePath: string }): Promise<void> {
  const protectedRoots = [resolve("/"), resolve(process.cwd()), resolve(homedir()), resolve(tmpdir()), options.projectPath];
  if (protectedRoots.includes(options.outputPath)) throw new Error("TN_PACKAGE_OUTPUT_UNSAFE: Desktop output resolves to a protected root.");
  if (pathsOverlap(options.outputPath, options.sourceBundlePath)) {
    throw new Error("TN_PACKAGE_OUTPUT_OVERLAP: Desktop output must not contain or be contained by the source bundle.");
  }
  const insideProject = pathIsInside(options.projectPath, options.outputPath);
  if (insideProject && ![resolve(options.projectPath, "dist"), resolve(options.projectPath, "artifacts")].some((root) => pathIsInside(root, options.outputPath))) {
    throw new Error("TN_PACKAGE_OUTPUT_UNSAFE: Project-local desktop output must be under dist/ or artifacts/.");
  }
  if (!insideProject && await pathExists(options.outputPath)) {
    try {
      const marker = JSON.parse(await readFile(resolve(options.outputPath, "package-report.json"), "utf8")) as { schema?: string };
      if (marker.schema !== "threenative.package-report") throw new Error("marker");
    } catch {
      throw new Error("TN_PACKAGE_OUTPUT_UNSAFE: Existing external output lacks a ThreeNative package-report marker.");
    }
  }
}

async function patchLinuxDeployStrip(options: {
  commandRunner: DesktopCommandRunner;
  env: NodeJS.ProcessEnv;
  linuxDeployPath: string;
  projectPath: string;
}): Promise<void> {
  const patchRoot = resolve(options.projectPath, ".threenative/cache/linuxdeploy-patch");
  await rm(patchRoot, { force: true, recursive: true });
  await mkdir(patchRoot, { recursive: true });
  await options.commandRunner(options.linuxDeployPath, ["--appimage-extract"], { cwd: patchRoot, env: options.env });
  await cp("/usr/bin/strip", resolve(patchRoot, "squashfs-root/usr/bin/strip"));
  const patchedPath = resolve(patchRoot, basename(options.linuxDeployPath));
  await options.commandRunner("appimagetool", ["--comp", "zstd", "squashfs-root", patchedPath], {
    cwd: patchRoot,
    env: { ...options.env, ARCH: process.arch === "x64" ? "x86_64" : process.arch },
  });
  await cp(patchedPath, options.linuxDeployPath);
  await chmod(options.linuxDeployPath, 0o755);
}

function pathsOverlap(left: string, right: string): boolean {
  return pathIsInside(left, right) || pathIsInside(right, left);
}

function pathIsInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export type DesktopCommandRunner = (command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => Promise<void>;

async function runDesktopCommand(command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, [...args], { cwd: options.cwd, env: options.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`TN_PACKAGE_TOOL_FAILED: '${command}' exited with ${code}.`)));
  });
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

function executableName(): string {
  return process.platform === "win32" ? "threenative_generated_shell.exe" : "threenative_generated_shell";
}

function hostDistributionArchitecture(): DistributionArchitecture {
  if (process.arch === "x64") return "x86_64";
  if (process.arch === "arm64") return "arm64";
  throw new Error(`TN_PACKAGE_ARCHITECTURE_UNSUPPORTED: Node host architecture '${process.arch}' is not supported.`);
}

function tauriAppImageArchitecture(architecture: DistributionArchitecture): string {
  if (architecture === "x86_64") return "amd64";
  if (architecture === "arm64") return "aarch64";
  throw new Error(`TN_PACKAGE_ARCHITECTURE_UNSUPPORTED: Tauri AppImage architecture '${architecture}' is not supported.`);
}

function artifactStem(displayName: string, version: string): string {
  const name = displayName.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "ThreeNative-Game";
  return `${name}_${version}`;
}
