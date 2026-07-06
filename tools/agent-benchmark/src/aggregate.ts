import { readFile } from "node:fs/promises";

import { isBenchmarkRunReport } from "./schemas.js";
import { type IBenchmarkDiagnostic, type IBenchmarkReport, type IBenchmarkRunReport } from "./types.js";

export async function aggregateRunReports(paths: readonly string[]): Promise<IBenchmarkReport> {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const runs: IBenchmarkRunReport[] = [];
  for (const path of paths) {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
      if (isBenchmarkRunReport(parsed)) {
        runs.push(parsed);
      } else {
        diagnostics.push({ code: "TN_BENCH_AGGREGATE_INVALID_RUN", message: `Run report failed schema validation: ${path}.`, severity: "error" });
      }
    } catch (error) {
      diagnostics.push({
        code: "TN_BENCH_AGGREGATE_READ_FAILED",
        message: `Unable to read run report ${path}: ${error instanceof Error ? error.message : String(error)}.`,
        severity: "error",
      });
    }
  }
  const promptIds = Array.from(new Set(runs.map((run) => run.promptId))).sort();
  const promptSummaries = promptIds.map((promptId) => {
    const threenativeMedianTokens = median(runs.filter((run) => run.promptId === promptId && run.condition === "threenative" && run.ok).map((run) => run.session.tokenCount));
    const vanillaMedianTokens = median(runs.filter((run) => run.promptId === promptId && run.condition === "vanilla" && run.ok).map((run) => run.session.tokenCount));
    return {
      promptId,
      threenativeMedianTokens,
      vanillaMedianTokens,
      withinTwoX: threenativeMedianTokens === null || vanillaMedianTokens === null ? null : threenativeMedianTokens <= vanillaMedianTokens * 2,
    };
  });
  const comparable = promptSummaries.filter((summary) => summary.withinTwoX !== null);
  const failed = comparable.filter((summary) => summary.withinTwoX === false);
  const status = comparable.length === 0 ? "insufficient-data" : failed.length === 0 ? "pass" : "fail";
  const summary = status === "insufficient-data"
    ? "No prompt has successful run reports for both vanilla and ThreeNative."
    : status === "pass"
      ? "ThreeNative is within 2x vanilla median tokens for every comparable prompt."
      : "ThreeNative exceeds 2x vanilla median tokens for at least one comparable prompt.";
  return {
    diagnostics,
    generatedAt: new Date().toISOString(),
    promptSummaries,
    runCount: runs.length,
    schema: "threenative.agent-benchmark-report",
    verdict: {
      status,
      summary,
      threshold: "threenative-median-tokens <= 2x vanilla-median-tokens",
    },
    version: 1,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const current = sorted[middle];
  if (current === undefined) {
    return null;
  }
  if (sorted.length % 2 === 1) {
    return current;
  }
  const previous = sorted[middle - 1] ?? current;
  return (previous + current) / 2;
}
