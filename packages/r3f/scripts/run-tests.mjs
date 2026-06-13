import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const build = spawnSync("pnpm", ["build"], { cwd: new URL("..", import.meta.url), stdio: "inherit" });
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const dist = new URL("../dist", import.meta.url);
const tests = readdirSync(dist)
  .filter((file) => file.endsWith(".test.js"))
  .map((file) => join(dist.pathname, file));

const run = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...tests], { stdio: "inherit" });
process.exit(run.status ?? 1);
