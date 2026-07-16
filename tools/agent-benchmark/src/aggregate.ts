import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { getProofContract, requiredAssertionIds, validateProofResult } from "./proof-contract.js";
import { isBenchmarkRunReport } from "./schemas.js";
import { sessionMetricEvidenceDiagnostics } from "./session-evidence.js";
import { type BenchmarkCondition, type BenchmarkPromptClass, type IBenchmarkBehaviorBudgetRun, type IBenchmarkBehaviorCounters, type IBenchmarkChurnCounters, type IBenchmarkDiagnostic, type IBenchmarkReport, type IBenchmarkRunReport } from "./types.js";

const CACHED_INPUT_TOKEN_WEIGHT = 0.1;
const EQUAL_PROOF_CONTINUITY_RATIO = 1.5;
const EQUAL_PROOF_BEYOND_ONE_SHOT_RATIO = 1.0;
const MIN_REPEATS_PER_CONDITION = 3;
const FAILED_COMMAND_BUDGET = 0;
const IDENTICAL_ASSERTION_REPEAT_BUDGET = 0;
const MAX_CONSECUTIVE_SAME_DIAGNOSTIC_BUDGET = 1;
const THREENATIVE_STEP_BUDGET = 15;
const MAX_RUN_TOKENS = 300_000;
const MAX_THREENATIVE_FAILED_COMMANDS = 2;
const MAX_THREENATIVE_TOOL_STEPS = 25;
const OFF_RECIPE_GATE_PROMPTS = new Set(["grid-push-puzzle", "wave-defense", "turn-based-tactics"]);

interface IRunWithBehavior {
  behavior?: IBenchmarkBehaviorCounters & {
    commands: {
      artifactForensics: string[];
      discovery: string[];
      engineSourceSearch: string[];
      iterate: string[];
      repeatedFileRead: string[];
      standaloneVerify: string[];
    };
  };
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
    const promptContract = getProofContract(promptId);
    const promptRunsWithProofDiagnostics = runs.filter((run) => run.report.promptId === promptId);
    for (const run of promptRunsWithProofDiagnostics) {
      diagnostics.push(...validateProofResult(run.report.promptId, run.report.proof));
      diagnostics.push(...sessionMetricDiagnostics(run.report));
    }
    const threenativeRuns = runs.filter((run) => run.report.promptId === promptId && run.report.condition === "threenative" && runAdmissible(run.report));
    const typedSpecRuns = runs.filter((run) => run.report.promptId === promptId && run.report.condition === "typed-spec" && runAdmissible(run.report));
    const vanillaRuns = runs.filter((run) => run.report.promptId === promptId && run.report.condition === "vanilla" && runAdmissible(run.report));
    const threenativeMedianTokens = metricMedian(threenativeRuns, (run) => run.session.tokenCount);
    const vanillaMedianTokens = metricMedian(vanillaRuns, (run) => run.session.tokenCount);
    const threenativeMedianCostWeightedTokens = metricMedian(threenativeRuns, costWeightedTokens);
    const vanillaMedianCostWeightedTokens = metricMedian(vanillaRuns, costWeightedTokens);
    const threenativeMedianToolStepCount = metricMedian(threenativeRuns, (run) => run.session.toolStepCount);
    const vanillaMedianToolStepCount = metricMedian(vanillaRuns, (run) => run.session.toolStepCount);
    const threenativeMedianFailedCommandCount = metricMedian(threenativeRuns, (run) => run.session.failedCommandCount);
    const threenativeMedianIdenticalAssertionRepeats = metricMedian(threenativeRuns, (run) => run.session.identicalAssertionRepeatCount);
    const threenativeMedianMaxSameDiagnostic = metricMedian(threenativeRuns, (run) => run.session.maxConsecutiveSameDiagnostic);
    const typedSpecTrial = typedSpecTrialSummary({
      threenativeMedianFailedCommandCount,
      threenativeMedianIdenticalAssertionRepeats,
      threenativeMedianMaxSameDiagnostic,
      threenativeMedianTokens,
      typedSpecMedianFailedCommandCount: metricMedian(typedSpecRuns, (run) => run.session.failedCommandCount),
      typedSpecMedianIdenticalAssertionRepeats: metricMedian(typedSpecRuns, (run) => run.session.identicalAssertionRepeatCount),
      typedSpecMedianMaxSameDiagnostic: metricMedian(typedSpecRuns, (run) => run.session.maxConsecutiveSameDiagnostic),
      typedSpecMedianTokens: metricMedian(typedSpecRuns, (run) => run.session.tokenCount),
      typedSpecRepeatCount: typedSpecRuns.length,
    });
    const promptRuns = runs.filter((run) => run.report.promptId === promptId).map((run) => run.report);
    const behaviorMedian = {
      artifactForensicsCommandCount: behaviorMedianMetric(threenativeRuns, (behavior) => behavior.artifactForensicsCommandCount),
      discoveryCommandCount: behaviorMedianMetric(threenativeRuns, (behavior) => behavior.discoveryCommandCount),
      engineSourceSearchCommandCount: behaviorMedianMetric(threenativeRuns, (behavior) => behavior.engineSourceSearchCommandCount),
      iterateCommandCount: behaviorMedianMetric(threenativeRuns, (behavior) => behavior.iterateCommandCount),
      standaloneVerifyCommandCount: behaviorMedianMetric(threenativeRuns, (behavior) => behavior.standaloneVerifyCommandCount),
    };
    const behaviorBudgetRuns = promptRunsWithProofDiagnostics.flatMap(behaviorBudgetRun);
    const churnByCondition = churnConditionSummaries(promptRunsWithProofDiagnostics);
    const threenativeChurn = churnByCondition.find((entry) => entry.condition === "threenative");
    const withinChurnMedianBudget = threenativeChurn === undefined
      ? null
      : threenativeChurn.median.artifactForensics === 0
        && threenativeChurn.median.engineSourceSearch === 0
        && threenativeChurn.median.standaloneVerify === 0;
    const withinInstructionAdoptionBudget = instructionAdoptionBudget(behaviorMedian);
    const rawTokenRatio = ratio(threenativeMedianTokens, vanillaMedianTokens);
    const promptClassification: BenchmarkPromptClass | "unknown" = promptContract?.classification ?? "unknown";
    const equalProofRatioBudget = OFF_RECIPE_GATE_PROMPTS.has(promptId) ? 1 : promptClassification === "beyond-one-shot" ? EQUAL_PROOF_BEYOND_ONE_SHOT_RATIO : EQUAL_PROOF_CONTINUITY_RATIO;
    const withinEqualProofTokenBudget = rawTokenRatio === null || promptClassification === "unknown" ? null : rawTokenRatio <= equalProofRatioBudget;
    const costWeightedTokenRatio = ratio(threenativeMedianCostWeightedTokens, vanillaMedianCostWeightedTokens);
    const withinCostWeightedTokenBudget = costWeightedTokenRatio === null || !OFF_RECIPE_GATE_PROMPTS.has(promptId) ? null : costWeightedTokenRatio <= 1;
    const withinFailedCommandBudget = threenativeMedianFailedCommandCount === null ? null : threenativeMedianFailedCommandCount <= FAILED_COMMAND_BUDGET;
    const withinRetryChainBudget = threenativeMedianIdenticalAssertionRepeats === null && threenativeMedianMaxSameDiagnostic === null
      ? null
      : (threenativeMedianIdenticalAssertionRepeats ?? 0) <= IDENTICAL_ASSERTION_REPEAT_BUDGET
        && (threenativeMedianMaxSameDiagnostic ?? 0) <= MAX_CONSECUTIVE_SAME_DIAGNOSTIC_BUDGET;
    const summary = {
      behaviorMedian,
      behaviorBudgetRuns,
      churnByCondition,
      costWeightedTokenRatio,
      dialectConfusionFailures: {
        threenative: dialectConfusionFailureCount(promptRuns.filter((run) => run.condition === "threenative")),
        vanilla: dialectConfusionFailureCount(promptRuns.filter((run) => run.condition === "vanilla")),
      },
      failedCommandMedian: {
        threenative: metricMedian(threenativeRuns, (run) => run.session.failedCommandCount),
        vanilla: metricMedian(vanillaRuns, (run) => run.session.failedCommandCount),
      },
      humanRubricMedian: {
        threenative: {
          playability: metricMedian(threenativeRuns, (run) => run.session.humanRubric.playability),
          visual: metricMedian(threenativeRuns, (run) => run.session.humanRubric.visual),
        },
        vanilla: {
          playability: metricMedian(vanillaRuns, (run) => run.session.humanRubric.playability),
          visual: metricMedian(vanillaRuns, (run) => run.session.humanRubric.visual),
        },
      },
      iterationMedian: {
        threenative: metricMedian(threenativeRuns, (run) => run.session.iterationCount),
        vanilla: metricMedian(vanillaRuns, (run) => run.session.iterationCount),
      },
      promptId,
      promptClassification,
      proofBar: {
        requiredAssertions: requiredAssertionIds(promptId),
        typedSpecPassed: typedSpecRuns.length > 0,
        threenativePassed: threenativeRuns.length > 0,
        vanillaPassed: vanillaRuns.length > 0,
      },
      rawTokenRatio,
      repeatCount: {
        threenative: threenativeRuns.length,
        vanilla: vanillaRuns.length,
      },
      threenativeMedianCachedInputTokens: metricMedian(threenativeRuns, (run) => run.session.cachedInputTokens),
      threenativeMedianCostWeightedTokens,
      threenativeMedianFailedCommandCount,
      threenativeMedianInputTokens: metricMedian(threenativeRuns, (run) => run.session.inputTokens),
      threenativeMedianIterations: metricMedian(threenativeRuns, (run) => run.session.iterationCount),
      threenativeMedianOutputTokens: metricMedian(threenativeRuns, (run) => run.session.outputTokens),
      threenativeMedianToolStepCount,
      threenativeMedianTokens,
      threenativeMedianToolOutputBytes: metricMedian(threenativeRuns, (run) => run.session.toolOutputBytes),
      threenativeMedianUncachedInputTokens: metricMedian(threenativeRuns, (run) => run.session.uncachedInputTokens),
      typedSpecTrial,
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
      withinEqualProofTokenBudget,
      withinCostWeightedTokenBudget,
      withinChurnMedianBudget,
      withinFailedCommandBudget,
      withinInstructionAdoptionBudget,
      withinRepeatBudget: threenativeRuns.length >= MIN_REPEATS_PER_CONDITION && vanillaRuns.length >= MIN_REPEATS_PER_CONDITION,
      withinPerRunBudget: OFF_RECIPE_GATE_PROMPTS.has(promptId) ? promptRunsWithProofDiagnostics.every((run) => sessionLimitDiagnostics(run.report).length === 0) : null,
      withinRetryChainBudget,
      withinRubricBudget: OFF_RECIPE_GATE_PROMPTS.has(promptId) ? rubricBudget(threenativeRuns, vanillaRuns) : null,
      withinStepBudget: threenativeMedianToolStepCount === null ? null : threenativeMedianToolStepCount <= THREENATIVE_STEP_BUDGET,
    };
    diagnostics.push(...matrixDiagnostics(summary));
    diagnostics.push(...behaviorBudgetRuns.flatMap((run) => run.diagnostics));
    return summary;
  });
  const comparable = promptSummaries.filter((summary) => summary.withinEqualProofTokenBudget !== null);
  const failed = comparable.filter((summary) =>
    summary.withinEqualProofTokenBudget === false
    || summary.withinCostWeightedTokenBudget === false
    || summary.withinChurnMedianBudget === false
    || summary.withinRepeatBudget === false
    || summary.withinStepBudget === false
    || summary.withinFailedCommandBudget === false
    || summary.withinRetryChainBudget === false
    || summary.withinInstructionAdoptionBudget === false
    || summary.withinPerRunBudget === false
    || summary.withinRubricBudget === false
    || summary.behaviorBudgetRuns.some((run) => !run.withinBudget)
  );
  const hasErrorDiagnostics = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const hasRunLimitError = diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_BENCH_RUN_") && diagnostic.severity === "error");
  const status = comparable.length === 0 ? hasRunLimitError ? "fail" : "insufficient-data" : failed.length === 0 && !hasErrorDiagnostics ? "pass" : "fail";
  const typedSpecVerdict = typedSpecAggregateVerdict(promptSummaries);
  const summary = status === "insufficient-data"
    ? "No prompt has equal-proof successful run reports for both vanilla and ThreeNative."
    : status === "pass"
      ? "ThreeNative equal-proof median tokens are within continuity/beyond-one-shot thresholds, repeats are >=3, and step/failure/retry budgets are within limits."
      : "ThreeNative equal-proof median tokens exceed the prompt threshold, repeats are below three, or step/failure/retry budgets exceeded limits.";
  return {
    diagnostics,
    generatedAt: new Date().toISOString(),
    promptSummaries,
    runCount: runs.length,
    schema: "threenative.agent-benchmark-report",
    dialectConfusionFailureCount: dialectConfusionFailureCount(runs.map((run) => run.report)),
    typedSpecVerdict,
    verdict: {
      status,
      summary,
      threshold: "equal-proof: continuity <=1.5x vanilla tokens; beyond-one-shot <=1.0x vanilla tokens; repeats >=3; failed commands ==0; retry chains <=1/0",
    },
    version: 2,
  };
}

export async function readBehaviorBudgetRun(runReportPath: string, report: IBenchmarkRunReport): Promise<IBenchmarkBehaviorBudgetRun | undefined> {
  return behaviorBudgetRun({ behavior: await readBehaviorCounters(runReportPath), report })[0];
}

function matrixDiagnostics(summary: IBenchmarkReport["promptSummaries"][number]): IBenchmarkDiagnostic[] {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (summary.repeatCount.threenative < MIN_REPEATS_PER_CONDITION) {
    diagnostics.push({
      code: "TN_BENCH_MATRIX_THREENATIVE_REPEATS_MISSING",
      message: `${summary.promptId}: direct ThreeNative has ${summary.repeatCount.threenative} proof-passing repeat(s); ${MIN_REPEATS_PER_CONDITION} required.`,
      severity: "warning",
      suggestedFix: "Run fresh direct ThreeNative agent sessions under the round-5 protocol and score each candidate.",
    });
  }
  if (summary.repeatCount.vanilla < MIN_REPEATS_PER_CONDITION) {
    diagnostics.push({
      code: "TN_BENCH_MATRIX_VANILLA_REPEATS_MISSING",
      message: `${summary.promptId}: vanilla has ${summary.repeatCount.vanilla} proof-passing repeat(s); ${MIN_REPEATS_PER_CONDITION} required.`,
      severity: "warning",
      suggestedFix: "Run fresh vanilla agent sessions under the round-5 equal-proof protocol and score each candidate.",
    });
  }
  if (summary.proofBar.typedSpecPassed && summary.typedSpecTrial.repeatCount < MIN_REPEATS_PER_CONDITION) {
    diagnostics.push({
      code: "TN_BENCH_MATRIX_TYPED_SPEC_REPEATS_MISSING",
      message: `${summary.promptId}: typed-spec has ${summary.typedSpecTrial.repeatCount} proof-passing repeat(s); ${MIN_REPEATS_PER_CONDITION} required for the typed-spec trial.`,
      severity: "warning",
      suggestedFix: "Run fresh typed-spec agent sessions under the same prompt/proof contract and score each candidate.",
    });
  }
  return diagnostics;
}

function behaviorBudgetRun(run: IRunWithBehavior): IBenchmarkBehaviorBudgetRun[] {
  if (run.report.condition !== "threenative" && run.report.condition !== "typed-spec") {
    return [];
  }
  if (run.behavior === undefined && run.report.session.churnCounters === undefined) {
    return [];
  }
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const counters: IBenchmarkBehaviorCounters = {
    artifactForensicsCommandCount: run.behavior?.artifactForensicsCommandCount ?? 0,
    discoveryCommandCount: run.behavior?.discoveryCommandCount ?? 0,
    engineSourceSearchCommandCount: run.behavior?.engineSourceSearchCommandCount ?? 0,
    iterateCommandCount: run.behavior?.iterateCommandCount ?? 0,
    standaloneVerifyCommandCount: run.behavior?.standaloneVerifyCommandCount ?? 0,
  };
  const churnCounters = normalizedChurnCounters(run, counters);
  if (churnCounters.engineSourceSearch !== 0) {
    diagnostics.push(churnDiagnostic("TN_BENCH_CHURN_ENGINE_SOURCE_SEARCH_EXCEEDED", run, churnCounters.engineSourceSearch, "engine-source search", run.behavior?.commands.engineSourceSearch ?? [], "Add or improve a command/API card/diagnostic so agents do not need to inspect engine source."));
  }
  if (churnCounters.standaloneVerify !== 0) {
    diagnostics.push(churnDiagnostic("TN_BENCH_CHURN_STANDALONE_VERIFY_EXCEEDED", run, churnCounters.standaloneVerify, "standalone verify", run.behavior?.commands.standaloneVerify ?? [], "Route validation/build/playtest proof through one tn iterate command or extend iterate to cover the missing proof."));
  }
  if (churnCounters.artifactForensics !== 0) {
    diagnostics.push(churnDiagnostic("TN_BENCH_CHURN_FORENSICS_EXCEEDED", run, churnCounters.artifactForensics, "artifact forensics", run.behavior?.commands.artifactForensics ?? [], "Move the needed artifact summary into tn iterate output or a playtest diagnostic instead of requiring manual artifact inspection."));
  }
  if (churnCounters.missingIterate !== 0) {
    diagnostics.push(churnDiagnostic("TN_BENCH_CHURN_ITERATE_MISSING", run, churnCounters.missingIterate, "missing iterate", [], "Run the scaffold-first path with tn iterate; if impossible, add the missing iterate scenario or command coverage."));
  }
  if (churnCounters.missingDiscovery !== 0) {
    diagnostics.push(churnDiagnostic("TN_BENCH_CHURN_DISCOVERY_MISSING", run, churnCounters.missingDiscovery, "missing discovery", [], "Start from tn game plan, cookbook, project map, scene inspect, or playtest discovery before authoring."));
  }
  if (churnCounters.repeatedFileRead !== 0) {
    diagnostics.push(churnDiagnostic("TN_BENCH_CHURN_REPEATED_FILE_READ_EXCEEDED", run, churnCounters.repeatedFileRead, "repeated file read", run.behavior?.commands.repeatedFileRead ?? [], "Add a compact command/API card/diagnostic so the agent does not reread the same file repeatedly."));
  }
  if (churnCounters.failedCommand !== 0) {
    diagnostics.push(churnDiagnostic("TN_BENCH_CHURN_FAILED_COMMAND_EXCEEDED", run, churnCounters.failedCommand, "failed command", [], "Fix the first failing command or make the command diagnostic prescriptive enough to avoid retry churn."));
  }
  if (churnCounters.repeatedAssertion !== 0) {
    diagnostics.push(churnDiagnostic("TN_BENCH_CHURN_REPEATED_ASSERTION_EXCEEDED", run, churnCounters.repeatedAssertion, "repeated assertion", [], "Change the scenario, command, or diagnostic so identical failing assertions are repaired before rerun."));
  }
  if (churnCounters.repeatedDiagnostic !== 0) {
    diagnostics.push(churnDiagnostic("TN_BENCH_CHURN_REPEATED_DIAGNOSTIC_EXCEEDED", run, churnCounters.repeatedDiagnostic, "repeated diagnostic", [], "Make the diagnostic's suggested fix exact enough that agents do not rerun the same failure chain."));
  }
  return [{
    condition: run.report.condition,
    counters,
    churnCounters,
    diagnostics,
    offendingCommands: {
      artifactForensics: run.behavior?.commands.artifactForensics ?? [],
      engineSourceSearch: run.behavior?.commands.engineSourceSearch ?? [],
      repeatedFileRead: run.behavior?.commands.repeatedFileRead ?? [],
      standaloneVerify: run.behavior?.commands.standaloneVerify ?? [],
    },
    runId: run.report.runId,
    withinBudget: diagnostics.length === 0,
  }];
}

function normalizedChurnCounters(run: IRunWithBehavior, counters: IBenchmarkBehaviorCounters): IBenchmarkChurnCounters {
  if (run.report.session.churnCounters !== undefined) {
    return run.report.session.churnCounters;
  }
  return {
    artifactForensics: Math.max(0, counters.artifactForensicsCommandCount - 1),
    engineSourceSearch: counters.engineSourceSearchCommandCount,
    failedCommand: run.report.session.failedCommandCount ?? 0,
    missingDiscovery: counters.discoveryCommandCount < 1 ? 1 : 0,
    missingIterate: counters.iterateCommandCount < 1 ? 1 : 0,
    repeatedAssertion: run.report.session.identicalAssertionRepeatCount ?? 0,
    repeatedDiagnostic: Math.max(0, (run.report.session.maxConsecutiveSameDiagnostic ?? 0) - MAX_CONSECUTIVE_SAME_DIAGNOSTIC_BUDGET),
    repeatedFileRead: run.behavior?.commands.repeatedFileRead.length ?? 0,
    standaloneVerify: counters.standaloneVerifyCommandCount,
  };
}

function churnDiagnostic(
  code: IBenchmarkDiagnostic["code"],
  run: IRunWithBehavior,
  count: number,
  label: string,
  commands: readonly string[],
  suggestedFix: string,
): IBenchmarkDiagnostic {
  const commandText = commands.length === 0 ? "none" : commands.map((command) => `"${command}"`).join("; ");
  return {
    code,
    message: `${run.report.runId}: ${label} budget exceeded with count ${count}. Offending commands: ${commandText}.`,
    severity: "error",
    suggestedFix,
  };
}

function churnConditionSummaries(runs: readonly IRunWithBehavior[]): IBenchmarkReport["promptSummaries"][number]["churnByCondition"] {
  const conditions: Array<Extract<BenchmarkCondition, "threenative" | "typed-spec">> = ["threenative", "typed-spec"];
  return conditions.flatMap((condition) => {
    const churnRuns = runs
      .filter((run) => run.report.condition === condition && (run.behavior !== undefined || run.report.session.churnCounters !== undefined))
      .map((run) => normalizedChurnCounters(run, {
        artifactForensicsCommandCount: run.behavior?.artifactForensicsCommandCount ?? 0,
        discoveryCommandCount: run.behavior?.discoveryCommandCount ?? 0,
        engineSourceSearchCommandCount: run.behavior?.engineSourceSearchCommandCount ?? 0,
        iterateCommandCount: run.behavior?.iterateCommandCount ?? 0,
        standaloneVerifyCommandCount: run.behavior?.standaloneVerifyCommandCount ?? 0,
      }));
    if (churnRuns.length === 0) {
      return [];
    }
    return [{
      condition,
      median: {
        artifactForensics: median(churnRuns.map((counters) => counters.artifactForensics)),
        engineSourceSearch: median(churnRuns.map((counters) => counters.engineSourceSearch)),
        failedCommand: median(churnRuns.map((counters) => counters.failedCommand)),
        missingDiscovery: median(churnRuns.map((counters) => counters.missingDiscovery)),
        missingIterate: median(churnRuns.map((counters) => counters.missingIterate)),
        repeatedAssertion: median(churnRuns.map((counters) => counters.repeatedAssertion)),
        repeatedDiagnostic: median(churnRuns.map((counters) => counters.repeatedDiagnostic)),
        repeatedFileRead: median(churnRuns.map((counters) => counters.repeatedFileRead)),
        standaloneVerify: median(churnRuns.map((counters) => counters.standaloneVerify)),
      },
    }];
  });
}

function typedSpecTrialSummary(options: {
  threenativeMedianFailedCommandCount: number | null;
  threenativeMedianIdenticalAssertionRepeats: number | null;
  threenativeMedianMaxSameDiagnostic: number | null;
  threenativeMedianTokens: number | null;
  typedSpecMedianFailedCommandCount: number | null;
  typedSpecMedianIdenticalAssertionRepeats: number | null;
  typedSpecMedianMaxSameDiagnostic: number | null;
  typedSpecMedianTokens: number | null;
  typedSpecRepeatCount: number;
}): IBenchmarkReport["promptSummaries"][number]["typedSpecTrial"] {
  const rawTokenRatioToThreeNative = ratio(options.typedSpecMedianTokens, options.threenativeMedianTokens);
  const withinTokenBudget = rawTokenRatioToThreeNative === null ? null : rawTokenRatioToThreeNative <= 1;
  const withinFailedCommandBudget = options.typedSpecMedianFailedCommandCount === null ? null : options.typedSpecMedianFailedCommandCount <= FAILED_COMMAND_BUDGET;
  const withinRetryChainBudget = options.typedSpecMedianIdenticalAssertionRepeats === null && options.typedSpecMedianMaxSameDiagnostic === null
    ? null
    : (options.typedSpecMedianIdenticalAssertionRepeats ?? 0) <= IDENTICAL_ASSERTION_REPEAT_BUDGET
      && (options.typedSpecMedianMaxSameDiagnostic ?? 0) <= MAX_CONSECUTIVE_SAME_DIAGNOSTIC_BUDGET;
  const withinRepeatBudget = options.typedSpecRepeatCount >= MIN_REPEATS_PER_CONDITION;
  const hasComparableData = options.typedSpecMedianTokens !== null && options.threenativeMedianTokens !== null;
  const status = !hasComparableData
    ? "insufficient-data"
    : withinRepeatBudget && withinTokenBudget === true && withinFailedCommandBudget !== false && withinRetryChainBudget !== false
      ? "default-candidate"
      : "experimental";
  const summary = status === "insufficient-data"
    ? "No equal-proof typed-spec and direct ThreeNative run reports are available for this prompt."
    : status === "default-candidate"
      ? "Typed-spec meets the default-candidate benchmark against direct ThreeNative for this prompt."
      : "Typed-spec remains experimental for this prompt because repeats, token ratio, failed commands, or retry chains missed the benchmark.";

  return {
    failedCommandDelta: delta(options.typedSpecMedianFailedCommandCount, options.threenativeMedianFailedCommandCount),
    identicalAssertionRepeatDelta: delta(options.typedSpecMedianIdenticalAssertionRepeats, options.threenativeMedianIdenticalAssertionRepeats),
    maxSameDiagnosticDelta: delta(options.typedSpecMedianMaxSameDiagnostic, options.threenativeMedianMaxSameDiagnostic),
    rawTokenRatioToThreeNative,
    repeatCount: options.typedSpecRepeatCount,
    status,
    summary,
    typedSpecMedianFailedCommandCount: options.typedSpecMedianFailedCommandCount,
    typedSpecMedianIdenticalAssertionRepeats: options.typedSpecMedianIdenticalAssertionRepeats,
    typedSpecMedianMaxSameDiagnostic: options.typedSpecMedianMaxSameDiagnostic,
    typedSpecMedianTokens: options.typedSpecMedianTokens,
    withinFailedCommandBudget,
    withinRepeatBudget,
    withinRetryChainBudget,
    withinTokenBudget,
  };
}

function typedSpecAggregateVerdict(promptSummaries: IBenchmarkReport["promptSummaries"]): IBenchmarkReport["typedSpecVerdict"] {
  const comparable = promptSummaries.filter((summary) => summary.typedSpecTrial.status !== "insufficient-data");
  const status = comparable.length === 0
    ? "insufficient-data"
    : comparable.every((summary) => summary.typedSpecTrial.status === "default-candidate")
      ? "default-candidate"
      : "experimental";
  const summary = status === "insufficient-data"
    ? "No prompt has equal-proof typed-spec and direct ThreeNative run reports."
    : status === "default-candidate"
      ? "Typed-spec meets the benchmark for becoming the default starter surface across comparable prompts."
      : "Typed-spec remains experimental because at least one comparable prompt missed the benchmark.";
  return {
    status,
    summary,
    threshold: "typed-spec: equal proof repeats >=3; median tokens <= direct ThreeNative; failed commands ==0; retry chains <=1/0",
  };
}

function runProofOk(run: IBenchmarkRunReport): boolean {
  return validateProofResult(run.promptId, run.proof).length === 0;
}

function runAdmissible(run: IBenchmarkRunReport): boolean {
  return run.ok && runProofOk(run) && sessionMetricDiagnostics(run).length === 0;
}

function sessionMetricDiagnostics(run: IBenchmarkRunReport): IBenchmarkDiagnostic[] {
  return [...sessionMetricEvidenceDiagnostics(run.session, { context: "aggregate", runId: run.runId }), ...sessionLimitDiagnostics(run)];
}

function sessionLimitDiagnostics(run: IBenchmarkRunReport): IBenchmarkDiagnostic[] {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (run.session.tokenCount > MAX_RUN_TOKENS) diagnostics.push({ code: "TN_BENCH_RUN_TOKEN_CAP_EXCEEDED", message: `${run.runId}: ${run.session.tokenCount} raw tokens exceeds the ${MAX_RUN_TOKENS} cap.`, severity: "error" });
  if (run.condition === "threenative" && typeof run.session.failedCommandCount === "number" && run.session.failedCommandCount > MAX_THREENATIVE_FAILED_COMMANDS) diagnostics.push({ code: "TN_BENCH_RUN_FAILED_COMMAND_CAP_EXCEEDED", message: `${run.runId}: ${run.session.failedCommandCount} failed commands exceeds the ${MAX_THREENATIVE_FAILED_COMMANDS} cap.`, severity: "error" });
  if (run.condition === "threenative" && typeof run.session.toolStepCount === "number" && run.session.toolStepCount > MAX_THREENATIVE_TOOL_STEPS) diagnostics.push({ code: "TN_BENCH_RUN_TOOL_STEP_CAP_EXCEEDED", message: `${run.runId}: ${run.session.toolStepCount} tool steps exceeds the ${MAX_THREENATIVE_TOOL_STEPS} cap.`, severity: "error" });
  return diagnostics;
}

function rubricBudget(threenativeRuns: readonly IRunWithBehavior[], vanillaRuns: readonly IRunWithBehavior[]): boolean {
  return [threenativeRuns, vanillaRuns].every((conditionRuns) => {
    const playability = metricMedian(conditionRuns, (run) => run.session.humanRubric.playability);
    const visual = metricMedian(conditionRuns, (run) => run.session.humanRubric.visual);
    return playability !== null && playability >= 2 && visual !== null && visual >= 2;
  });
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

function behaviorMedianMetric(runs: readonly IRunWithBehavior[], read: (behavior: NonNullable<IRunWithBehavior["behavior"]>) => number): number | null {
  return median(runs.map((run) => run.behavior).filter((behavior): behavior is NonNullable<IRunWithBehavior["behavior"]> => behavior !== undefined).map(read));
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

async function readBehaviorCounters(runReportPath: string): Promise<IRunWithBehavior["behavior"] | undefined> {
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
  const artifactForensics = commands.filter(isArtifactForensicsCommand);
  const discovery = commands.filter(isDiscoveryCommand);
  const engineSourceSearch = commands.filter(isEngineSourceSearchCommand);
  const iterate = commands.filter(isIterateCommand);
  const repeatedFileRead = repeatedFileReadCommands(commands);
  const standaloneVerify = commands.filter(isStandaloneVerifyCommand);
  return {
    artifactForensicsCommandCount: artifactForensics.length,
    commands: {
      artifactForensics,
      discovery,
      engineSourceSearch,
      iterate,
      repeatedFileRead,
      standaloneVerify,
    },
    discoveryCommandCount: discovery.length,
    engineSourceSearchCommandCount: engineSourceSearch.length,
    iterateCommandCount: iterate.length,
    standaloneVerifyCommandCount: standaloneVerify.length,
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
    if (!isRecord(parsed) || parsed.type !== "item.completed" || !isRecord(parsed.item) || parsed.item.type !== "command_execution") {
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
    || /\btn\s+(?:--\s+)?playtest\s+(?:--discover|--suggest-scenario)\b/.test(command)
    || /packages\/cli\/dist\/index\.js\s+(?:cookbook\b|game\s+plan\b|project\s+map\b|scene\s+inspect\b)/.test(command)
    || /packages\/cli\/dist\/index\.js\s+playtest\b.*(?:--discover|--suggest-scenario)\b/.test(command);
}

function isIterateCommand(command: string): boolean {
  return /\btn\s+(?:--\s+)?iterate\b/.test(command)
    || /packages\/cli\/dist\/index\.js\s+iterate\b/.test(command);
}

function isEngineSourceSearchCommand(command: string): boolean {
  return /\brg\b/.test(command) && /\b(?:packages|runtime-bevy|examples)\//.test(command);
}

function isArtifactForensicsCommand(command: string): boolean {
  return /\b(?:jq|sed|cat|rg)\b/.test(command) && /\bartifacts\//.test(command);
}

function repeatedFileReadCommands(commands: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const command of commands) {
    const target = fileReadTarget(command);
    if (target === undefined) {
      continue;
    }
    if (seen.has(target)) {
      repeated.push(command);
    } else {
      seen.add(target);
    }
  }
  return repeated;
}

function fileReadTarget(command: string): string | undefined {
  const tokens = shellLikeTokens(command);
  const readCommandIndex = tokens.findIndex((token) => token === "cat" || token === "sed" || token === "nl");
  if (readCommandIndex >= 0) {
    return tokens.slice(readCommandIndex + 1).find((token) => looksLikeProjectFile(token));
  }
  const rgIndex = tokens.findIndex((token) => token === "rg");
  if (rgIndex < 0) {
    return undefined;
  }
  return tokens.slice(rgIndex + 1).find((token) => looksLikeProjectFile(token));
}

function looksLikeProjectFile(token: string): boolean {
  return /^(?:content|docs|examples|packages|runtime-bevy|src|tools)\//.test(token)
    || /^[\w.-]+\.(?:json|md|ts|tsx|js|mjs|rs|toml|yaml|yml)$/.test(token);
}

function shellLikeTokens(command: string): string[] {
  return command.match(/"[^"]+"|'[^']+'|\S+/g)?.map((token) => token.replace(/^["']|["']$/g, "")) ?? [];
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

function delta(left: number | null, right: number | null): number | null {
  if (left === null || right === null) {
    return null;
  }
  return left - right;
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
