import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyV6ResourceEventTrace } from "./verify-v6-resource-events-trace.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV6AnimationTrace(options = {}) {
  return verifyV6ResourceEventTrace({
    ...options,
    artifactDir: options.artifactDir ?? resolve(repoRoot, "artifacts/conformance/v6-animation-clips"),
    bundlePath: options.bundlePath ?? resolve(repoRoot, "packages/ir/fixtures/conformance/v6-animation-clips/game.bundle"),
    mismatchCode: "TN_VERIFY_V6_ANIMATION_TRACE_MISMATCH",
    mismatchLabel: "V6 animation trace",
  });
}

async function main() {
  const result = await verifyV6AnimationTrace({
    artifactDir: process.argv[3],
    bundlePath: process.argv[2],
  });
  if (result.ok) {
    process.stdout.write(`V6 animation trace passed. Diff: ${result.artifacts.diffPath}\n`);
  } else {
    process.stderr.write(`${result.comparison.firstMismatch?.message ?? "V6 animation trace failed."}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
