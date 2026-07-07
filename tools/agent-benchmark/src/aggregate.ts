import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { isBenchmarkRunReport } from "./schemas.js";
import { type IBenchmarkBehaviorCounters, type IBenchmarkDiagnostic, type IBenchmarkReport, type IBenchmarkRunReport } from "./types.js";

const CACHED_INPUT_TOKEN_WEIGHT = 0.1;
const THREENATIVE_STEP_BUDGET = 30;

interface IRunWithBehavior {
  behavior?: IBenchmarkBehaviorCounters;
  report: IBenchmarkRunReport;
}

export async function aggregateRunReports(paths: readonly string[]): Promise<IBenchmarkReport> {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const runs: IRunWithBehavior[] = [];
  for (const path of paths) {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
      if (isBenchmarkRunReport(parsed)) {
        runs.push({ behavior: await readBehaviorCounters(path), report: parsed });
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
  const promptIds = Array.from(new Set(runs.map((run) => run.report.promptId))).sort();
  const promptSummaries = promptIds.map((promptId) => {
    const threenativeRuns = runs.filter((run) => run.report.promptId === promptId && run.report.condition === "threenative" && run.report.ok);
    const vanillaRuns = runs.filter((run) => run.report.promptId === promptId && run.report.condition === "vanilla" && run.report.ok);
    const threenativeMedianTokens = metricMedian(threenativeRuns, (run) => run.session.tokenCount);
    const vanillaMedianTokens = metricMedian(vanillaRuns, (run) => run.session.tokenCount);
    const threenativeMedianCostWeightedTokens = metricMedian(threenativeRuns, costWeightedTokens);
    const vanillaMedianCostWeightedTokens = metricMedian(vanillaRuns, costWeightedTokens);
    const threenativeMedianToolStepCount = metricMedian(threenativeRuns, (run) => run.session.toolStepCount);
    const vanillaMedianToolStepCount = metricMedian(vanillaRuns, (run) => run.session.toolStepCount);
    const promptRuns = runs.filter((run) => run.report.promptId === promptId).map((run) => run.report);
    const behaviorMedian = {
      artifactForensicsCommandCount: behaviorMedianMetric(threenativeRuns, (behavior) => behavior.artifactForensicsCommandCount),
      discoveryCommandCount: behaviorMedianMetric(threenativeRuns, (behavior) => behavior.discoveryCommandCount),
      engineSourceSearchCommandCount: behaviorMedianMetric(threenativeRuns, (behavior) => behavior.engineSourceSearchCommandCount),
      iterateCommandCount: behaviorMedianMetric(threenativeRuns, (behavior) => behavior.iterateCommandCount),
      standaloneVerifyCommandCount: behaviorMedianMetric(threenativeRuns, (behavior) => behavior.standaloneVerifyCommandCount),
    };
    const withinInstructionAdoptionBudget = instructionAdoptionBudget(behaviorMedian);
    return {
      behaviorMedian,
      costWeightedTokenRatio: ratio(threenativeMedianCostWeightedTokens, vanillaMedianCostWeightedTokens),
      dialectConfusionFailures: {
        threenative: dialectConfusionFailureCount(promptRuns.filter((run) => run.condition === "threenative")),
        vanilla: dialectConfusionFailureCount(promptRuns.filter((run) => run.condition === "vanilla")),
      },
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
      threenativeMedianToolStepCount,
      threenativeMedianTokens,
      threenativeMedianToolOutputBytes: metricMedian(threenativeRuns, (run) => run.session.toolOutputBytes),
      threenativeMedianUncachedInputTokens: metricMedian(threenativeRuns, (run) => run.session.uncachedInputTokens),
      toolOutputMedian: {
        threenative: metricMedian(threenativeRuns, (run) => run.session.toolOutputBytes),
        vanilla: metricMedian(vanillaRuns, (run) => run.session.toolOutputBytes),
      },
      toolStepMedian: {
        threenative: threenativeMedianToolStepCount,
        vanilla: vanillaMedianToolStepCount,
      },
      vanillaMedianCachedInputTokens: metricMedian(vanillaRuns, (run) => run.session.cachedInputTokens),
      vanillaMedianCostWeightedTokens,
      vanillaMedianFailedCommandCount: metricMedian(vanillaRuns, (run) => run.session.failedCommandCount),
      vanillaMedianInputTokens: metricMedian(vanillaRuns, (run) => run.session.inputTokens),
      vanillaMedianIterations: metricMedian(vanillaRuns, (run) => run.session.iterationCount),
      vanillaMedianOutputTokens: metricMedian(vanillaRuns, (run) => run.session.outputTokens),
      vanillaMedianToolStepCount,
      vanillaMedianTokens,
      vanillaMedianToolOutputBytes: metricMedian(vanillaRuns, (run) => run.session.toolOutputBytes),
      vanillaMedianUncachedInputTokens: metricMedian(vanillaRuns, (run) => run.session.uncachedInputTokens),
      withinHalfX: threenativeMedianTokens === null || vanillaMedianTokens === null ? null : threenativeMedianTokens <= vanillaMedianTokens * 0.5,
      withinInstructionAdoptionBudget,
      withinStepBudget: threenativeMedianToolStepCount === null ? null : threenativeMedianToolStepCount <= THREENATIVE_STEP_BUDGET,
    };
  });
  const comparable = promptSummaries.filter((summary) => summary.withinHalfX !== null);
  const failed = comparable.filter((summary) => summary.withinHalfX === false || summary.withinStepBudget === false || summary.withinInstructionAdoptionBudget === false);
  const status = comparable.length === 0 ? "insufficient-data" : failed.length === 0 ? "pass" : "fail";
  const summary = status === "insufficient-data"
    ? "No prompt has successful run reports for both vanilla and ThreeNative."
    : status === "pass"
      ? "ThreeNative raw median tokens are <=0.5x vanilla for every comparable prompt, present step-count medians are within budget, and present instruction-adoption counters are within budget."
      : "ThreeNative raw median tokens exceed 0.5x vanilla, present step-count medians exceed budget, or present instruction-adoption counters miss budget for at least one comparable prompt.";
  return {
    diagnostics,
    generatedAt: new Date().toISOString(),
    promptSummaries,
    runCount: runs.length,
    schema: "threenative.agent-benchmark-report",
    dialectConfusionFailureCount: dialectConfusionFailureCount(runs.map((run) => run.report)),
    verdict: {
      status,
      summary,
      threshold: "threenative-median-tokens <= 0.5x vanilla-median-tokens",
    },
    version: 2,
  };
}

function dialectConfusionFailureCount(runs: readonly IBenchmarkRunReport[]): number {
  return runs.filter((run) => run.diagnostics.some(isDialectConfusionDiagnostic)).length;
}

function isDialectConfusionDiagnostic(diagnostic: IBenchmarkDiagnostic): boolean {
  return diagnostic.code === "TN_BENCH_DIALECT_CONFUSION"
    || diagnostic.code === "TN_SCRIPT_LEGACY_IDIOM"
    || /\bdialect[- ]confusion\b/i.test(diagnostic.message);
}

function metricMedian(runs: readonly IRunWithBehavior[], read: (run: IBenchmarkRunReport) => number | undefined): number | null {
  return median(runs.map((run) => read(run.report)).filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
}

function behaviorMedianMetric(runs: readonly IRunWithBehavior[], read: (behavior: IBenchmarkBehaviorCounters) => number): number | null {
  return median(runs.map((run) => run.behavior).filter((behavior): behavior is IBenchmarkBehaviorCounters => behavior !== undefined).map(read));
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

function instructionAdoptionBudget(behavior: {
  artifactForensicsCommandCount: number | null;
  discoveryCommandCount: number | null;
  engineSourceSearchCommandCount: number | null;
  iterateCommandCount: number | null;
  standaloneVerifyCommandCount: number | null;
}): boolean | null {
  if (Object.values(behavior).every((value) => value === null)) {
    return null;
  }
  return (behavior.standaloneVerifyCommandCount ?? 0) === 0
    && (behavior.artifactForensicsCommandCount ?? 0) === 0
    && (behavior.engineSourceSearchCommandCount ?? 0) === 0
    && (behavior.discoveryCommandCount ?? 0) >= 1
    && (behavior.iterateCommandCount ?? 0) >= 1;
}

async function readBehaviorCounters(runReportPath: string): Promise<IBenchmarkBehaviorCounters | undefined> {
  const eventsPath = await findEventsPath(runReportPath);
  if (eventsPath === undefined) {
    return undefined;
  }
  let raw = "";
  try {
    raw = await readFile(eventsPath, "utf8");
  } catch {
    return undefined;
  }
  const commands = raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map(commandFromEvent)
    .filter((command): command is string => command !== undefined);
  return {
    artifactForensicsCommandCount: commands.filter(isArtifactForensicsCommand).length,
    discoveryCommandCount: commands.filter(isDiscoveryCommand).length,
    engineSourceSearchCommandCount: commands.filter(isEngineSourceSearchCommand).length,
    iterateCommandCount: commands.filter((command) => /\btn\s+(?:--\s+)?iterate\b/.test(command)).length,
    standaloneVerifyCommandCount: commands.filter(isStandaloneVerifyCommand).length,
  };
}

async function findEventsPath(runReportPath: string): Promise<string | undefined> {
  const adjacent = resolve(dirname(runReportPath), "codex-events.jsonl");
  try {
    await readFile(adjacent, "utf8");
    return adjacent;
  } catch {
    // Try the benchmark scorer layout: <round>/<runId>/run-report.json with
    // source events under <round>/candidates/<runId>/codex-events.jsonl.
  }
  const runId = dirname(runReportPath).split(/[\\/]/).pop();
  if (runId === undefined || runId === "") {
    return undefined;
  }
  const candidateEvents = resolve(dirname(runReportPath), "..", "candidates", runId, "codex-events.jsonl");
  try {
    await readFile(candidateEvents, "utf8");
    return candidateEvents;
  } catch {
    return undefined;
  }
}

function commandFromEvent(line: string): string | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.item) || parsed.item.type !== "command_execution") {
      return undefined;
    }
    return typeof parsed.item.command === "string" ? parsed.item.command : undefined;
  } catch {
    return undefined;
  }
}

function isStandaloneVerifyCommand(command: string): boolean {
  return /\btn\s+(?:--\s+)?authoring\s+validate\b/.test(command)
    || /\btn\s+(?:--\s+)?build\b/.test(command)
    || (/\btn\s+(?:--\s+)?playtest\b/.test(command) && !/\btn\s+(?:--\s+)?playtest\s+report\b/.test(command) && !/--suggest-scenario\b/.test(command) && !/--discover\b/.test(command))
    || /packages\/cli\/dist\/index\.js\s+(?:authoring\s+validate|build|validate)\b/.test(command)
    || (/packages\/cli\/dist\/index\.js\s+playtest\b/.test(command) && !/packages\/cli\/dist\/index\.js\s+playtest\s+report\b/.test(command));
}

function isDiscoveryCommand(command: string): boolean {
  return /\btn\s+(?:--\s+)?cookbook\b/.test(command)
    || /\btn\s+(?:--\s+)?game\s+plan\b/.test(command)
    || /\btn\s+(?:--\s+)?project\s+map\b/.test(command)
    || /\btn\s+(?:--\s+)?scene\s+inspect\b/.test(command)
    || /\btn\s+(?:--\s+)?playtest\s+(?:--discover|--suggest-scenario)\b/.test(command);
}

function isEngineSourceSearchCommand(command: string): boolean {
  return /\brg\b/.test(command) && /\b(?:packages|runtime-bevy|examples)\//.test(command);
}

function isArtifactForensicsCommand(command: string): boolean {
  return /\b(?:jq|sed|cat|rg)\b/.test(command) && /\bartifacts\//.test(command);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
