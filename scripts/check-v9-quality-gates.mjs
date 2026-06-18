import { fileURLToPath } from "node:url";

import { checkV9QualityGates, V9_FOCUSED_SCRIPT_NAMES, V9_SAMPLE_SCENES } from "../tools/verify/dist/v9QualityGates.js";

export { checkV9QualityGates, V9_FOCUSED_SCRIPT_NAMES, V9_SAMPLE_SCENES };

async function main() {
  const json = process.argv.includes("--json");
  const result = await checkV9QualityGates();
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write("V9 quality gate wiring check passed.\n");
  } else {
    process.stderr.write(`${result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
