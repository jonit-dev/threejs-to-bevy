#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cursor = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(cursor, "package.json")) || !existsSync(join(cursor, "scripts", "verify-editor-required-operations.mjs"))) {
  const parent = dirname(cursor);
  if (parent === cursor) {
    throw new Error("Could not locate the ThreeNative repository root.");
  }
  cursor = parent;
}

const result = spawnSync("node", ["scripts/verify-editor-required-operations.mjs", ...process.argv.slice(2)], {
  cwd: cursor,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
