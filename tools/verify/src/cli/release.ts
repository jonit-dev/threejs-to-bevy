import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runReleaseGate } from "../release.js";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const json = process.argv.includes("--json");

const result = await runReleaseGate({ repoRoot });
const payload = {
  code: result.ok ? "TN_VERIFY_RELEASE_OK" : "TN_VERIFY_RELEASE_FAILED",
  diagnostics: result.diagnostics,
  reportPath: result.reportPath,
  status: result.ok ? "pass" : "fail",
  steps: result.steps,
};

if (json) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else if (result.ok) {
  process.stdout.write("Release gate passed.\n");
} else {
  const failed = result.steps.find((step) => step.exitCode !== 0);
  process.stderr.write(`Release gate failed at '${failed?.name ?? "unknown"}'.\n`);
}
process.exitCode = result.ok ? 0 : 1;

if (import.meta.url !== fileURLToPath(import.meta.url)) {
  // noop for bundlers
}
