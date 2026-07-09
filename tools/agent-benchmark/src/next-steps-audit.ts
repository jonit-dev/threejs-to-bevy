import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { validateRound5Matrix } from "./matrix.js";
import { isBenchmarkReport } from "./schemas.js";
import { inspectPreparedRound, type IPreparedRoundStatus } from "./status.js";
import { type IBenchmarkDiagnostic, type IBenchmarkReport } from "./types.js";

const TYPED_SPEC_RECIPE_ID = "typed-spec-recipe-top-down-collector";
const MAX_ITERATE_OUTPUT_BYTES = 2048;
const MAX_ROUND5_TOOL_STEPS = 30;

export interface INextStepsAuditOptions {
  matrixReportPath: string;
  protocolPath: string;
  root?: string;
  roundManifestPath?: string;
  sessionCostReportPath: string;
}

export interface INextStepsAuditRequirement {
  diagnostics: IBenchmarkDiagnostic[];
  evidence: string[];
  id: string;
  status: "acknowledged" | "complete" | "incomplete";
  title: string;
}

export interface INextStepsAuditResult {
  diagnostics: IBenchmarkDiagnostic[];
  inputs: {
    matrixReportPath: string;
    protocolPath: string;
    root: string;
    roundManifestPath?: string;
    sessionCostReportPath: string;
  };
  ok: boolean;
  requirements: INextStepsAuditRequirement[];
}

interface ISessionCostMeasurement {
  acceptance?: {
    build?: string;
    gamePlanApply?: string;
    manualEdits?: number;
    authoredScenarios?: number;
    playtest?: string;
    scaffold?: string;
    scenario?: string;
  };
  failedCommandCount?: number;
  id: string;
  iterateOutputBytes?: number;
  manualEditCount?: number;
  toolStepCount?: number;
}

export async function auditNextSteps(options: INextStepsAuditOptions): Promise<INextStepsAuditResult> {
  const root = resolve(options.root ?? process.cwd());
  const inputs = {
    matrixReportPath: resolve(options.matrixReportPath),
    protocolPath: resolve(options.protocolPath),
    root,
    roundManifestPath: options.roundManifestPath === undefined ? undefined : resolve(options.roundManifestPath),
    sessionCostReportPath: resolve(options.sessionCostReportPath),
  };
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const requirements: INextStepsAuditRequirement[] = [];

  const matrixReport = await readBenchmarkReport(inputs.matrixReportPath, diagnostics);
  const matrixResult = matrixReport === undefined
    ? { diagnostics: [], ok: false }
    : validateRound5Matrix(matrixReport, { requireTypedSpec: true });
  const roundStatus = inputs.roundManifestPath === undefined
    ? undefined
    : await readRoundStatus(inputs.roundManifestPath, diagnostics);
  const typedSpecRecipe = await readTypedSpecRecipe(inputs.sessionCostReportPath, diagnostics);
  const protocolText = await readText(inputs.protocolPath, diagnostics, "TN_BENCH_NEXT_STEPS_PROTOCOL_READ_FAILED");
  const playtestAssertionsText = await readText(join(root, "packages/cli/src/commands/playtestAssertions.ts"), diagnostics, "TN_BENCH_NEXT_STEPS_SOURCE_READ_FAILED");
  const playtestAssertionsTestText = await readText(join(root, "packages/cli/src/commands/playtestAssertions.test.ts"), diagnostics, "TN_BENCH_NEXT_STEPS_SOURCE_READ_FAILED");
  const apiCardText = await readText(join(root, "tools/verify/src/apiCard.ts"), diagnostics, "TN_BENCH_NEXT_STEPS_SOURCE_READ_FAILED");

  requirements.push(rootCauseRequirement(playtestAssertionsText, playtestAssertionsTestText));
  requirements.push(deterministicFrictionRequirement(typedSpecRecipe));
  requirements.push(churnBudgetRequirement(matrixReport));
  requirements.push(matrixRequirement(matrixResult, roundStatus));
  requirements.push(stepLeverRequirement(typedSpecRecipe, apiCardText));
  requirements.push(decisionRuleRequirement(protocolText));
  requirements.push({
    diagnostics: [],
    evidence: ["NEXT-STEPS-2026-07-07 explicitly keeps humanoid migration, further output compaction, and threshold changes out of scope."],
    id: "out-of-scope-boundary",
    status: "acknowledged",
    title: "Out-of-scope boundary preserved",
  });

  for (const requirement of requirements) {
    diagnostics.push(...requirement.diagnostics);
  }

  return {
    diagnostics,
    inputs,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error") && requirements.every((requirement) => requirement.status !== "incomplete"),
    requirements,
  };
}

function rootCauseRequirement(source: string | undefined, testSource: string | undefined): INextStepsAuditRequirement {
  const evidence: string[] = [];
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (source?.includes("TN_PLAYTEST_RESOURCE_STATE_STAGNATED") === true) {
    evidence.push("playtestAssertions emits TN_PLAYTEST_RESOURCE_STATE_STAGNATED when movement occurs and the asserted resource value does not change.");
  }
  if (source?.includes("effect-log.json") === true && source.includes("observed values stayed")) {
    evidence.push("Diagnostic suggestion names effect-log resource snapshots, observed unchanged values, and owning systems.");
  }
  if (testSource?.includes("TN_PLAYTEST_RESOURCE_STATE_STAGNATED") === true) {
    evidence.push("playtestAssertions tests cover the moved-through-pickup/no-state-change diagnostic class.");
  }
  if (evidence.length < 3) {
    diagnostics.push({
      code: "TN_BENCH_NEXT_STEPS_R3_DIAGNOSTIC_INCOMPLETE",
      message: "The r3 no-state-change playtest diagnostic is not fully evidenced in source and tests.",
      severity: "error",
      suggestedFix: "Add or verify a playtest assertion diagnostic that explains resource state stagnation after scenario movement.",
    });
  }
  return {
    diagnostics,
    evidence,
    id: "r3-proof-failure-diagnostic",
    status: diagnostics.length === 0 ? "complete" : "incomplete",
    title: "r3 proof failure has an actionable diagnostic",
  };
}

function deterministicFrictionRequirement(measurement: ISessionCostMeasurement | undefined): INextStepsAuditRequirement {
  const evidence: string[] = [];
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const acceptance = measurement?.acceptance;
  if (measurement === undefined) {
    diagnostics.push(error("TN_BENCH_NEXT_STEPS_SESSION_COST_MISSING", `Session-cost report does not include ${TYPED_SPEC_RECIPE_ID}.`));
  } else {
    evidence.push(`typed-spec recipe failedCommandCount=${measurement.failedCommandCount ?? "unknown"}.`);
    evidence.push(`typed-spec recipe manualEditCount=${measurement.manualEditCount ?? "unknown"}.`);
    if (acceptance !== undefined) {
      evidence.push(`CLI acceptance scaffold=${acceptance.scaffold ?? "unknown"}, apply=${acceptance.gamePlanApply ?? "unknown"}, build=${acceptance.build ?? "unknown"}, playtest=${acceptance.playtest ?? "unknown"}, manualEdits=${acceptance.manualEdits ?? "unknown"}, authoredScenarios=${acceptance.authoredScenarios ?? "unknown"}.`);
    }
    if (measurement.failedCommandCount !== 0 || measurement.manualEditCount !== 0 || acceptance?.manualEdits !== 0 || acceptance?.authoredScenarios !== 0 || acceptance?.scaffold !== "pass" || acceptance?.gamePlanApply !== "pass" || acceptance?.build !== "pass" || acceptance?.playtest !== "pass") {
      diagnostics.push(error("TN_BENCH_NEXT_STEPS_ACCEPTANCE_INCOMPLETE", "Typed-spec scaffold/apply/build/playtest acceptance is not all pass with zero manual edits."));
    }
  }
  return requirement("deterministic-frictions", "Five deterministic frictions have CLI acceptance proof", evidence, diagnostics);
}

function churnBudgetRequirement(matrixReport: IBenchmarkReport | undefined): INextStepsAuditRequirement {
  const evidence: string[] = [];
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (matrixReport === undefined) {
    diagnostics.push(error("TN_BENCH_NEXT_STEPS_CHURN_BUDGETS_MISSING", "Matrix report is required to inspect per-run churn budgets."));
    return requirement("churn-budgets", "Per-run churn budgets are green before confirmation rerun", evidence, diagnostics);
  }
  const budgetRuns = matrixReport.promptSummaries.flatMap((summary) => summary.behaviorBudgetRuns ?? []);
  evidence.push(`behavior budget runs=${budgetRuns.length}, failing=${budgetRuns.filter((run) => run.withinBudget === false).length}.`);
  for (const summary of matrixReport.promptSummaries) {
    for (const conditionSummary of summary.churnByCondition ?? []) {
      evidence.push(`${summary.promptId}/${conditionSummary.condition} churn medians=${JSON.stringify(conditionSummary.median)}.`);
    }
  }
  if (budgetRuns.length === 0) {
    diagnostics.push(error(
      "TN_BENCH_NEXT_STEPS_CHURN_BUDGETS_MISSING",
      "Matrix report does not include per-run churn budget evidence.",
      "Aggregate run reports with codex-events.jsonl sidecars or session.churnCounters before preparing Round 5B.",
    ));
  }
  const failing = budgetRuns.filter((run) => run.withinBudget === false);
  if (failing.length > 0) {
    diagnostics.push(error(
      "TN_BENCH_NEXT_STEPS_CHURN_BUDGETS_RED",
      `Per-run churn budgets are red for: ${failing.map((run) => run.runId).join(", ")}.`,
      failing.flatMap((run) => churnNextActions(run)).join(" "),
    ));
  }
  return requirement("churn-budgets", "Per-run churn budgets are green before confirmation rerun", evidence, diagnostics);
}

function churnNextActions(run: IBenchmarkReport["promptSummaries"][number]["behaviorBudgetRuns"][number]): string[] {
  const counters = run.churnCounters;
  if (counters === undefined) {
    return run.diagnostics.map((diagnostic) => diagnostic.suggestedFix).filter((fix): fix is string => fix !== undefined);
  }
  const actions: string[] = [];
  if (counters.engineSourceSearch > 0) {
    actions.push(`${run.runId}: add or improve a command/API card/diagnostic that removes engine-source search.`);
  }
  if (counters.standaloneVerify > 0) {
    actions.push(`${run.runId}: route standalone validate/build/playtest proof through tn iterate.`);
  }
  if (counters.artifactForensics > 0) {
    actions.push(`${run.runId}: summarize needed artifact evidence in tn iterate output or playtest diagnostics.`);
  }
  if (counters.missingIterate > 0) {
    actions.push(`${run.runId}: require the scaffold-first tn iterate step or add missing iterate coverage.`);
  }
  if (counters.missingDiscovery > 0) {
    actions.push(`${run.runId}: start authoring with tn game plan, cookbook, project map, scene inspect, or playtest discovery.`);
  }
  if (counters.repeatedFileRead > 0) {
    actions.push(`${run.runId}: add a compact reference/API card so the same file is not reread.`);
  }
  if (counters.failedCommand > 0) {
    actions.push(`${run.runId}: fix the first failed command or make its diagnostic prescriptive.`);
  }
  if (counters.repeatedAssertion > 0) {
    actions.push(`${run.runId}: repair the scenario/diagnostic before rerunning identical failed assertions.`);
  }
  if (counters.repeatedDiagnostic > 0) {
    actions.push(`${run.runId}: make the repeated diagnostic's suggested fix exact enough to stop retry chains.`);
  }
  return actions;
}

function matrixRequirement(matrixResult: { diagnostics: IBenchmarkDiagnostic[]; ok: boolean }, roundStatus: IPreparedRoundStatus | undefined): INextStepsAuditRequirement {
  const evidence: string[] = [];
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (matrixResult.ok) {
    evidence.push("Round-5 matrix validator passed with typed-spec repeats required.");
  } else {
    diagnostics.push(...matrixResult.diagnostics);
  }
  if (roundStatus !== undefined) {
    evidence.push(`prepared slots=${roundStatus.summary.total}, scored=${roundStatus.summary.scored}, proofPassed=${roundStatus.summary.proofPassed}, proofFailed=${roundStatus.summary.proofFailed}, invalidSessions=${roundStatus.summary.sessionInvalid}, invalidReports=${roundStatus.summary.runReportInvalid}, sessionMissing=${roundStatus.summary.sessionMissing}, runReportMissing=${roundStatus.summary.runReportMissing}.`);
  }
  if (!matrixResult.ok && diagnostics.length === 0) {
    diagnostics.push(error("TN_BENCH_NEXT_STEPS_MATRIX_INCOMPLETE", "Round-5 comparison matrix is incomplete."));
  }
  return requirement("comparison-matrix", "Round-5 comparison matrix is filled", evidence, diagnostics);
}

function stepLeverRequirement(measurement: ISessionCostMeasurement | undefined, apiCardText: string | undefined): INextStepsAuditRequirement {
  const evidence: string[] = [];
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (measurement === undefined) {
    diagnostics.push(error("TN_BENCH_NEXT_STEPS_STEP_LEVER_MEASUREMENT_MISSING", `Session-cost report does not include ${TYPED_SPEC_RECIPE_ID}.`));
  } else {
    evidence.push(`typed-spec iterateOutputBytes=${measurement.iterateOutputBytes ?? "unknown"}.`);
    evidence.push(`typed-spec toolStepCount=${measurement.toolStepCount ?? "unknown"}.`);
    if ((measurement.iterateOutputBytes ?? Infinity) > MAX_ITERATE_OUTPUT_BYTES) {
      diagnostics.push(error("TN_BENCH_NEXT_STEPS_ITERATE_TOO_LARGE", `tn iterate output exceeds ${MAX_ITERATE_OUTPUT_BYTES} bytes.`));
    }
    if ((measurement.toolStepCount ?? Infinity) > MAX_ROUND5_TOOL_STEPS) {
      diagnostics.push(error("TN_BENCH_NEXT_STEPS_TOO_MANY_STEPS", `typed-spec recipe exceeds ${MAX_ROUND5_TOOL_STEPS} tool steps.`));
    }
  }
  if (apiCardText?.includes("HUD") === true && apiCardText.includes("writes") && apiCardText.includes("MeshRenderer")) {
    evidence.push("API card covers HUD binding and component write declarations.");
  } else {
    diagnostics.push(error("TN_BENCH_NEXT_STEPS_API_CARD_INCOMPLETE", "API card does not evidence HUD binding plus write-declaration guidance."));
  }
  return requirement("step-count-levers", "Typed-spec step-count levers are applied", evidence, diagnostics);
}

function decisionRuleRequirement(protocolText: string | undefined): INextStepsAuditRequirement {
  const evidence: string[] = [];
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (protocolText?.includes("Post-Friction Pre-Commitment") === true
    && protocolText.includes("starter default")
    && protocolText.includes("PRD-018 vanilla-lift")
    && protocolText.includes("runtime diagnosability")
    && protocolText.includes("write the next PRD")) {
    evidence.push("ROUND-5-PROTOCOL.md records typed-spec default, PRD-018 vanilla-lift, and runtime-diagnosability decision branches.");
  } else {
    diagnostics.push(error("TN_BENCH_NEXT_STEPS_DECISION_RULE_MISSING", "Round-5 protocol does not include the post-friction pre-commitment decision rule."));
  }
  return requirement("decision-rule", "Round-5 decision rule is pre-committed", evidence, diagnostics);
}

async function readBenchmarkReport(path: string, diagnostics: IBenchmarkDiagnostic[]): Promise<IBenchmarkReport | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (isBenchmarkReport(parsed)) {
      return parsed;
    }
    diagnostics.push(error("TN_BENCH_NEXT_STEPS_MATRIX_REPORT_INVALID", "Matrix report is not a valid benchmark aggregate report."));
  } catch (readError) {
    diagnostics.push(error("TN_BENCH_NEXT_STEPS_MATRIX_REPORT_READ_FAILED", `Unable to read matrix report: ${formatError(readError)}.`));
  }
  return undefined;
}

async function readRoundStatus(path: string, diagnostics: IBenchmarkDiagnostic[]): Promise<IPreparedRoundStatus | undefined> {
  try {
    return await inspectPreparedRound(path);
  } catch (readError) {
    diagnostics.push(error("TN_BENCH_NEXT_STEPS_ROUND_STATUS_READ_FAILED", `Unable to inspect prepared round: ${formatError(readError)}.`));
    return undefined;
  }
}

async function readTypedSpecRecipe(path: string, diagnostics: IBenchmarkDiagnostic[]): Promise<ISessionCostMeasurement | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    const measurements = isRecord(parsed) && isRecord(parsed.artifacts) && Array.isArray(parsed.artifacts.measurements)
      ? parsed.artifacts.measurements
      : [];
    return measurements.find((measurement): measurement is ISessionCostMeasurement => isSessionCostMeasurement(measurement) && measurement.id === TYPED_SPEC_RECIPE_ID);
  } catch (readError) {
    diagnostics.push(error("TN_BENCH_NEXT_STEPS_SESSION_COST_READ_FAILED", `Unable to read session-cost report: ${formatError(readError)}.`));
    return undefined;
  }
}

async function readText(path: string, diagnostics: IBenchmarkDiagnostic[], code: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (readError) {
    diagnostics.push(error(code, `Unable to read ${path}: ${formatError(readError)}.`));
    return undefined;
  }
}

function requirement(id: string, title: string, evidence: string[], diagnostics: IBenchmarkDiagnostic[]): INextStepsAuditRequirement {
  return {
    diagnostics,
    evidence,
    id,
    status: diagnostics.length === 0 ? "complete" : "incomplete",
    title,
  };
}

function error(code: string, message: string, suggestedFix?: string): IBenchmarkDiagnostic {
  return {
    code,
    message,
    severity: "error",
    ...(suggestedFix === undefined || suggestedFix === "" ? {} : { suggestedFix }),
  };
}

function isSessionCostMeasurement(value: unknown): value is ISessionCostMeasurement {
  return isRecord(value) && typeof value.id === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatError(errorValue: unknown): string {
  return errorValue instanceof Error ? errorValue.message : String(errorValue);
}
