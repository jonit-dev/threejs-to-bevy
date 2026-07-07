import { requiredAssertionIds, validateProofResult } from "./proof-contract.js";
import { type IBenchmarkDiagnostic, type IBenchmarkRunReport } from "./types.js";

export function validateVanillaProof(report: IBenchmarkRunReport): IBenchmarkDiagnostic[] {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (report.condition !== "vanilla") {
    diagnostics.push({
      code: "TN_BENCH_VANILLA_PROOF_CONDITION",
      message: "Vanilla proof validation only accepts vanilla run reports.",
      severity: "error",
    });
    return diagnostics;
  }
  diagnostics.push(...validateProofResult(report.promptId, report.proof));
  const required = requiredAssertionIds(report.promptId);
  if (required.length > 0 && report.proof?.assertions.length === 0) {
    diagnostics.push({
      code: "TN_BENCH_VANILLA_PAGE_LOAD_ONLY",
      message: `${report.promptId}: vanilla proof only demonstrated page load, not required mechanic assertions.`,
      severity: "error",
      suggestedFix: "Run the neutral proof adapter and record movement/objective/retry assertions.",
    });
  }
  return diagnostics;
}
