import { readFile } from "node:fs/promises";

import { isBenchmarkRunReport } from "./schemas.js";
import { type IBenchmarkDiagnostic, type IBenchmarkReport, type IBenchmarkRunReport } from "./types.js";

const CACHED_INPUT_TOKEN_WEIGHT = 0.1;

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
    const threenativeRuns = runs.filter((run) => run.promptId === promptId && run.condition === "threenative" && run.ok);
    const vanillaRuns = runs.filter((run) => run.promptId === promptId && run.condition === "vanilla" && run.ok);
    const threenativeMedianTokens = metricMedian(threenativeRuns, (run) => run.session.tokenCount);
    const vanillaMedianTokens = metricMedian(vanillaRuns, (run) => run.session.tokenCount);
    const threenativeMedianCostWeightedTokens = metricMedian(threenativeRuns, costWeightedTokens);
    const vanillaMedianCostWeightedTokens = metricMedian(vanillaRuns, costWeightedTokens);
    return {
      costWeightedTokenRatio: ratio(threenativeMedianCostWeightedTokens, vanillaMedianCostWeightedTokens),
      failedCommandMedian: {
        threenative: metricMedian(threenativeRuns, (run) => run.session.failedCommandCount),
        vanilla: metricMedian(vanillaRuns, (run) => run.session.failedCommandCount),
      },
      iterationMedian: {
        threenative: metricMedian(threenativeRuns, (run) => run.session.iterationCount),
        vanilla: metricMedian(vanillaRuns, (run) => run.session.iterationCount),
      },
      promptId,
      rawTokenRatio: ratio(threenativeMedianTokens, vanillaMedianTokens),
      threenativeMedianCachedInputTokens: metricMedian(threenativeRuns, (run) => run.session.cachedInputTokens),
      threenativeMedianCostWeightedTokens,
      threenativeMedianFailedCommandCount: metricMedian(threenativeRuns, (run) => run.session.failedCommandCount),
      threenativeMedianInputTokens: metricMedian(threenativeRuns, (run) => run.session.inputTokens),
      threenativeMedianIterations: metricMedian(threenativeRuns, (run) => run.session.iterationCount),
      threenativeMedianOutputTokens: metricMedian(threenativeRuns, (run) => run.session.outputTokens),
      threenativeMedianTokens,
      threenativeMedianToolOutputBytes: metricMedian(threenativeRuns, (run) => run.session.toolOutputBytes),
      threenativeMedianUncachedInputTokens: metricMedian(threenativeRuns, (run) => run.session.uncachedInputTokens),
      toolOutputMedian: {
        threenative: metricMedian(threenativeRuns, (run) => run.session.toolOutputBytes),
        vanilla: metricMedian(vanillaRuns, (run) => run.session.toolOutputBytes),
      },
      vanillaMedianCachedInputTokens: metricMedian(vanillaRuns, (run) => run.session.cachedInputTokens),
      vanillaMedianCostWeightedTokens,
      vanillaMedianFailedCommandCount: metricMedian(vanillaRuns, (run) => run.session.failedCommandCount),
      vanillaMedianInputTokens: metricMedian(vanillaRuns, (run) => run.session.inputTokens),
      vanillaMedianIterations: metricMedian(vanillaRuns, (run) => run.session.iterationCount),
      vanillaMedianOutputTokens: metricMedian(vanillaRuns, (run) => run.session.outputTokens),
      vanillaMedianTokens,
      vanillaMedianToolOutputBytes: metricMedian(vanillaRuns, (run) => run.session.toolOutputBytes),
      vanillaMedianUncachedInputTokens: metricMedian(vanillaRuns, (run) => run.session.uncachedInputTokens),
      withinHalfX: threenativeMedianTokens === null || vanillaMedianTokens === null ? null : threenativeMedianTokens <= vanillaMedianTokens * 0.5,
    };
  });
  const comparable = promptSummaries.filter((summary) => summary.withinHalfX !== null);
  const failed = comparable.filter((summary) => summary.withinHalfX === false);
  const status = comparable.length === 0 ? "insufficient-data" : failed.length === 0 ? "pass" : "fail";
  const summary = status === "insufficient-data"
    ? "No prompt has successful run reports for both vanilla and ThreeNative."
    : status === "pass"
      ? "ThreeNative raw median tokens are <=0.5x vanilla for every comparable prompt."
      : "ThreeNative raw median tokens exceed 0.5x vanilla for at least one comparable prompt.";
  return {
    diagnostics,
    generatedAt: new Date().toISOString(),
    promptSummaries,
    runCount: runs.length,
    schema: "threenative.agent-benchmark-report",
    verdict: {
      status,
      summary,
      threshold: "threenative-median-tokens <= 0.5x vanilla-median-tokens",
    },
    version: 2,
  };
}

function metricMedian(runs: readonly IBenchmarkRunReport[], read: (run: IBenchmarkRunReport) => number | undefined): number | null {
  return median(runs.map(read).filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
}

function costWeightedTokens(run: IBenchmarkRunReport): number {
  if (typeof run.session.costWeightedTokens === "number") {
    return run.session.costWeightedTokens;
  }
  const uncached = run.session.uncachedInputTokens ?? run.session.inputTokens ?? run.session.tokenCount;
  const cached = run.session.cachedInputTokens ?? 0;
  const output = run.session.outputTokens ?? 0;
  return uncached + (cached * CACHED_INPUT_TOKEN_WEIGHT) + output;
}

function ratio(left: number | null, right: number | null): number | null {
  if (left === null || right === null || right === 0) {
    return null;
  }
  return left / right;
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
