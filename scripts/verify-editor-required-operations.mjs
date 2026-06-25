#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const build = spawnSync("pnpm", ["build:verify-tools"], { cwd: root, encoding: "utf8", stdio: "inherit" });
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const { runEditorRequiredOperationsSmoke } = await import("../tools/verify/dist/editorRequiredOperations.js");
const report = await runEditorRequiredOperationsSmoke({
  keep: process.argv.includes("--keep"),
  root,
  skipPackageBuild: process.argv.includes("--skip-package-build"),
});
console.log(JSON.stringify(report, null, 2));
