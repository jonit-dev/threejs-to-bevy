import { spawn, spawnSync, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface IBevyRuntimeInvocation {
  bundlePath: string;
  captureOutput?: boolean;
  headless?: boolean;
  proofHarness?: {
    auditWrites?: boolean;
    commandStreamPath: string;
    readinessOutPath: string;
  };
}

export interface IBevyRuntimeResolution {
  cwd: string;
  manifestPath: string;
}

export type BevyRuntimeProcess = ChildProcess;

export type BevyRuntimeRunner = (invocation: IBevyRuntimeInvocation) => BevyRuntimeProcess;

type BevyRuntimeEnvironment = Partial<
  Record<"DISPLAY" | "THREENATIVE_BEVY_MANIFEST" | "THREENATIVE_REPO_ROOT" | "TN_NATIVE_PROFILE" | "WAYLAND_DISPLAY" | "WAYLAND_SOCKET", string>
>;

export const REQUIRED_BEVY_RUNTIME_FEATURES = ["native-overlay-cef"] as const;

export class NativeHeadlessUnsupportedError extends Error {
  readonly code = "TN_PLAYTEST_NATIVE_HEADLESS_UNSUPPORTED";

  constructor() {
    super("The bundled Bevy runtime does not yet support offscreen headless playtest rendering.");
    this.name = "NativeHeadlessUnsupportedError";
  }
}

export function hasNativeDisplay(env: BevyRuntimeEnvironment = process.env): boolean {
  return [env.DISPLAY, env.WAYLAND_DISPLAY, env.WAYLAND_SOCKET].some(
    (value) => value !== undefined && value.trim() !== "",
  );
}

export function resolveBevyRuntime(
  repoRoot: string,
  env: BevyRuntimeEnvironment = process.env,
  bundledManifestPath?: string,
): IBevyRuntimeResolution {
  if (env.THREENATIVE_BEVY_MANIFEST !== undefined && env.THREENATIVE_BEVY_MANIFEST.trim() !== "") {
    const manifestPath = resolve(env.THREENATIVE_BEVY_MANIFEST);
    return {
      cwd: dirname(manifestPath),
      manifestPath,
    };
  }

  if (env.THREENATIVE_REPO_ROOT !== undefined && env.THREENATIVE_REPO_ROOT.trim() !== "") {
    const runtimeRoot = resolve(env.THREENATIVE_REPO_ROOT);
    return {
      cwd: runtimeRoot,
      manifestPath: resolve(runtimeRoot, "runtime-bevy/Cargo.toml"),
    };
  }

  if (bundledManifestPath !== undefined && existsSync(bundledManifestPath)) {
    return {
      cwd: dirname(bundledManifestPath),
      manifestPath: bundledManifestPath,
    };
  }

  return {
    cwd: repoRoot,
    manifestPath: resolve(repoRoot, "runtime-bevy/Cargo.toml"),
  };
}

export function bevyRuntimeArgs(
  repoRoot: string,
  invocation: IBevyRuntimeInvocation,
  env: BevyRuntimeEnvironment = process.env,
  bundledManifestPath?: string,
): string[] {
  const runtime = resolveBevyRuntime(repoRoot, env, bundledManifestPath);
  const args = [
    "run",
    "--manifest-path",
    runtime.manifestPath,
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_runtime",
    "--features",
    REQUIRED_BEVY_RUNTIME_FEATURES.join(","),
  ];
  if (env.TN_NATIVE_PROFILE !== "debug") {
    args.push("--release");
  }
  args.push("--", invocation.bundlePath);
  if (invocation.headless === true) {
    args.push("--headless");
  }
  if (invocation.proofHarness !== undefined) {
    args.push(
      "--proof-harness",
      invocation.proofHarness.commandStreamPath,
      "--readiness-out",
      invocation.proofHarness.readinessOutPath,
    );
    if (invocation.proofHarness.auditWrites === true) {
      args.push("--audit-writes");
    }
  }
  return args;
}

export function resolveBevyRuntimeBinaryPath(
  repoRoot: string,
  env: BevyRuntimeEnvironment = process.env,
): string | undefined {
  const runtimeRoot = resolve(repoRoot, "runtime-bevy");
  const profile = env.TN_NATIVE_PROFILE === "debug" ? "debug" : "release";
  const fallbackProfile = profile === "debug" ? "release" : "debug";
  const candidates = [
    join(runtimeRoot, `target/${profile}/threenative_runtime`),
    join(runtimeRoot, `target/${fallbackProfile}/threenative_runtime`),
  ];
  return candidates.find((candidate) => {
    if (!existsSync(candidate)) return false;
    const result = spawnSync(candidate, ["--capabilities"], { encoding: "utf8", timeout: 5_000 });
    if (result.status !== 0) return false;
    try {
      const capabilities = JSON.parse(result.stdout) as { cargoFeatures?: unknown };
      const cargoFeatures = capabilities.cargoFeatures;
      if (!Array.isArray(cargoFeatures)
        || !cargoFeatures.every((feature): feature is string => typeof feature === "string")) return false;
      return REQUIRED_BEVY_RUNTIME_FEATURES.every((feature) => cargoFeatures.includes(feature));
    } catch {
      return false;
    }
  });
}

function bevyRuntimeBinaryArgs(invocation: IBevyRuntimeInvocation): string[] {
  const args = [invocation.bundlePath];
  if (invocation.headless === true) {
    args.push("--headless");
  }
  if (invocation.proofHarness !== undefined) {
    args.push(
      "--proof-harness",
      invocation.proofHarness.commandStreamPath,
      "--readiness-out",
      invocation.proofHarness.readinessOutPath,
    );
    if (invocation.proofHarness.auditWrites === true) {
      args.push("--audit-writes");
    }
  }
  return args;
}

export function runBevyRuntime(invocation: IBevyRuntimeInvocation): BevyRuntimeProcess {
  if (invocation.headless === true) {
    throw new NativeHeadlessUnsupportedError();
  }
  const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
  const bundledManifestPath = resolve(fileURLToPath(new URL("../runtime-bevy/Cargo.toml", import.meta.url)));
  const runtime = resolveBevyRuntime(repoRoot, process.env, bundledManifestPath);
  const binaryPath = resolveBevyRuntimeBinaryPath(repoRoot, process.env);
  const env = { ...process.env };
  const stdio: StdioOptions = invocation.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit";
  if (binaryPath !== undefined) {
    return spawn(binaryPath, bevyRuntimeBinaryArgs(invocation), {
      cwd: runtime.cwd,
      env,
      stdio,
    });
  }
  return spawn("cargo", bevyRuntimeArgs(repoRoot, invocation, process.env, bundledManifestPath), {
    cwd: runtime.cwd,
    env,
    stdio,
  });
}
