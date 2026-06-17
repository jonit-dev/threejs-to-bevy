import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface IBevyRuntimeInvocation {
  bundlePath: string;
}

export interface IBevyRuntimeResolution {
  cwd: string;
  manifestPath: string;
}

export type BevyRuntimeProcess = ChildProcess;

export type BevyRuntimeRunner = (invocation: IBevyRuntimeInvocation) => BevyRuntimeProcess;

type BevyRuntimeEnvironment = Partial<Record<"THREENATIVE_BEVY_MANIFEST" | "THREENATIVE_REPO_ROOT", string>>;

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
  return [
    "run",
    "--manifest-path",
    runtime.manifestPath,
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_runtime",
    "--",
    invocation.bundlePath,
  ];
}

export function runBevyRuntime(invocation: IBevyRuntimeInvocation): BevyRuntimeProcess {
  const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
  const bundledManifestPath = resolve(fileURLToPath(new URL("../runtime-bevy/Cargo.toml", import.meta.url)));
  const runtime = resolveBevyRuntime(repoRoot, process.env, bundledManifestPath);
  return spawn("cargo", bevyRuntimeArgs(repoRoot, invocation, process.env, bundledManifestPath), {
    cwd: runtime.cwd,
    stdio: "inherit",
  });
}
