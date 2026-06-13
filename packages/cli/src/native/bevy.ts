import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface IBevyRuntimeInvocation {
  bundlePath: string;
}

export type BevyRuntimeProcess = ChildProcess;

export type BevyRuntimeRunner = (invocation: IBevyRuntimeInvocation) => BevyRuntimeProcess;

export function runBevyRuntime(invocation: IBevyRuntimeInvocation): BevyRuntimeProcess {
  const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
  return spawn(
    "cargo",
    [
      "run",
      "--manifest-path",
      resolve(repoRoot, "runtime-bevy/Cargo.toml"),
      "-p",
      "threenative_runtime",
      "--",
      invocation.bundlePath,
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );
}
