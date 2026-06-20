import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RunTestsOptions {
  buildCommand?: readonly string[];
  distDir?: string;
  forwardedArgs?: readonly string[];
}

export function runPackageTests(packageRoot: string, options: RunTestsOptions = {}): number {
  const distDir = options.distDir ?? "dist";
  const buildCommand = options.buildCommand ?? ["tsc", "-p", "tsconfig.json"];
  const buildExecutable = buildCommand[0];
  if (!buildExecutable) {
    return 1;
  }
  const build = spawnSync(buildExecutable, buildCommand.slice(1), {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (build.status !== 0) {
    return build.status ?? 1;
  }

  const testFiles = collectTestFiles(resolve(packageRoot, distDir)).sort();
  if (testFiles.length === 0) {
    process.stderr.write(`No compiled test files found under ${distDir}.\n`);
    return 1;
  }

  const forwardedArgs = normalizeForwardedArgs(options.forwardedArgs ?? process.argv.slice(2));
  const test = spawnSync(process.execPath, ["--test", ...forwardedArgs, ...testFiles], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  return test.status ?? 1;
}

function normalizeForwardedArgs(args: readonly string[]): string[] {
  const forwarded: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--run" && args[index + 1]) {
      forwarded.push("--test-name-pattern", args[index + 1]!);
      index += 1;
      continue;
    }
    if (arg !== undefined && arg !== "--") {
      forwarded.push(arg);
    }
  }
  return forwarded;
}

export function collectTestFiles(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSyncSafe(directory)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(path, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(path);
    }
  }
  return files;
}

function readdirSyncSafe(directory: string) {
  return readdirSync(directory, { withFileTypes: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runPackageTests(resolve(fileURLToPath(new URL("..", import.meta.url))));
}
