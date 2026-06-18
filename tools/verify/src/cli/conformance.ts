import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));

// @ts-expect-error legacy mjs gate consumed during typed-tools migration
const conformanceModule = (await import("../../../../scripts/verify-conformance.mjs")) as {
  verifyConformance: (options?: { repoRoot?: string }) => Promise<{
    diagnostics?: Array<{ message?: string }>;
    ok: boolean;
    reportPath?: string;
  }>;
};

const result = await conformanceModule.verifyConformance({ repoRoot });
if (result.ok) {
  process.stdout.write(`Conformance gate passed. Report: ${result.reportPath ?? "packages/ir/artifacts/conformance/verification-report.json"}\n`);
} else {
  process.stderr.write(`${(result.diagnostics ?? []).map((diagnostic) => diagnostic.message ?? "Conformance gate failed.").join("\n")}\n`);
}
process.exitCode = result.ok ? 0 : 1;
