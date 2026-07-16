import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";

import { readBehaviorBudgetRun } from "./aggregate.js";
import { BENCHMARK_PROTOCOL } from "./protocol.js";
import { isBenchmarkRunReport, readSession } from "./schemas.js";
import { type BenchmarkCondition, type IBenchmarkBehaviorBudgetRun, type IBenchmarkDiagnostic, type IBenchmarkRunReport, type IBenchmarkSession } from "./types.js";

export interface IPreparedRoundManifest {
  candidates: IPreparedRoundCandidate[];
  conditions: string[];
  promptId: string;
  repeats: number;
  schema: "threenative.agent-benchmark-round-prepare";
  version: 1;
  protocol?: typeof BENCHMARK_PROTOCOL;
}

export interface IPreparedRoundCandidate {
  condition: string;
  path: string;
  runId: string;
}

export interface IPreparedRoundSlotStatus {
  candidatePath: string;
  behaviorBudget?: IBenchmarkBehaviorBudgetRun;
  condition: string;
  diagnostics: IBenchmarkDiagnostic[];
  hasRunReport: boolean;
  hasSession: boolean;
  proofPassed: boolean;
  runReportOk: boolean;
  runId: string;
  runReportPath: string;
  sessionOk: boolean;
  sessionPath: string;
  status: "prepared" | "proof-failed" | "run-report-invalid" | "run-report-missing" | "scored" | "session-invalid" | "session-missing";
}

export interface IPreparedRoundNextAction {
  action: "fix-run-report" | "fix-session" | "rerun-session" | "run-fresh-session" | "score-candidate";
  command?: string;
  condition: string;
  message: string;
  path: string;
  runId: string;
}

export interface IPreparedRoundStatus {
  diagnostics: IBenchmarkDiagnostic[];
  manifestPath: string;
  nextActions: IPreparedRoundNextAction[];
  ok: boolean;
  promptId: string;
  repeats: number;
  slots: IPreparedRoundSlotStatus[];
  summary: {
    prepared: number;
    proofFailed: number;
    proofPassed: number;
    runReportInvalid: number;
    runReportMissing: number;
    scored: number;
    sessionInvalid: number;
    sessionMissing: number;
    total: number;
  };
}

export interface IInspectPreparedRoundOptions {
  condition?: BenchmarkCondition;
}

export async function inspectPreparedRound(manifestPath: string, options: IInspectPreparedRoundOptions = {}): Promise<IPreparedRoundStatus> {
  const resolvedManifestPath = resolve(manifestPath);
  const manifest = JSON.parse(await readFile(resolvedManifestPath, "utf8")) as unknown;
  if (!isPreparedRoundManifest(manifest)) {
    return {
      diagnostics: [{
        code: "TN_BENCH_ROUND_STATUS_INVALID_MANIFEST",
        message: "Round status requires a valid round-5 prepare manifest.",
        severity: "error",
      }],
      manifestPath: resolvedManifestPath,
      nextActions: [],
      ok: false,
      promptId: "unknown",
      repeats: 0,
      slots: [],
      summary: emptySummary(),
    };
  }

  const roundDir = dirname(resolvedManifestPath);
  const candidates = options.condition === undefined
    ? manifest.candidates
    : manifest.candidates.filter((candidate) => candidate.condition === options.condition);
  const slots = await Promise.all(candidates.map(async (candidate) => {
    const candidatePath = resolve(candidate.path);
    const sessionPath = join(candidatePath, "session.json");
    const runReportPath = await findRunReportPath(roundDir, candidatePath, candidate.runId);
    const hasSession = await exists(sessionPath);
    const hasRunReport = await exists(runReportPath);
    const sessionResult = hasSession
      ? await inspectSession(sessionPath, candidate, manifest.protocol !== undefined)
      : { diagnostics: [], sessionOk: false };
    const runReportResult = hasRunReport
      ? await inspectRunReport(runReportPath, candidate)
      : { behaviorBudget: undefined, diagnostics: [], proofPassed: false, runReportOk: false };
    let status: IPreparedRoundSlotStatus["status"] = "scored";
    if (!hasSession) {
      status = "session-missing";
    } else if (!sessionResult.sessionOk) {
      status = "session-invalid";
    } else if (!hasRunReport) {
      status = "run-report-missing";
    } else if (!runReportResult.runReportOk) {
      status = "run-report-invalid";
    } else if (!runReportResult.proofPassed) {
      status = "proof-failed";
    }
    return {
      candidatePath,
      behaviorBudget: runReportResult.behaviorBudget,
      condition: candidate.condition,
      diagnostics: [...sessionResult.diagnostics, ...runReportResult.diagnostics],
      hasRunReport,
      hasSession,
      proofPassed: runReportResult.proofPassed,
      runReportOk: runReportResult.runReportOk,
      runId: candidate.runId,
      runReportPath,
      sessionOk: sessionResult.sessionOk,
      sessionPath,
      status,
    };
  }));

  const summary = slots.reduce((counts, slot) => {
    counts.total += 1;
    if (!slot.hasSession) {
      counts.sessionMissing += 1;
    }
    if (!slot.hasRunReport) {
      counts.runReportMissing += 1;
    }
    if (slot.status === "scored") {
      counts.scored += 1;
    }
    if (slot.status === "run-report-invalid") {
      counts.runReportInvalid += 1;
    }
    if (slot.status === "session-invalid") {
      counts.sessionInvalid += 1;
    }
    if (slot.status === "proof-failed") {
      counts.proofFailed += 1;
    }
    if (slot.proofPassed) {
      counts.proofPassed += 1;
    }
    if (slot.sessionOk && !slot.hasRunReport) {
      counts.prepared += 1;
    }
    return counts;
  }, emptySummary());

  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (summary.sessionMissing > 0) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_SESSION_MISSING",
      message: `${summary.sessionMissing} prepared benchmark slot(s) still need session.json.`,
      severity: "warning",
    });
  }
  if (summary.runReportMissing > 0) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_RUN_REPORT_MISSING",
      message: `${summary.runReportMissing} prepared benchmark slot(s) still need run-report.json scoring output.`,
      severity: "warning",
    });
  }
  if (summary.sessionInvalid > 0) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_SESSION_INVALID",
      message: `${summary.sessionInvalid} prepared benchmark slot(s) have invalid or mismatched session.json.`,
      severity: "error",
    });
  }
  if (summary.runReportInvalid > 0) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_RUN_REPORT_INVALID",
      message: `${summary.runReportInvalid} prepared benchmark slot(s) have invalid or mismatched run-report.json output.`,
      severity: "error",
    });
  }
  if (summary.proofFailed > 0) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_PROOF_FAILED",
      message: `${summary.proofFailed} prepared benchmark slot(s) have scored run reports that do not pass the equal-proof contract.`,
      severity: "error",
    });
  }

  return {
    diagnostics,
    manifestPath: resolvedManifestPath,
    nextActions: nextActions(slots),
    ok: summary.scored === summary.total,
    promptId: manifest.promptId,
    repeats: manifest.repeats,
    slots,
    summary,
  };
}

function nextActions(slots: IPreparedRoundSlotStatus[]): IPreparedRoundNextAction[] {
  return slots
    .filter((slot) => slot.status !== "scored")
    .map((slot) => nextAction(slot));
}

function nextAction(slot: IPreparedRoundSlotStatus): IPreparedRoundNextAction {
  if (slot.status === "session-missing") {
    return {
      action: "run-fresh-session",
      condition: slot.condition,
      message: `Run a fresh ${slot.condition} agent session for ${slot.runId}, then write session.json from session.template.json.`,
      path: join(slot.candidatePath, "OPERATOR.md"),
      runId: slot.runId,
    };
  }
  if (slot.status === "session-invalid") {
    return {
      action: "fix-session",
      condition: slot.condition,
      message: `${slot.runId} has session.json, but it is invalid or does not match the prepared slot.`,
      path: slot.sessionPath,
      runId: slot.runId,
    };
  }
  if (slot.status === "run-report-missing") {
    return {
      action: "score-candidate",
      command: `node tools/agent-benchmark/dist/index.js score --candidate ${slot.candidatePath} --condition ${slot.condition} --out ${slot.runReportPath} --json`,
      condition: slot.condition,
      message: `${slot.runId} has a valid session.json and is ready to score.`,
      path: slot.runReportPath,
      runId: slot.runId,
    };
  }
  if (slot.status === "run-report-invalid") {
    return {
      action: "fix-run-report",
      command: `node tools/agent-benchmark/dist/index.js score --candidate ${slot.candidatePath} --condition ${slot.condition} --out ${slot.runReportPath} --json`,
      condition: slot.condition,
      message: `${slot.runId} has a run report, but it is invalid or does not match the prepared slot. Re-score after fixing the candidate/session evidence.`,
      path: slot.runReportPath,
      runId: slot.runId,
    };
  }
  return {
    action: "rerun-session",
    condition: slot.condition,
    message: `${slot.runId} is scored but proof.ok is not true. Run a fresh replacement session for this slot or fix the candidate and re-score.`,
    path: join(slot.candidatePath, "OPERATOR.md"),
    runId: slot.runId,
  };
}

function emptySummary(): IPreparedRoundStatus["summary"] {
  return {
    prepared: 0,
    proofFailed: 0,
    proofPassed: 0,
    runReportInvalid: 0,
    runReportMissing: 0,
    scored: 0,
    sessionInvalid: 0,
    sessionMissing: 0,
    total: 0,
  };
}

async function inspectSession(sessionPath: string, candidate: IPreparedRoundCandidate, requireRunnerAuthority: boolean): Promise<{
  diagnostics: IBenchmarkDiagnostic[];
  sessionOk: boolean;
}> {
  const result = await readSession(sessionPath);
  if (result.session === undefined) {
    return { diagnostics: result.diagnostics, sessionOk: false };
  }
  const diagnostics = [
    ...sessionMatchingDiagnostics(result.session, candidate),
    ...sessionCompletenessDiagnostics(result.session, candidate),
    ...(requireRunnerAuthority ? await runnerAuthorityDiagnostics(result.session, candidate) : []),
  ];
  return { diagnostics, sessionOk: diagnostics.length === 0 };
}

async function runnerAuthorityDiagnostics(session: IBenchmarkSession, candidate: IPreparedRoundCandidate): Promise<IBenchmarkDiagnostic[]> {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const runnerResultPath = join(resolve(candidate.path), "runner-result.json");
  const eventsPath = join(resolve(candidate.path), "codex-events.jsonl");
  const rawEventsPath = join(resolve(candidate.path), "codex-app-events.jsonl");
  let runner: unknown;
  let events: string;
  try {
    [runner, events] = await Promise.all([
      readFile(runnerResultPath, "utf8").then((text) => JSON.parse(text) as unknown),
      readFile(eventsPath, "utf8"),
      access(rawEventsPath),
    ]).then(([parsed, eventText]) => [parsed, eventText] as [unknown, string]);
  } catch (error) {
    return [{
      code: "TN_BENCH_ROUND_STATUS_RUNNER_AUTHORITY_MISSING",
      message: `${candidate.runId}: authoritative runner-result.json, codex-events.jsonl, and codex-app-events.jsonl are required (${error instanceof Error ? error.message : String(error)}).`,
      severity: "error",
    }];
  }
  if (!isRecord(runner) || runner.schema !== "threenative.agent-benchmark-runner-result" || runner.version !== 1 || !isRecord(runner.tokenUsage) || !isRecord(runner.protocol)) {
    diagnostics.push({ code: "TN_BENCH_ROUND_STATUS_RUNNER_RESULT_INVALID", message: `${candidate.runId}: runner-result.json is invalid.`, severity: "error" });
    return diagnostics;
  }
  if (typeof runner.codexVersion !== "string" || runner.codexVersion.length === 0) diagnostics.push({ code: "TN_BENCH_ROUND_STATUS_RUNNER_CODEX_VERSION_MISSING", message: `${candidate.runId}: runner-result.json must record the Codex version.`, severity: "error" });
  const eventsSha256 = createHash("sha256").update(events).digest("hex");
  if (runner.eventsSha256 !== eventsSha256) diagnostics.push({ code: "TN_BENCH_ROUND_STATUS_RUNNER_EVENTS_MISMATCH", message: `${candidate.runId}: codex-events.jsonl does not match its runner-result hash.`, severity: "error" });
  const usage = runner.tokenUsage;
  if (usage.inputTokens !== session.inputTokens || usage.cachedInputTokens !== session.cachedInputTokens || usage.outputTokens !== session.outputTokens || usage.totalTokens !== session.tokenCount) {
    diagnostics.push({ code: "TN_BENCH_ROUND_STATUS_RUNNER_USAGE_MISMATCH", message: `${candidate.runId}: session token metrics do not match authoritative runner usage.`, severity: "error" });
  }
  if (runner.toolStepCount !== session.toolStepCount) diagnostics.push({ code: "TN_BENCH_ROUND_STATUS_RUNNER_TOOL_STEPS_MISMATCH", message: `${candidate.runId}: session toolStepCount does not match the runner result.`, severity: "error" });
  if (runner.stopCause !== session.stopReason) diagnostics.push({ code: "TN_BENCH_ROUND_STATUS_RUNNER_STOP_CAUSE_MISMATCH", message: `${candidate.runId}: session stopReason does not match the runner result.`, severity: "error" });
  if (runner.protocol.model !== BENCHMARK_PROTOCOL.model || runner.protocol.reasoningEffort !== BENCHMARK_PROTOCOL.reasoningEffort || runner.protocol.maxRawTokens !== BENCHMARK_PROTOCOL.maxRawTokens || runner.protocol.maxToolSteps !== BENCHMARK_PROTOCOL.maxToolSteps || runner.protocol.tokenInterruptReserve !== BENCHMARK_PROTOCOL.tokenInterruptReserve) {
    diagnostics.push({ code: "TN_BENCH_ROUND_STATUS_RUNNER_PROTOCOL_MISMATCH", message: `${candidate.runId}: runner protocol does not match the frozen benchmark protocol.`, severity: "error" });
  }
  return diagnostics;
}

async function inspectRunReport(runReportPath: string, candidate: IPreparedRoundCandidate): Promise<{
  behaviorBudget?: IBenchmarkBehaviorBudgetRun;
  diagnostics: IBenchmarkDiagnostic[];
  proofPassed: boolean;
  runReportOk: boolean;
}> {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(runReportPath, "utf8")) as unknown;
  } catch (error) {
    return {
      diagnostics: [{
        code: "TN_BENCH_ROUND_STATUS_RUN_REPORT_READ_FAILED",
        message: `Unable to read run report for ${candidate.runId}: ${error instanceof Error ? error.message : String(error)}.`,
        severity: "error",
      }],
      behaviorBudget: undefined,
      proofPassed: false,
      runReportOk: false,
    };
  }
  if (!isBenchmarkRunReport(parsed)) {
    return {
      diagnostics: [{
        code: "TN_BENCH_ROUND_STATUS_RUN_REPORT_INVALID",
        message: `${candidate.runId}: run-report.json does not match the benchmark run-report schema.`,
        severity: "error",
      }],
      behaviorBudget: undefined,
      proofPassed: false,
      runReportOk: false,
    };
  }
  const report = parsed;
  diagnostics.push(...matchingDiagnostics(report, candidate));
  if (diagnostics.length > 0) {
    return { behaviorBudget: undefined, diagnostics, proofPassed: false, runReportOk: false };
  }
  const behaviorBudget = await readBehaviorBudgetRun(runReportPath, report);
  const proofPassed = report.proof?.ok === true;
  if (!proofPassed) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_PROOF_NOT_PASSING",
      message: `${candidate.runId}: run-report.json exists but proof.ok is not true.`,
      severity: "error",
    });
  }
  return { behaviorBudget, diagnostics, proofPassed, runReportOk: true };
}

function matchingDiagnostics(report: IBenchmarkRunReport, candidate: IPreparedRoundCandidate): IBenchmarkDiagnostic[] {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (report.runId !== candidate.runId || report.session.runId !== candidate.runId) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_RUN_ID_MISMATCH",
      message: `${candidate.runId}: run-report.json runId/session.runId do not match the prepared slot.`,
      severity: "error",
    });
  }
  if (report.condition !== candidate.condition || report.session.condition !== candidate.condition) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_CONDITION_MISMATCH",
      message: `${candidate.runId}: run-report.json condition/session.condition do not match the prepared slot.`,
      severity: "error",
    });
  }
  return diagnostics;
}

function sessionMatchingDiagnostics(session: IBenchmarkSession, candidate: IPreparedRoundCandidate): IBenchmarkDiagnostic[] {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (session.runId !== candidate.runId) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_SESSION_RUN_ID_MISMATCH",
      message: `${candidate.runId}: session.json runId does not match the prepared slot.`,
      severity: "error",
    });
  }
  if (session.condition !== candidate.condition) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_SESSION_CONDITION_MISMATCH",
      message: `${candidate.runId}: session.json condition does not match the prepared slot.`,
      severity: "error",
    });
  }
  return diagnostics;
}

function sessionCompletenessDiagnostics(session: IBenchmarkSession, candidate: IPreparedRoundCandidate): IBenchmarkDiagnostic[] {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (session.tokenCount <= 0) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_SESSION_TOKEN_COUNT_PLACEHOLDER",
      message: `${candidate.runId}: session.json tokenCount must be greater than 0; copied session templates are not admissible matrix evidence.`,
      severity: "error",
    });
  }
  if (session.failedCommandCount === undefined) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_SESSION_FAILED_COMMANDS_MISSING",
      message: `${candidate.runId}: session.json must include failedCommandCount for the round-5 failed-command median.`,
      severity: "error",
    });
  }
  if (session.toolStepCount === undefined) {
    diagnostics.push({
      code: "TN_BENCH_ROUND_STATUS_SESSION_TOOL_STEPS_MISSING",
      message: `${candidate.runId}: session.json must include toolStepCount for the round-5 step budget.`,
      severity: "error",
    });
  }
  return diagnostics;
}

async function findRunReportPath(roundDir: string, candidatePath: string, runId: string): Promise<string> {
  const roundReportPath = join(roundDir, runId, "run-report.json");
  if (await exists(roundReportPath)) {
    return roundReportPath;
  }
  const candidateReportPath = join(candidatePath, "artifacts", "agent-benchmark", "run-report.json");
  if (await exists(candidateReportPath)) {
    return candidateReportPath;
  }
  return roundReportPath;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isPreparedRoundManifest(value: unknown): value is IPreparedRoundManifest {
  if (!isRecord(value)) {
    return false;
  }
  return value.schema === "threenative.agent-benchmark-round-prepare"
    && value.version === 1
    && typeof value.promptId === "string"
    && typeof value.repeats === "number"
    && Array.isArray(value.conditions)
    && Array.isArray(value.candidates)
    && value.candidates.every(isPreparedRoundCandidate);
}

function isPreparedRoundCandidate(value: unknown): value is IPreparedRoundCandidate {
  return isRecord(value)
    && typeof value.condition === "string"
    && typeof value.path === "string"
    && typeof value.runId === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
