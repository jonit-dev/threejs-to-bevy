#!/usr/bin/env node

import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { aggregateRunReports } from "./aggregate.js";
import { auditNextSteps } from "./next-steps-audit.js";
import { captureCandidate } from "./capture.js";
import { evaluateBrowserObservationProof } from "./browser-proof-evaluator.js";
import { validateRound5Matrix } from "./matrix.js";
import { collectCandidatePlaytestDiagnostics } from "./playtest-diagnostics.js";
import { prepareRound, prepareRound5b } from "./prepare.js";
import { inferBenchmarkProofFromArtifacts } from "./proof-adapter.js";
import { getProofContract } from "./proof-contract.js";
import { isBenchmarkReport, readSession } from "./schemas.js";
import { captureBenchmarkSession } from "./session-capture.js";
import { runFreshSession } from "./session-runner.js";
import { sessionMetricEvidenceDiagnostics } from "./session-evidence.js";
import { inspectPreparedRound } from "./status.js";
import { type BenchmarkCondition, type BenchmarkStopReason, type IBenchmarkRunReport } from "./types.js";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const command = argv[0];
  if (command === "score") {
    return scoreCommand(argv.slice(1));
  }
  if (command === "aggregate") {
    return aggregateCommand(argv.slice(1));
  }
  if (command === "matrix") {
    return matrixCommand(argv.slice(1));
  }
  if (command === "prepare") {
    return prepareCommand(argv.slice(1));
  }
  if (command === "status") {
    return statusCommand(argv.slice(1));
  }
  if (command === "next") {
    return nextCommand(argv.slice(1));
  }
  if (command === "audit") {
    return auditCommand(argv.slice(1));
  }
  if (command === "capture-session") {
    return captureSessionCommand(argv.slice(1));
  }
  if (command === "run-session") {
    return runSessionCommand(argv.slice(1));
  }
  process.stderr.write("Usage: tn-agent-benchmark score --candidate <dir> --condition <vanilla|threenative|typed-spec> [--session <path>] [--out <path>] [--json]\n       tn-agent-benchmark run-session --candidate <dir> --condition <vanilla|threenative|typed-spec> [--max-tool-steps 25] [--json]\n       tn-agent-benchmark capture-session --events <codex-events.jsonl> --template <session.template.json> --out <session.json> [--stop-reason <reason>] [--json]\n       tn-agent-benchmark aggregate --manifest <round-prepare-manifest.json> [--out <path>] [--json]\n       tn-agent-benchmark matrix --report <benchmark-report.json> [--require-typed-spec] [--json]\n       tn-agent-benchmark prepare --out <round-dir> [--prompt collector|--prompts <ids>] [--repeats 3] [--conditions typed-spec,threenative,vanilla] [--round-5b --audit-report <audit.json>] [--json]\n       tn-agent-benchmark status --manifest <round-5-prepare-manifest.json> [--condition <vanilla|threenative|typed-spec>] [--require-complete] [--json]\n       tn-agent-benchmark next --manifest <round-5-prepare-manifest.json> [--condition <vanilla|threenative|typed-spec>] [--json]\n       tn-agent-benchmark audit --matrix-report <benchmark-report.json> --session-cost <verification-report.json> [--round-manifest <round-5-prepare-manifest.json>] [--protocol ROUND-5-PROTOCOL.md] [--json]\n");
  return 1;
}

async function runSessionCommand(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const candidate = readFlag(argv, "--candidate");
  const condition = readFlag(argv, "--condition") as BenchmarkCondition | undefined;
  const maxToolSteps = readOptionalNumberFlag(argv, "--max-tool-steps") ?? 25;
  if (candidate === undefined || (condition !== "threenative" && condition !== "typed-spec" && condition !== "vanilla")) {
    return writeResult({ code: "TN_BENCH_USAGE", message: "Usage: run-session --candidate <dir> --condition <threenative|typed-spec|vanilla> [--max-tool-steps 25] [--json]" }, json, 1);
  }
  if (!Number.isInteger(maxToolSteps) || maxToolSteps <= 0) {
    return writeResult({ code: "TN_BENCH_RUN_SESSION_TOOL_STEPS_INVALID", message: "--max-tool-steps must be a positive integer." }, json, 1);
  }
  try {
    const result = await runFreshSession({ candidate, condition, maxToolSteps });
    return writeResult({ code: result.ok ? "TN_BENCH_RUN_SESSION_OK" : "TN_BENCH_RUN_SESSION_STOPPED", ...result }, json, result.ok ? 0 : 1);
  } catch (error) {
    return writeResult({ code: "TN_BENCH_RUN_SESSION_FAILED", message: error instanceof Error ? error.message : String(error), ok: false }, json, 1);
  }
}

async function captureSessionCommand(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const eventsPath = readFlag(argv, "--events");
  const templatePath = readFlag(argv, "--template");
  const outPath = readFlag(argv, "--out");
  if (eventsPath === undefined || templatePath === undefined || outPath === undefined) {
    return writeResult({ code: "TN_BENCH_USAGE", message: "Usage: capture-session --events <codex-events.jsonl> --template <session.template.json> --out <session.json> [--json]" }, json, 1);
  }
  const stopReason = readFlag(argv, "--stop-reason") as BenchmarkStopReason | undefined;
  if (stopReason !== undefined && !["claimed-playable", "token-cap", "tool-cap", "turn-completed", "operator-stopped", "failed-setup"].includes(stopReason)) {
    return writeResult({ code: "TN_BENCH_CAPTURE_SESSION_STOP_REASON_INVALID", message: "--stop-reason is invalid." }, json, 1);
  }
  try {
    const result = await captureBenchmarkSession({
      eventsPath,
      iterationCount: readOptionalNumberFlag(argv, "--iteration-count"),
      notes: readFlag(argv, "--notes"),
      outPath,
      playability: readOptionalNumberFlag(argv, "--playability"),
      stopReason,
      templatePath,
      visual: readOptionalNumberFlag(argv, "--visual"),
    });
    return writeResult({ code: "TN_BENCH_CAPTURE_SESSION_OK", ...result }, json, 0);
  } catch (error) {
    return writeResult({ code: "TN_BENCH_CAPTURE_SESSION_FAILED", message: error instanceof Error ? error.message : String(error), ok: false }, json, 1);
  }
}

async function scoreCommand(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const candidateArg = readFlag(argv, "--candidate");
  const condition = readFlag(argv, "--condition") as BenchmarkCondition | undefined;
  const outArg = readFlag(argv, "--out");
  const url = readFlag(argv, "--url");
  const sessionArg = readFlag(argv, "--session");
  if (candidateArg === undefined || (condition !== "vanilla" && condition !== "threenative" && condition !== "typed-spec")) {
    return writeResult({ code: "TN_BENCH_USAGE", message: "Usage: score --candidate <dir> --condition <vanilla|threenative|typed-spec> [--session <path>] [--out <path>] [--url <url>] [--json]" }, json, 1);
  }
  const candidate = resolve(candidateArg);
  const outPath = resolve(outArg ?? join(candidate, "artifacts/agent-benchmark/run-report.json"));
  const outDir = resolve(outPath, "..");
  await mkdir(outDir, { recursive: true });
  const sessionResult = await readSession(sessionArg === undefined ? join(candidate, "session.json") : resolve(sessionArg));
  const session = sessionResult.session ?? {
    condition,
    humanRubric: { playability: 0, visual: 0, notes: "Missing or invalid session.json." },
    iterationCount: 0,
    promptId: "unknown",
    runId: "unknown",
    schema: "threenative.agent-benchmark-session" as const,
    stopReason: "failed-setup" as const,
    tokenCount: 0,
    version: 2 as const,
  };
  const proofResult = await inferBenchmarkProofFromArtifacts({ candidate, promptId: session.promptId });
  const capture = await captureCandidate({ candidate, condition, expectedPromptSha256: getProofContract(session.promptId)?.promptSha256, ...(proofResult.proof?.ok === true ? {} : { observePromptId: session.promptId }), outDir, url });
  const browserProof = capture.observationTrace === undefined ? undefined : evaluateBrowserObservationProof(capture.observationTrace);
  const proof = proofResult.proof?.ok === true ? proofResult.proof : browserProof ?? proofResult.proof;
  const proofDiagnostics = proof?.ok === true
    ? proofResult.diagnostics.filter((diagnostic) => diagnostic.code !== "TN_BENCH_EQUAL_PROOF_MISSING" && diagnostic.code !== "TN_BENCH_EQUAL_PROOF_FAILED")
    : proofResult.diagnostics;
  const playtestDiagnostics = proof?.ok === true ? [] : await collectCandidatePlaytestDiagnostics(candidate);
  const sessionEvidenceDiagnostics = sessionResult.session === undefined
    ? []
    : sessionMetricEvidenceDiagnostics(sessionResult.session, { context: "score", runId: sessionResult.session.runId });
  const diagnostics = [...sessionResult.diagnostics, ...sessionEvidenceDiagnostics, ...capture.diagnostics, ...playtestDiagnostics, ...proofDiagnostics];
  if (browserProof !== undefined && browserProof.ok !== true) {
    diagnostics.push({ code: "TN_BENCH_BROWSER_PROOF_FAILED", message: `${session.promptId} scorer-owned browser observation predicates did not all pass.`, severity: "error", suggestedFix: "Fix the visible gameplay transitions or the bounded raw route/observer, then rescore the unchanged candidate." });
  }
  if (session.condition !== condition) {
    diagnostics.push({
      code: "TN_BENCH_SESSION_CONDITION_MISMATCH",
      message: `session.json condition '${session.condition}' does not match CLI condition '${condition}'.`,
      severity: "error",
    });
  }
  const report: IBenchmarkRunReport = {
    artifacts: relativeArtifacts(capture.artifacts, outDir),
    candidate,
    condition,
    diagnostics,
    generatedAt: new Date().toISOString(),
    metrics: capture.metrics,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    proof,
    promptId: session.promptId,
    runId: session.runId,
    schema: "threenative.agent-benchmark-run",
    session,
    version: 2,
  };
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return writeResult({ code: report.ok ? "TN_BENCH_SCORE_OK" : "TN_BENCH_SCORE_FAILED", outPath, report }, json, report.ok ? 0 : 1);
}

async function aggregateCommand(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const runsArg = readFlag(argv, "--runs");
  const manifestArg = readFlag(argv, "--manifest");
  const outArg = readFlag(argv, "--out");
  if ((runsArg === undefined) === (manifestArg === undefined)) {
    return writeResult({ code: "TN_BENCH_USAGE", message: "Usage: aggregate (--manifest <round-prepare-manifest.json> | --runs <file>) [--out <path>] [--json]" }, json, 1);
  }
  try {
    const runPaths = manifestArg === undefined ? await resolveRunReportPaths(resolve(runsArg!)) : await resolveManifestRunReportPaths(resolve(manifestArg));
    const report = await aggregateRunReports(runPaths);
    const outPath = resolve(outArg ?? "tools/verify/artifacts/agent-benchmark/benchmark-report.json");
    await mkdir(resolve(outPath, ".."), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const ok = report.verdict.status === "pass";
    return writeResult({ code: ok ? "TN_BENCH_AGGREGATE_OK" : report.verdict.status === "insufficient-data" ? "TN_BENCH_AGGREGATE_INSUFFICIENT_DATA" : "TN_BENCH_AGGREGATE_FAILED", outPath, report }, json, ok ? 0 : 1);
  } catch (error) {
    return writeResult({ code: "TN_BENCH_AGGREGATE_MANIFEST_INVALID", message: error instanceof Error ? error.message : String(error), ok: false }, json, 1);
  }
}

async function matrixCommand(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const reportArg = readFlag(argv, "--report");
  if (reportArg === undefined) {
    return writeResult({ code: "TN_BENCH_USAGE", message: "Usage: matrix --report <benchmark-report.json> [--require-typed-spec] [--json]" }, json, 1);
  }
  const reportPath = resolve(reportArg);
  try {
    const parsed = JSON.parse(await readFile(reportPath, "utf8")) as unknown;
    if (!isBenchmarkReport(parsed)) {
      return writeResult({
        code: "TN_BENCH_MATRIX_INVALID_REPORT",
        diagnostics: [{
          code: "TN_BENCH_MATRIX_INVALID_REPORT",
          message: "Benchmark matrix command requires a valid aggregate benchmark report.",
          severity: "error",
        }],
        ok: false,
        reportPath,
      }, json, 1);
    }
    const report = parsed;
    const result = validateRound5Matrix(report, { requireTypedSpec: argv.includes("--require-typed-spec") });
    return writeResult({
      code: result.ok ? "TN_BENCH_MATRIX_OK" : "TN_BENCH_MATRIX_INCOMPLETE",
      diagnostics: result.diagnostics,
      ok: result.ok,
      reportPath,
    }, json, result.ok ? 0 : 1);
  } catch (error) {
    return writeResult({
      code: "TN_BENCH_MATRIX_READ_FAILED",
      diagnostics: [{
        code: "TN_BENCH_MATRIX_READ_FAILED",
        message: `Unable to read benchmark report: ${error instanceof Error ? error.message : String(error)}.`,
        severity: "error",
      }],
      ok: false,
      reportPath,
    }, json, 1);
  }
}

async function prepareCommand(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const promptId = readFlag(argv, "--prompt") ?? "collector";
  const promptIds = readFlag(argv, "--prompts")?.split(",").map((value) => value.trim()).filter((value) => value.length > 0);
  const outDir = readFlag(argv, "--out");
  const repeatsValue = readFlag(argv, "--repeats");
  const conditionsValue = readFlag(argv, "--conditions");
  const auditReport = readFlag(argv, "--audit-report");
  if (outDir === undefined) {
    return writeResult({ code: "TN_BENCH_USAGE", message: "Usage: prepare --out <round-dir> [--prompt collector|--prompts <ids>] [--repeats 3] [--conditions typed-spec,threenative,vanilla] [--round-5b --audit-report <audit.json>] [--json]" }, json, 1);
  }
  const repeats = repeatsValue === undefined ? 3 : Number(repeatsValue);
  if (!Number.isInteger(repeats) || repeats <= 0) {
    return writeResult({ code: "TN_BENCH_PREPARE_REPEATS_INVALID", message: "--repeats must be a positive integer." }, json, 1);
  }
  let conditions: BenchmarkCondition[] | undefined;
  if (conditionsValue !== undefined) {
    conditions = parseConditions(conditionsValue);
    if (conditions.length === 0) {
      return writeResult({ code: "TN_BENCH_PREPARE_CONDITIONS_INVALID", message: "--conditions must include vanilla, threenative, or typed-spec." }, json, 1);
    }
  }
  try {
    const result = argv.includes("--round-5b")
      ? auditReport === undefined
        ? undefined
        : await prepareRound5b({ auditReportPath: auditReport, conditions, outDir, repeats })
      : await prepareRound({ conditions, outDir, promptId, ...(promptIds === undefined ? {} : { promptIds }), repeats });
    if (result === undefined) {
      return writeResult({ code: "TN_BENCH_PREPARE_AUDIT_REQUIRED", message: "prepare --round-5b requires --audit-report <audit.json>." }, json, 1);
    }
    return writeResult({ code: "TN_BENCH_PREPARE_OK", ...result }, json, 0);
  } catch (error) {
    return writeResult({
      code: "TN_BENCH_PREPARE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ok: false,
    }, json, 1);
  }
}

async function statusCommand(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const manifestArg = readFlag(argv, "--manifest");
  const condition = readConditionFlag(argv);
  const requireComplete = argv.includes("--require-complete");
  if (manifestArg === undefined) {
    return writeResult({ code: "TN_BENCH_USAGE", message: "Usage: status --manifest <round-5-prepare-manifest.json> [--condition <vanilla|threenative|typed-spec>] [--require-complete] [--json]" }, json, 1);
  }
  if (condition === "invalid") {
    return writeResult({ code: "TN_BENCH_USAGE", message: "--condition must be vanilla, threenative, or typed-spec." }, json, 1);
  }
  const manifestPath = resolve(manifestArg);
  try {
    const result = await inspectPreparedRound(manifestPath, { condition });
    const hasError = result.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    return writeResult({
      code: result.ok ? "TN_BENCH_ROUND_STATUS_COMPLETE" : "TN_BENCH_ROUND_STATUS_INCOMPLETE",
      condition,
      ...result,
    }, json, hasError || (requireComplete && !result.ok) ? 1 : 0);
  } catch (error) {
    return writeResult({
      code: "TN_BENCH_ROUND_STATUS_READ_FAILED",
      diagnostics: [{
        code: "TN_BENCH_ROUND_STATUS_READ_FAILED",
        message: `Unable to inspect prepared round: ${error instanceof Error ? error.message : String(error)}.`,
        severity: "error",
      }],
      ok: false,
      manifestPath,
    }, json, 1);
  }
}

async function nextCommand(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const manifestArg = readFlag(argv, "--manifest");
  const condition = readConditionFlag(argv);
  if (manifestArg === undefined) {
    return writeResult({ code: "TN_BENCH_USAGE", message: "Usage: next --manifest <round-5-prepare-manifest.json> [--condition <vanilla|threenative|typed-spec>] [--json]" }, json, 1);
  }
  if (condition === "invalid") {
    return writeResult({ code: "TN_BENCH_USAGE", message: "--condition must be vanilla, threenative, or typed-spec." }, json, 1);
  }
  const manifestPath = resolve(manifestArg);
  try {
    const result = await inspectPreparedRound(manifestPath, { condition });
    const action = result.nextActions[0];
    return writeResult({
      action,
      code: action === undefined ? "TN_BENCH_ROUND_NEXT_COMPLETE" : "TN_BENCH_ROUND_NEXT_ACTION",
      condition,
      manifestPath,
      ok: action === undefined,
      summary: result.summary,
    }, json, 0);
  } catch (error) {
    return writeResult({
      code: "TN_BENCH_ROUND_NEXT_READ_FAILED",
      diagnostics: [{
        code: "TN_BENCH_ROUND_NEXT_READ_FAILED",
        message: `Unable to inspect prepared round: ${error instanceof Error ? error.message : String(error)}.`,
        severity: "error",
      }],
      ok: false,
      manifestPath,
    }, json, 1);
  }
}

async function auditCommand(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const matrixReportPath = readFlag(argv, "--matrix-report");
  const sessionCostReportPath = readFlag(argv, "--session-cost");
  const protocolPath = readFlag(argv, "--protocol") ?? "tools/agent-benchmark/ROUND-5-PROTOCOL.md";
  const roundManifestPath = readFlag(argv, "--round-manifest");
  if (matrixReportPath === undefined || sessionCostReportPath === undefined) {
    return writeResult({
      code: "TN_BENCH_USAGE",
      message: "Usage: audit --matrix-report <benchmark-report.json> --session-cost <verification-report.json> [--round-manifest <round-5-prepare-manifest.json>] [--protocol ROUND-5-PROTOCOL.md] [--json]",
    }, json, 1);
  }
  const result = await auditNextSteps({
    matrixReportPath,
    protocolPath,
    roundManifestPath,
    sessionCostReportPath,
  });
  return writeResult({
    code: result.ok ? "TN_BENCH_NEXT_STEPS_AUDIT_OK" : "TN_BENCH_NEXT_STEPS_AUDIT_INCOMPLETE",
    ...result,
  }, json, result.ok ? 0 : 1);
}

function parseConditions(value: string): BenchmarkCondition[] {
  const conditions: BenchmarkCondition[] = [];
  for (const item of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (item === "vanilla" || item === "threenative" || item === "typed-spec") {
      conditions.push(item);
    }
  }
  return [...new Set(conditions)];
}

async function resolveRunReportPaths(path: string): Promise<string[]> {
  if (path.endsWith(".json")) {
    return [path];
  }
  throw new Error("Directory aggregation is not authoritative; pass --manifest or an explicit run-report.json file.");
}

async function resolveManifestRunReportPaths(manifestPath: string): Promise<string[]> {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  if (!isRecord(manifest) || manifest.schema !== "threenative.agent-benchmark-round-prepare" || !Array.isArray(manifest.candidates)) {
    throw new Error("Aggregate requires a valid prepared-round manifest.");
  }
  const roundDir = resolve(manifestPath, "..");
  const paths: string[] = [];
  for (const candidate of manifest.candidates) {
    if (!isRecord(candidate) || typeof candidate.path !== "string" || typeof candidate.runId !== "string") throw new Error("Prepared-round manifest contains an invalid candidate.");
    const candidates = [
      resolve(roundDir, candidate.runId, "run-report.json"),
      resolve(candidate.path, "artifacts/agent-benchmark/run-report.json"),
    ];
    const existing = [];
    for (const path of candidates) {
      try { await access(path); existing.push(path); } catch { /* Missing reports remain explicit aggregate read failures. */ }
    }
    if (existing.length > 1) throw new Error(`${candidate.runId} has duplicate run reports; keep exactly one manifest-owned report.`);
    paths.push(existing[0] ?? candidates[0]!);
  }
  const allowed = new Set(paths.map((path) => resolve(path)));
  const entries = await readdir(roundDir, { recursive: true, withFileTypes: true });
  const extras = entries
    .filter((entry) => entry.isFile() && entry.name === "run-report.json")
    .map((entry) => resolve(roundDir, entry.parentPath, entry.name))
    .filter((path) => !allowed.has(path));
  if (extras.length > 0) throw new Error(`Prepared round contains unowned run reports: ${extras.join(", ")}`);
  return paths;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function relativeArtifacts(artifacts: { afterScreenshot?: string; beforeScreenshot?: string; observationTrace?: string }, outDir: string): { afterScreenshot?: string; beforeScreenshot?: string; observationTrace?: string } {
  return {
    afterScreenshot: artifacts.afterScreenshot === undefined ? undefined : relativePath(outDir, artifacts.afterScreenshot),
    beforeScreenshot: artifacts.beforeScreenshot === undefined ? undefined : relativePath(outDir, artifacts.beforeScreenshot),
    observationTrace: artifacts.observationTrace === undefined ? undefined : relativePath(outDir, artifacts.observationTrace),
  };
}

function relativePath(from: string, to: string): string {
  return to.startsWith(from) ? to.slice(from.length + 1) : to;
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index < 0 ? undefined : argv[index + 1];
}

function readOptionalNumberFlag(argv: readonly string[], flag: string): number | undefined {
  const value = readFlag(argv, flag);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative number.`);
  return parsed;
}

function readConditionFlag(argv: readonly string[]): BenchmarkCondition | "invalid" | undefined {
  const value = readFlag(argv, "--condition");
  if (value === undefined) {
    return undefined;
  }
  return value === "vanilla" || value === "threenative" || value === "typed-spec" ? value : "invalid";
}

function writeResult(payload: unknown, json: boolean, exitCode: number): number {
  const output = json ? `${JSON.stringify(payload, null, 2)}\n` : `${JSON.stringify(payload)}\n`;
  if (exitCode === 0) {
    process.stdout.write(output);
  } else {
    process.stderr.write(output);
  }
  return exitCode;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  process.exitCode = await main();
}
