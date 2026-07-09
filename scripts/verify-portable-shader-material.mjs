import { fileURLToPath } from "node:url";

import { runPortableShaderMaterialGate } from "../tools/verify/dist/portableShaderMaterial.js";

export async function verifyPortableShaderMaterial() {
  return runPortableShaderMaterialGate();
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyPortableShaderMaterial();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.artifacts.reportPath, status: result.status }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`Portable shader material gate passed. Report: ${result.artifacts.reportPath}\n`);
  } else {
    process.stderr.write(`Portable shader material gate failed. Report: ${result.artifacts.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
