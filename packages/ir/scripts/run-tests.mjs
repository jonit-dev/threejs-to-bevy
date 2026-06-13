import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const runIndex = forwardedArgs.indexOf("--run");
const nodeArgs = ["--test"];

if (runIndex !== -1) {
  const pattern = forwardedArgs[runIndex + 1];
  if (pattern !== undefined) {
    nodeArgs.push("--test-name-pattern", pattern);
  }
  forwardedArgs.splice(runIndex, pattern === undefined ? 1 : 2);
}

const build = spawnSync("tsc", ["-p", "tsconfig.json"], { stdio: "inherit" });
if (build.status !== 0) {
  process.exit(build.status ?? 1);
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

const test = spawnSync("node", [...nodeArgs, ...collectTestFiles("dist"), ...forwardedArgs], { stdio: "inherit" });
process.exit(test.status ?? 1);
