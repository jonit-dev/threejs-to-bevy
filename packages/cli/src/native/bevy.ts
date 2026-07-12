import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface IBevyRuntimeInvocation {
  bundlePath: string;
  captureOutput?: boolean;
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
  Record<"THREENATIVE_BEVY_MANIFEST" | "THREENATIVE_REPO_ROOT" | "TN_NATIVE_PROFILE", string>
>;

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
  ];
  if (env.TN_NATIVE_PROFILE !== "debug") {
    args.push("--release");
  }
  args.push("--", invocation.bundlePath);
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
  return candidates.find((candidate) => existsSync(candidate));
}

function bevyRuntimeBinaryArgs(invocation: IBevyRuntimeInvocation): string[] {
  const args = [invocation.bundlePath];
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
