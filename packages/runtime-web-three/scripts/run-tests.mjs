import { spawnSync } from "node:child_process";

const forwardedArgs = process.argv.slice(2);
const test = spawnSync(process.execPath, ["../../scripts/run-package-tests.mjs", "--build", "pnpm", ...forwardedArgs], {
  stdio: "inherit",
});
process.exit(test.status ?? 1);
