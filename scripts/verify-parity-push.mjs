import { fileURLToPath } from "node:url";

import { verifyBaselineVisualParityGate } from "./verify-baseline-visual-parity.mjs";

async function main() {
  const json = process.argv.includes("--json");
  const skipSetup = process.argv.includes("--no-setup");
  const result = await verifyBaselineVisualParityGate({ skipSetup });
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`,
    );
  } else if (result.ok) {
    process.stdout.write(`Parity push gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`Parity push gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
