import { fileURLToPath } from "node:url";

import { verifyV6ResourceEventTrace } from "./verify-v6-resource-events-trace.mjs";

export async function verifyV7ScriptingLifecycleTrace(options = {}) {
  return verifyV6ResourceEventTrace({
    ...options,
    mismatchCode: "TN_VERIFY_V7_SCRIPTING_LIFECYCLE_TRACE_MISMATCH",
    mismatchLabel: "V7 scripting lifecycle trace",
  });
}

async function main() {
  const result = await verifyV7ScriptingLifecycleTrace({
    artifactDir: process.argv[3],
    bundlePath: process.argv[2],
  });
  if (result.ok) {
    process.stdout.write(`V7 scripting lifecycle trace passed. Diff: ${result.artifacts.diffPath}\n`);
  } else {
    process.stderr.write(`${result.comparison.firstMismatch?.message ?? "V7 scripting lifecycle trace failed."}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
