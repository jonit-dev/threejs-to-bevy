import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { aggregateRunReports } from "./aggregate.js";
import { passedProof } from "./proof-contract.js";
import { type IBenchmarkRunReport } from "./types.js";

test("should compute equal-proof token medians", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const paths = await writeRepeatedRunReports(root, { threenativeTokens: 1400, vanillaTokens: 1000 });
  const report = await aggregateRunReports(paths);
  const summary = report.promptSummaries[0];

  assert.equal(report.verdict.status, "pass");
  assert.equal(report.verdict.threshold.startsWith("equal-proof:"), true);
  assert.equal(summary?.withinHalfX, false);
  assert.equal(summary?.withinEqualProofTokenBudget, true);
  assert.equal(summary?.withinRepeatBudget, true);
  assert.equal(summary?.repeatCount.threenative, 3);
  assert.equal(summary?.repeatCount.vanilla, 3);
  assert.equal(summary?.rawTokenRatio, 1.4);
  assert.equal(report.typedSpecVerdict.status, "insufficient-data");
  assert.equal(summary?.typedSpecTrial.status, "insufficient-data");
});

test("should summarize typed spec trial against direct ThreeNative", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-typed-spec-"));
  const paths = await writeRepeatedRunReports(root, { threenativeTokens: 1400, typedSpecTokens: 900, vanillaTokens: 1000 });
  const report = await aggregateRunReports(paths);
  const summary = report.promptSummaries[0];

  assert.equal(report.verdict.status, "pass");
  assert.equal(report.typedSpecVerdict.status, "default-candidate");
  assert.equal(summary?.proofBar.typedSpecPassed, true);
  assert.equal(summary?.typedSpecTrial.repeatCount, 3);
  assert.equal(summary?.typedSpecTrial.rawTokenRatioToThreeNative, 900 / 1400);
  assert.equal(summary?.typedSpecTrial.failedCommandDelta, 0);
  assert.equal(summary?.typedSpecTrial.status, "default-candidate");
  assert.equal(summary?.typedSpecTrial.withinTokenBudget, true);
});

test("should keep typed spec experimental when it misses trial budgets", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-typed-spec-fail-"));
  const paths = await writeRepeatedRunReports(root, {
    threenativeTokens: 1000,
    typedSpecSession: { failedCommandCount: 1 },
    typedSpecTokens: 1200,
    vanillaTokens: 1000,
  });
  const report = await aggregateRunReports(paths);
  const summary = report.promptSummaries[0];

  assert.equal(report.typedSpecVerdict.status, "experimental");
  assert.equal(summary?.typedSpecTrial.status, "experimental");
  assert.equal(summary?.typedSpecTrial.withinTokenBudget, false);
  assert.equal(summary?.typedSpecTrial.withinFailedCommandBudget, false);
});

test("should emit pivot verdict over equal-proof threshold", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const paths = await writeRepeatedRunReports(root, { threenativeTokens: 1600, vanillaTokens: 1000 });
  const report = await aggregateRunReports(paths);

  assert.equal(report.verdict.status, "fail");
  assert.equal(report.promptSummaries[0]?.withinEqualProofTokenBudget, false);
});

test("should reject benchmark report with fewer than three repeats", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const paths = await writeRepeatedRunReports(root, { repeatCount: 2, threenativeTokens: 1000, vanillaTokens: 1000 });
  const report = await aggregateRunReports(paths);

  assert.equal(report.verdict.status, "fail");
  assert.equal(report.promptSummaries[0]?.withinRepeatBudget, false);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_MATRIX_THREENATIVE_REPEATS_MISSING"), true);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_MATRIX_VANILLA_REPEATS_MISSING"), true);
});

test("should gate beyond-one-shot prompts at equal-proof parity", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const paths = await writeRepeatedRunReports(root, { promptId: "checkpoint-race", threenativeTokens: 1100, vanillaTokens: 1000 });
  const report = await aggregateRunReports(paths);
  const summary = report.promptSummaries[0];

  assert.equal(report.verdict.status, "fail");
  assert.equal(summary?.promptClassification, "beyond-one-shot");
  assert.equal(summary?.withinEqualProofTokenBudget, false);
});

test("should include failed command and retry-chain medians", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const paths = await writeRepeatedRunReports(root, {
    threenativeSession: { failedCommandCount: 1, identicalAssertionRepeatCount: 1, maxConsecutiveSameDiagnostic: 2, toolOutputBytes: 8192 },
    threenativeTokens: 1000,
    vanillaSession: { failedCommandCount: 0, toolOutputBytes: 2048 },
    vanillaTokens: 1000,
  });
  const report = await aggregateRunReports(paths);
  const summary = report.promptSummaries[0];

  assert.equal(report.verdict.status, "fail");
  assert.equal(summary?.failedCommandMedian.threenative, 1);
  assert.equal(summary?.toolOutputMedian.threenative, 8192);
  assert.equal(summary?.toolOutputMedian.vanilla, 2048);
  assert.equal(summary?.withinFailedCommandBudget, false);
  assert.equal(summary?.withinRetryChainBudget, false);
});

test("should exclude run reports with placeholder or incomplete session metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const paths = await writeRepeatedRunReports(root, {
    threenativeSession: { failedCommandCount: undefined, tokenCount: 0, toolStepCount: undefined },
    threenativeTokens: 0,
    vanillaTokens: 1000,
  });
  const report = await aggregateRunReports(paths);
  const summary = report.promptSummaries[0];

  assert.equal(report.verdict.status, "insufficient-data");
  assert.equal(summary?.repeatCount.threenative, 0);
  assert.equal(summary?.repeatCount.vanilla, 3);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_AGGREGATE_SESSION_TOKEN_COUNT_PLACEHOLDER"), true);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_AGGREGATE_SESSION_FAILED_COMMANDS_MISSING"), true);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_AGGREGATE_SESSION_TOOL_STEPS_MISSING"), true);
});

test("should count dialect-confusion failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const paths = await writeRepeatedRunReports(root, {
    threenativeDiagnostics: [{
      code: "TN_BENCH_DIALECT_CONFUSION",
      message: "Agent used a legacy helper name after the preferred alias was documented.",
      severity: "warning",
    }],
    threenativeTokens: 1000,
    vanillaTokens: 1000,
  });
  const report = await aggregateRunReports(paths);
  const summary = report.promptSummaries[0];

  assert.equal(report.dialectConfusionFailureCount, 3);
  assert.deepEqual(summary?.dialectConfusionFailures, { threenative: 3, vanilla: 0 });
});

test("should count instruction-adoption behavior from codex event sidecars", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const paths = await writeRepeatedRunReports(root, { threenativeTokens: 1000, vanillaTokens: 1000 });
  await writeFile(
    join(root, "codex-events.jsonl"),
    [
      commandEvent("tn game plan --goal test --project . --json"),
      commandEvent("tn iterate --project . --json"),
      commandEvent("tn authoring validate --project . --json"),
      commandEvent("jq '.diagnostics' artifacts/playtest/smoke/latest/runtime-trace.json"),
      commandEvent("rg \"move\" packages/cli/src examples"),
    ].join("\n"),
  );

  const report = await aggregateRunReports(paths);
  const summary = report.promptSummaries[0];

  assert.equal(report.verdict.status, "fail");
  assert.equal(summary?.behaviorMedian.discoveryCommandCount, 1);
  assert.equal(summary?.behaviorMedian.iterateCommandCount, 1);
  assert.equal(summary?.behaviorMedian.standaloneVerifyCommandCount, 1);
  assert.equal(summary?.behaviorMedian.artifactForensicsCommandCount, 1);
  assert.equal(summary?.behaviorMedian.engineSourceSearchCommandCount, 1);
  assert.equal(summary?.churnByCondition.find((entry) => entry.condition === "threenative")?.median.engineSourceSearch, 1);
  assert.equal(summary?.churnByCondition.find((entry) => entry.condition === "threenative")?.median.standaloneVerify, 1);
  assert.equal(summary?.withinInstructionAdoptionBudget, false);
  assert.equal(summary?.behaviorBudgetRuns.length, 3);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_CHURN_STANDALONE_VERIFY_EXCEEDED"), true);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_CHURN_ENGINE_SOURCE_SEARCH_EXCEEDED"), true);
});

test("should emit engine-source-search diagnostic with offending command when budget exceeded", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-behavior-budget-"));
  const paths = await writeRepeatedRunReports(root, { threenativeTokens: 1000, vanillaTokens: 1000 });
  await writeFile(
    join(root, "codex-events.jsonl"),
    [
      commandEvent("tn game plan --goal test --project . --json"),
      commandEvent("tn iterate --project . --json"),
      commandEvent("rg \"evaluateRichPlaytestAssertions\" packages/cli/src/commands/playtestAssertions.ts"),
    ].join("\n"),
  );

  const report = await aggregateRunReports(paths);
  const diagnostic = report.diagnostics.find((candidate) => candidate.code === "TN_BENCH_CHURN_ENGINE_SOURCE_SEARCH_EXCEEDED");

  assert.equal(report.verdict.status, "fail");
  assert.match(diagnostic?.message ?? "", /rg "evaluateRichPlaytestAssertions" packages\/cli\/src\/commands\/playtestAssertions\.ts/);
  assert.equal(report.promptSummaries[0]?.behaviorBudgetRuns.every((run) => run.withinBudget === false), true);
});

test("should normalize all churn classes from event sidecars and session metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-churn-"));
  const paths = await writeRepeatedRunReports(root, {
    threenativeSession: {
      failedCommandCount: 1,
      identicalAssertionRepeatCount: 2,
      maxConsecutiveSameDiagnostic: 3,
    },
    threenativeTokens: 1000,
    vanillaTokens: 1000,
  });
  await writeFile(
    join(root, "codex-events.jsonl"),
    [
      commandEvent("cat tools/agent-benchmark/prompts/checkpoint-race.md"),
      commandEvent("cat tools/agent-benchmark/prompts/checkpoint-race.md"),
      commandEvent("tn authoring validate --project . --json"),
      commandEvent("jq '.events' artifacts/playtest/smoke/latest/runtime-trace.json"),
      commandEvent("jq '.events' artifacts/playtest/smoke/latest/runtime-trace.json"),
      commandEvent("rg \"RigidBody\" packages/sdk/src runtime-bevy/src"),
    ].join("\n"),
  );

  const report = await aggregateRunReports(paths);
  const churn = report.promptSummaries[0]?.behaviorBudgetRuns[0]?.churnCounters;

  assert.deepEqual(churn, {
    artifactForensics: 1,
    engineSourceSearch: 1,
    failedCommand: 1,
    missingDiscovery: 1,
    missingIterate: 1,
    repeatedAssertion: 2,
    repeatedDiagnostic: 2,
    repeatedFileRead: 1,
    standaloneVerify: 1,
  });
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_CHURN_REPEATED_FILE_READ_EXCEEDED"), true);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_CHURN_FAILED_COMMAND_EXCEEDED"), true);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_CHURN_REPEATED_ASSERTION_EXCEEDED"), true);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_CHURN_REPEATED_DIAGNOSTIC_EXCEEDED"), true);
});

test("should keep old reports admissible when behavior counters are absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-no-behavior-"));
  const paths = await writeRepeatedRunReports(root, { threenativeTokens: 1000, vanillaTokens: 1000 });

  const report = await aggregateRunReports(paths);

  assert.equal(report.verdict.status, "pass");
  assert.equal(report.promptSummaries[0]?.behaviorBudgetRuns.length, 0);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code.startsWith("TN_BENCH_BEHAVIOR_")), false);
});

test("should read behavior sidecars from scorer candidate layout", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-layout-"));
  const runDir = join(root, "collector-threenative-r1");
  const candidateDir = join(root, "candidates", "collector-threenative-r1");
  await mkdir(runDir, { recursive: true });
  await mkdir(candidateDir, { recursive: true });
  const threenative = join(runDir, "run-report.json");
  await writeFile(threenative, JSON.stringify(run("threenative", 1000), null, 2));
  await writeFile(
    join(candidateDir, "codex-events.jsonl"),
    [
      commandEvent("tn cookbook list --json"),
      commandEvent("tn iterate --project . --json"),
    ].join("\n"),
  );

  const report = await aggregateRunReports([threenative]);
  const summary = report.promptSummaries[0];

  assert.equal(summary?.behaviorMedian.discoveryCommandCount, 1);
  assert.equal(summary?.behaviorMedian.iterateCommandCount, 1);
  assert.equal(summary?.withinInstructionAdoptionBudget, true);
});

async function writeRepeatedRunReports(root: string, options: {
  promptId?: string;
  repeatCount?: number;
  threenativeDiagnostics?: IBenchmarkRunReport["diagnostics"];
  threenativeSession?: Partial<IBenchmarkRunReport["session"]>;
  threenativeTokens: number;
  typedSpecSession?: Partial<IBenchmarkRunReport["session"]>;
  typedSpecTokens?: number;
  vanillaSession?: Partial<IBenchmarkRunReport["session"]>;
  vanillaTokens: number;
}): Promise<string[]> {
  const paths: string[] = [];
  const repeatCount = options.repeatCount ?? 3;
  for (let index = 0; index < repeatCount; index += 1) {
    const vanilla = join(root, `vanilla-${index}.json`);
    const threenative = join(root, `threenative-${index}.json`);
    await writeFile(vanilla, JSON.stringify(run("vanilla", options.vanillaTokens, {
      promptId: options.promptId,
      session: options.vanillaSession,
      suffix: String(index),
    }), null, 2));
    await writeFile(threenative, JSON.stringify(run("threenative", options.threenativeTokens, {
      diagnostics: options.threenativeDiagnostics,
      promptId: options.promptId,
      session: options.threenativeSession,
      suffix: String(index),
    }), null, 2));
    paths.push(vanilla, threenative);
    if (options.typedSpecTokens !== undefined) {
      const typedSpec = join(root, `typed-spec-${index}.json`);
      await writeFile(typedSpec, JSON.stringify(run("typed-spec", options.typedSpecTokens, {
        promptId: options.promptId,
        session: options.typedSpecSession,
        suffix: String(index),
      }), null, 2));
      paths.push(typedSpec);
    }
  }
  return paths;
}

function run(condition: "threenative" | "typed-spec" | "vanilla", tokenCount: number, options: {
  diagnostics?: IBenchmarkRunReport["diagnostics"];
  promptId?: string;
  session?: Partial<IBenchmarkRunReport["session"]>;
  suffix?: string;
} = {}): IBenchmarkRunReport {
  const promptId = options.promptId ?? "collector";
  const runId = `${condition}-${options.suffix ?? "1"}`;
  return {
    artifacts: {},
    candidate: `/tmp/${condition}`,
    condition,
    diagnostics: options.diagnostics ?? [],
    generatedAt: "2026-07-06T00:00:00.000Z",
    ok: true,
    promptId,
    proof: passedProof(promptId),
    runId,
    schema: "threenative.agent-benchmark-run",
    session: {
      condition,
      cachedInputTokens: tokenCount * 0.1,
      costWeightedTokens: tokenCount,
      failedCommandCount: 0,
      humanRubric: { playability: 2, visual: 2 },
      identicalAssertionRepeatCount: 0,
      inputTokens: tokenCount * 0.85,
      iterationCount: 1,
      maxConsecutiveSameDiagnostic: 0,
      outputTokens: tokenCount * 0.15,
      promptId,
      runId,
      schema: "threenative.agent-benchmark-session",
      stopReason: "claimed-playable",
      tokenCount,
      toolOutputBytes: 4096,
      toolStepCount: condition === "vanilla" ? 4 : 13,
      uncachedInputTokens: tokenCount * 0.75,
      version: 2,
      ...options.session,
    },
    version: 2,
  };
}

function commandEvent(command: string): string {
  return JSON.stringify({
    item: {
      command,
      type: "command_execution",
    },
    type: "item.completed",
  });
}
