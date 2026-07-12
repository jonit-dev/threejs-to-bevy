import { spawnSync } from "node:child_process";

const test = spawnSync(process.execPath, ["../../scripts/run-package-tests.mjs", "--build", "tsc", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(test.status ?? 1);
