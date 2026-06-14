import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface IBevyRuntimeInvocation {
  bundlePath: string;
}

export type BevyRuntimeProcess = ChildProcess;

export type BevyRuntimeRunner = (invocation: IBevyRuntimeInvocation) => BevyRuntimeProcess;

export function bevyRuntimeArgs(repoRoot: string, invocation: IBevyRuntimeInvocation): string[] {
  return [
    "run",
    "--manifest-path",
    resolve(repoRoot, "runtime-bevy/Cargo.toml"),
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
  return spawn("cargo", bevyRuntimeArgs(repoRoot, invocation), {
    cwd: repoRoot,
    stdio: "inherit",
  });
}
