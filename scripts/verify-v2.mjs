import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand, verifyConformance } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV2(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("check v2 docs", process.execPath, [resolve(root, "scripts/check-docs-v2.mjs"), "--json"]))) {
    return { ok: false, steps };
  }

  const conformance = await verifyConformance({
    repoRoot: root,
    run,
  });
  steps.push({
    durationMs: conformance.steps.reduce((total, current) => total + current.durationMs, 0),
    exitCode: conformance.ok ? 0 : 1,
    stderr: "",
    stdout: conformance.reportPath,
    name: "verify conformance",
  });

  return {
    ok: conformance.ok,
    steps,
  };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV2();
  const payload = {
    code: result.ok ? "TN_VERIFY_V2_OK" : "TN_VERIFY_V2_FAILED",
    status: result.ok ? "pass" : "fail",
    steps: result.steps,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V2 release gate passed.\n");
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V2 release gate failed at '${failed?.name ?? "unknown"}'.\n`);
  }

  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
