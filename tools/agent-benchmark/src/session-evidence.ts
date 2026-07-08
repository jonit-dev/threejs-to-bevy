import { type IBenchmarkDiagnostic, type IBenchmarkSession } from "./types.js";

export type SessionEvidenceContext = "aggregate" | "score";

export function sessionMetricEvidenceDiagnostics(session: IBenchmarkSession, options: {
  context: SessionEvidenceContext;
  runId: string;
}): IBenchmarkDiagnostic[] {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const prefix = options.context === "aggregate" ? "TN_BENCH_AGGREGATE" : "TN_BENCH_SCORE";
  if (session.tokenCount <= 0) {
    diagnostics.push({
      code: `${prefix}_SESSION_TOKEN_COUNT_PLACEHOLDER`,
      message: `${options.runId}: session.tokenCount must be greater than 0 for matrix evidence.`,
      severity: "error",
      suggestedFix: "Replace copied session templates with real transcript token counts before scoring or aggregating.",
    });
  }
  if (session.failedCommandCount === undefined) {
    diagnostics.push({
      code: `${prefix}_SESSION_FAILED_COMMANDS_MISSING`,
      message: `${options.runId}: session.failedCommandCount is required for the round-5 failed-command median.`,
      severity: "error",
      suggestedFix: "Record failedCommandCount in session.json before scoring or aggregating the run.",
    });
  }
  if (session.toolStepCount === undefined) {
    diagnostics.push({
      code: `${prefix}_SESSION_TOOL_STEPS_MISSING`,
      message: `${options.runId}: session.toolStepCount is required for the round-5 step budget.`,
      severity: "error",
      suggestedFix: "Record toolStepCount in session.json before scoring or aggregating the run.",
    });
  }
  return diagnostics;
}
