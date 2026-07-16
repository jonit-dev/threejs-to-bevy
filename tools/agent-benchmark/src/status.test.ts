import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { prepareRound } from "./prepare.js";
import { BENCHMARK_PROTOCOL } from "./protocol.js";
import { inspectPreparedRound } from "./status.js";
import { type BenchmarkCondition } from "./types.js";

test("should report missing session files for prepared round slots", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-status-"));
  const result = await prepareRound({
    conditions: ["typed-spec"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 2,
    root: process.cwd(),
  });

  const status = await inspectPreparedRound(result.manifestPath);

  assert.equal(status.ok, false);
  assert.equal(status.summary.total, 2);
  assert.equal(status.summary.sessionMissing, 2);
  assert.equal(status.summary.runReportMissing, 2);
  assert.equal(status.summary.scored, 0);
  assert.equal(status.slots.every((slot) => slot.status === "session-missing"), true);
  assert.equal(status.nextActions.length, 2);
  assert.equal(status.nextActions[0]?.action, "run-fresh-session");
  assert.equal(status.nextActions[0]?.path, join(result.candidates[0]?.path ?? "", "OPERATOR.md"));
});

test("should report scored slots when sessions and run reports exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-status-"));
  const result = await prepareRound({
    conditions: ["typed-spec"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });
  const candidate = requireCandidate(result.candidates[0]);

  await writeAuthoritativeSession(candidate, session(candidate));

  const runReportPath = join(root, "round-5", candidate.runId, "run-report.json");
  await mkdir(dirname(runReportPath), { recursive: true });
  await writeFile(runReportPath, `${JSON.stringify(runReport(candidate, { proofOk: true }), null, 2)}\n`, "utf8");

  const status = await inspectPreparedRound(result.manifestPath);

  assert.equal(status.ok, true);
  assert.equal(status.summary.total, 1);
  assert.equal(status.summary.sessionMissing, 0);
  assert.equal(status.summary.runReportMissing, 0);
  assert.equal(status.summary.scored, 1);
  assert.equal(status.summary.proofPassed, 1);
  assert.deepEqual(status.nextActions, []);
  assert.equal(status.slots[0]?.status, "scored");
  assert.equal(status.slots[0]?.sessionOk, true);
  assert.equal(status.slots[0]?.runReportOk, true);
  assert.equal(status.slots[0]?.proofPassed, true);
  assert.equal(status.slots[0]?.runReportPath, runReportPath);
});

test("should surface behavior budget results for scored slots", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-status-"));
  const result = await prepareRound({
    conditions: ["typed-spec"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });
  const candidate = requireCandidate(result.candidates[0]);
  await writeAuthoritativeSession(candidate, session(candidate), [
    event("rg \"playtest\" packages/cli/src"),
    event("tn iterate --project . --json"),
    event("tn game plan --goal collector --json"),
  ].join("\n"));
  const runReportPath = join(root, "round-5", candidate.runId, "run-report.json");
  await mkdir(dirname(runReportPath), { recursive: true });
  await writeFile(runReportPath, `${JSON.stringify(runReport(candidate, { proofOk: true }), null, 2)}\n`, "utf8");

  const status = await inspectPreparedRound(result.manifestPath);
  const behaviorBudget = status.slots[0]?.behaviorBudget;

  assert.equal(status.slots[0]?.status, "scored");
  assert.equal(behaviorBudget?.withinBudget, false);
  assert.equal(behaviorBudget?.counters.engineSourceSearchCommandCount, 1);
  assert.equal(behaviorBudget?.churnCounters.engineSourceSearch, 1);
  assert.deepEqual(behaviorBudget?.offendingCommands.engineSourceSearch, ["rg \"playtest\" packages/cli/src"]);
  assert.equal(behaviorBudget?.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_CHURN_ENGINE_SOURCE_SEARCH_EXCEEDED"), true);
});

test("should report run-report missing after session is filled", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-status-"));
  const result = await prepareRound({
    conditions: ["vanilla"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });
  const candidate = requireCandidate(result.candidates[0]);

  await writeAuthoritativeSession(candidate, session(candidate));

  const status = await inspectPreparedRound(result.manifestPath);

  assert.equal(status.ok, false);
  assert.equal(status.summary.sessionMissing, 0);
  assert.equal(status.summary.sessionInvalid, 0);
  assert.equal(status.summary.runReportMissing, 1);
  assert.equal(status.summary.prepared, 1);
  assert.equal(status.slots[0]?.status, "run-report-missing");
  assert.equal(status.slots[0]?.runReportPath, join(root, "round-5", candidate.runId, "run-report.json"));
  assert.equal(status.nextActions[0]?.action, "score-candidate");
  assert.match(status.nextActions[0]?.command ?? "", new RegExp(`--candidate ${escapeRegExp(candidate.path)}`));
  assert.match(status.nextActions[0]?.command ?? "", new RegExp(`--out ${escapeRegExp(join(root, "round-5", candidate.runId, "run-report.json"))}`));
});

test("should filter prepared round status by condition", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-status-"));
  const result = await prepareRound({
    conditions: ["typed-spec", "vanilla"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 2,
    root: process.cwd(),
  });
  const typedSpecCandidate = requireCandidate(result.candidates.find((candidate) => candidate.runId === "collector-typed-spec-r1"));
  await writeFile(join(typedSpecCandidate.path, "session.json"), `${JSON.stringify(session(typedSpecCandidate), null, 2)}\n`, "utf8");
  const typedSpecRunReportPath = join(root, "round-5", typedSpecCandidate.runId, "run-report.json");
  await mkdir(dirname(typedSpecRunReportPath), { recursive: true });
  await writeFile(typedSpecRunReportPath, `${JSON.stringify(runReport(typedSpecCandidate, { proofOk: true }), null, 2)}\n`, "utf8");

  const status = await inspectPreparedRound(result.manifestPath, { condition: "vanilla" });

  assert.equal(status.ok, false);
  assert.equal(status.summary.total, 2);
  assert.equal(status.summary.scored, 0);
  assert.equal(status.summary.sessionMissing, 2);
  assert.equal(status.slots.every((slot) => slot.condition === "vanilla"), true);
  assert.equal(status.nextActions[0]?.runId, "collector-vanilla-r1");
});

test("should report invalid session files before run-report readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-status-"));
  const result = await prepareRound({
    conditions: ["vanilla"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });
  const candidate = requireCandidate(result.candidates[0]);

  await writeFile(join(candidate.path, "session.json"), "{}\n", "utf8");

  const status = await inspectPreparedRound(result.manifestPath);

  assert.equal(status.ok, false);
  assert.equal(status.summary.sessionMissing, 0);
  assert.equal(status.summary.sessionInvalid, 1);
  assert.equal(status.summary.prepared, 0);
  assert.equal(status.summary.runReportMissing, 1);
  assert.equal(status.slots[0]?.status, "session-invalid");
  assert.equal(status.slots[0]?.sessionOk, false);
  assert.equal(status.slots[0]?.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_SCHEMA_LITERAL"), true);
  assert.equal(status.nextActions[0]?.action, "fix-session");
  assert.equal(status.nextActions[0]?.path, join(candidate.path, "session.json"));
});

test("should reject copied session templates as matrix evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-status-"));
  const result = await prepareRound({
    conditions: ["typed-spec"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });
  const candidate = requireCandidate(result.candidates[0]);

  await writeFile(join(candidate.path, "session.json"), `${JSON.stringify({
    condition: candidate.condition,
    humanRubric: { notes: "Fill after the fresh session.", playability: 0, visual: 0 },
    iterationCount: 0,
    promptId: "collector",
    runId: candidate.runId,
    schema: "threenative.agent-benchmark-session",
    stopReason: "operator-stopped",
    tokenCount: 0,
    version: 2,
  }, null, 2)}\n`, "utf8");

  const status = await inspectPreparedRound(result.manifestPath);

  assert.equal(status.ok, false);
  assert.equal(status.summary.sessionInvalid, 1);
  assert.equal(status.summary.prepared, 0);
  assert.equal(status.slots[0]?.status, "session-invalid");
  assert.equal(status.slots[0]?.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_ROUND_STATUS_SESSION_TOKEN_COUNT_PLACEHOLDER"), true);
  assert.equal(status.slots[0]?.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_ROUND_STATUS_SESSION_FAILED_COMMANDS_MISSING"), true);
  assert.equal(status.slots[0]?.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_ROUND_STATUS_SESSION_TOOL_STEPS_MISSING"), true);
});

test("should report proof-failed slots when scored report does not pass proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-status-"));
  const result = await prepareRound({
    conditions: ["typed-spec"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });
  const candidate = requireCandidate(result.candidates[0]);
  await writeAuthoritativeSession(candidate, session(candidate));
  const runReportPath = join(root, "round-5", candidate.runId, "run-report.json");
  await mkdir(dirname(runReportPath), { recursive: true });
  await writeFile(runReportPath, `${JSON.stringify(runReport(candidate, { proofOk: false }), null, 2)}\n`, "utf8");

  const status = await inspectPreparedRound(result.manifestPath);

  assert.equal(status.ok, false);
  assert.equal(status.summary.proofFailed, 1);
  assert.equal(status.summary.sessionInvalid, 0);
  assert.equal(status.summary.scored, 0);
  assert.equal(status.slots[0]?.status, "proof-failed");
  assert.equal(status.slots[0]?.runReportOk, true);
  assert.equal(status.slots[0]?.proofPassed, false);
  assert.equal(status.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_ROUND_STATUS_PROOF_FAILED"), true);
  assert.equal(status.nextActions[0]?.action, "rerun-session");
  assert.equal(status.nextActions[0]?.path, join(candidate.path, "OPERATOR.md"));
});

test("should report invalid slots when run report does not match prepared slot", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-status-"));
  const result = await prepareRound({
    conditions: ["vanilla"],
    outDir: join(root, "round-5"),
    promptId: "collector",
    promptsDir: "prompts",
    repeats: 1,
    root: process.cwd(),
  });
  const candidate = requireCandidate(result.candidates[0]);
  await writeAuthoritativeSession(candidate, session(candidate));
  const runReportPath = join(root, "round-5", candidate.runId, "run-report.json");
  await mkdir(dirname(runReportPath), { recursive: true });
  await writeFile(runReportPath, `${JSON.stringify(runReport({ ...candidate, condition: "typed-spec" }, { proofOk: true }), null, 2)}\n`, "utf8");

  const status = await inspectPreparedRound(result.manifestPath);

  assert.equal(status.ok, false);
  assert.equal(status.summary.runReportInvalid, 1);
  assert.equal(status.summary.sessionInvalid, 0);
  assert.equal(status.summary.scored, 0);
  assert.equal(status.slots[0]?.status, "run-report-invalid");
  assert.equal(status.slots[0]?.runReportOk, false);
  assert.equal(status.slots[0]?.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_ROUND_STATUS_CONDITION_MISMATCH"), true);
  assert.equal(status.nextActions[0]?.action, "fix-run-report");
  assert.match(status.nextActions[0]?.command ?? "", /score --candidate /);
});

function requireCandidate(candidate: { condition: BenchmarkCondition; path: string; runId: string } | undefined): { condition: BenchmarkCondition; path: string; runId: string } {
  if (candidate === undefined) {
    throw new Error("Expected prepared candidate.");
  }
  return candidate;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function writeAuthoritativeSession(candidate: { path: string }, value: unknown, eventText?: string): Promise<void> {
  const parsed = value as { cachedInputTokens?: number; inputTokens?: number; outputTokens?: number; stopReason: string; tokenCount: number; toolStepCount: number };
  const events = `${eventText ?? event("tn iterate --project . --json")}\n`;
  await Promise.all([
    writeFile(join(candidate.path, "session.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8"),
    writeFile(join(candidate.path, "codex-events.jsonl"), events, "utf8"),
    writeFile(join(candidate.path, "codex-app-events.jsonl"), "{}\n", "utf8"),
    writeFile(join(candidate.path, "runner-result.json"), `${JSON.stringify({
      codexVersion: "test",
      eventsSha256: createHash("sha256").update(events).digest("hex"),
      protocol: BENCHMARK_PROTOCOL,
      schema: "threenative.agent-benchmark-runner-result",
      stopCause: parsed.stopReason,
      tokenUsage: {
        cachedInputTokens: parsed.cachedInputTokens,
        inputTokens: parsed.inputTokens,
        outputTokens: parsed.outputTokens,
        totalTokens: parsed.tokenCount,
      },
      toolStepCount: parsed.toolStepCount,
      version: 1,
    }, null, 2)}\n`, "utf8"),
  ]);
}

function session(candidate: { condition: BenchmarkCondition; runId: string }): unknown {
  return {
    condition: candidate.condition,
    failedCommandCount: 0,
    humanRubric: { playability: 1, visual: 1 },
    iterationCount: 1,
    promptId: "collector",
    runId: candidate.runId,
    schema: "threenative.agent-benchmark-session",
    stopReason: "claimed-playable",
    tokenCount: 100,
    toolStepCount: 1,
    version: 2,
  };
}

function event(command: string): string {
  return JSON.stringify({ item: { command, type: "command_execution" }, type: "item.completed" });
}

function runReport(candidate: { condition: BenchmarkCondition; path: string; runId: string }, options: { proofOk: boolean }): unknown {
  return {
    artifacts: {},
    candidate: candidate.path,
    condition: candidate.condition,
    diagnostics: [],
    generatedAt: "2026-07-07T00:00:00.000Z",
    ok: options.proofOk,
    proof: {
      assertions: [
        { id: "keyboard-movement", pass: options.proofOk },
      ],
      classification: "continuity",
      ok: options.proofOk,
      promptId: "collector",
      requiredAssertionIds: ["keyboard-movement"],
    },
    promptId: "collector",
    runId: candidate.runId,
    schema: "threenative.agent-benchmark-run",
    session: {
      condition: candidate.condition,
      failedCommandCount: 0,
      humanRubric: { playability: 1, visual: 1 },
      iterationCount: 1,
      promptId: "collector",
      runId: candidate.runId,
      schema: "threenative.agent-benchmark-session",
      stopReason: "claimed-playable",
      tokenCount: 100,
      toolStepCount: 1,
      version: 2,
    },
    version: 2,
  };
}
