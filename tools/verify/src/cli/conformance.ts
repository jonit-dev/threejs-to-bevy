import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
import { compareInteractionParity, validateInteractionResidualEvidence, type IInteractionParitySnapshot } from "../interactionParity.js";
import { generateInteractionResidualArtifacts } from "../interactionResidualArtifacts.js";

// @ts-expect-error legacy mjs gate consumed during typed-tools migration
const conformanceModule = (await import("../../../../scripts/verify-conformance.mjs")) as {
  verifyConformance: (options?: { repoRoot?: string }) => Promise<{
    diagnostics?: Array<{ message?: string }>;
    ok: boolean;
    reportPath?: string;
  }>;
};

const result = await conformanceModule.verifyConformance({ repoRoot });
await generateInteractionResidualArtifacts(repoRoot);
const interactionDiagnostics = await comparePersistedInteractionArtifacts();
if (result.ok && interactionDiagnostics.length === 0) {
  process.stdout.write(`Conformance gate passed. Report: ${result.reportPath ?? "packages/ir/artifacts/conformance/verification-report.json"}\n`);
} else {
  process.stderr.write(`${[...(result.diagnostics ?? []).map((diagnostic) => diagnostic.message ?? "Conformance gate failed."), ...interactionDiagnostics.map((diagnostic) => diagnostic.message)].join("\n")}\n`);
}
process.exitCode = result.ok && interactionDiagnostics.length === 0 ? 0 : 1;

async function comparePersistedInteractionArtifacts() {
  const diagnostics = [];
  for (const scenario of ["pickup", "hazard", "checkpoint", "projectile", "residuals"]) {
    const root = resolve(repoRoot, "packages/ir/artifacts/conformance/interactions");
    const web = JSON.parse(await readFile(resolve(root, `${scenario}.web.json`), "utf8")) as IInteractionParitySnapshot;
    const native = JSON.parse(await readFile(resolve(root, `${scenario}.native.json`), "utf8")) as IInteractionParitySnapshot;
    diagnostics.push(...compareInteractionParity(web, native));
    if (scenario === "residuals") diagnostics.push(...validateInteractionResidualEvidence(web), ...validateInteractionResidualEvidence(native));
  }
  return diagnostics;
}
