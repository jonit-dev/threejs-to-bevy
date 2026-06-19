import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const buildFlagIndex = forwardedArgs.indexOf("--build");
const buildMode = buildFlagIndex === -1 ? "tsc" : forwardedArgs[buildFlagIndex + 1] ?? "tsc";
if (buildFlagIndex !== -1) {
  forwardedArgs.splice(buildFlagIndex, 2);
}

const runIndex = forwardedArgs.indexOf("--run");
const nodeArgs = ["--test"];

if (runIndex !== -1) {
  const pattern = forwardedArgs[runIndex + 1];
  if (pattern !== undefined) {
    nodeArgs.push("--test-name-pattern", pattern);
  }
  forwardedArgs.splice(runIndex, pattern === undefined ? 1 : 2);
}

const packageRoot = process.cwd();

if (process.env.TN_SKIP_PACKAGE_TEST_BUILD !== "1") {
  const build =
    buildMode === "pnpm"
      ? spawnSync("pnpm", ["build"], { cwd: packageRoot, stdio: "inherit" })
      : spawnSync("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], { cwd: packageRoot, stdio: "inherit" });

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

function collectTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTestFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".test.js") ? [path] : [];
  });
}

const testFiles = collectTestFiles(join(packageRoot, "dist"));
if (testFiles.length === 0) {
  process.exit(0);
}

const test = spawnSync(process.execPath, [...nodeArgs, ...testFiles, ...forwardedArgs], { stdio: "inherit" });
process.exit(test.status ?? 1);
