#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { runGameProductionGate } from "../gameProductionGate.js";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const projectArgIndex = process.argv.indexOf("--project");
  const projectPath = projectArgIndex === -1 ? undefined : process.argv[projectArgIndex + 1];
  const result = await runGameProductionGate({ projectPath });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
