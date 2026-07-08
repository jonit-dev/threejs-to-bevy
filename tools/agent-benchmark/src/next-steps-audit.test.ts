import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { auditNextSteps } from "./next-steps-audit.js";
import { type IBenchmarkReport } from "./types.js";

test("should keep next-steps audit incomplete until the round-5 matrix is filled", async () => {
  const fixture = await writeFixture({ threenativeRepeats: 0, typedSpecRepeats: 1, vanillaRepeats: 0 });

  const result = await auditNextSteps({
    matrixReportPath: fixture.matrixReportPath,
    protocolPath: fixture.protocolPath,
    root: fixture.root,
    roundManifestPath: fixture.roundManifestPath,
    sessionCostReportPath: fixture.sessionCostReportPath,
  });

  assert.equal(result.ok, false);
  assert.equal(result.requirements.find((requirement) => requirement.id === "deterministic-frictions")?.status, "complete");
  assert.equal(result.requirements.find((requirement) => requirement.id === "step-count-levers")?.status, "complete");
  assert.equal(result.requirements.find((requirement) => requirement.id === "comparison-matrix")?.status, "incomplete");
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_MATRIX_THREENATIVE_REPEATS_MISSING"), true);
  assert.equal(result.requirements.find((requirement) => requirement.id === "comparison-matrix")?.evidence.includes("prepared slots=9, scored=0, proofPassed=0, proofFailed=0, invalidSessions=0, invalidReports=0, sessionMissing=9, runReportMissing=9."), true);
});

test("should pass next-steps audit when matrix and acceptance evidence are complete", async () => {
  const fixture = await writeFixture({ threenativeRepeats: 3, typedSpecRepeats: 3, vanillaRepeats: 3 }, { scored: true });

  const result = await auditNextSteps({
    matrixReportPath: fixture.matrixReportPath,
    protocolPath: fixture.protocolPath,
    root: fixture.root,
    roundManifestPath: fixture.roundManifestPath,
    sessionCostReportPath: fixture.sessionCostReportPath,
  });

  assert.equal(result.ok, true);
  assert.equal(result.requirements.every((requirement) => requirement.status !== "incomplete"), true);
});

async function writeFixture(
  repeats: { threenativeRepeats: number; typedSpecRepeats: number; vanillaRepeats: number },
  options: { scored?: boolean } = {},
): Promise<{
  matrixReportPath: string;
  protocolPath: string;
  root: string;
  roundManifestPath: string;
  sessionCostReportPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "tn-next-steps-audit-"));
  await writeFileJson(join(root, "matrix-report.json"), report(repeats));
  await writeFileJson(join(root, "session-cost.json"), sessionCostReport());
  await writeText(join(root, "ROUND-5-PROTOCOL.md"), "## Post-Friction Pre-Commitment\nflip the starter default\nPRD-018 vanilla-lift trigger\nruntime diagnosability\nwrite the next PRD\n");
  await writeText(join(root, "packages/cli/src/commands/playtestAssertions.ts"), "TN_PLAYTEST_RESOURCE_STATE_STAGNATED effect-log.json observed values stayed\n");
  await writeText(join(root, "packages/cli/src/commands/playtestAssertions.test.ts"), "TN_PLAYTEST_RESOURCE_STATE_STAGNATED\n");
  await writeText(join(root, "tools/verify/src/apiCard.ts"), "HUD binding writes MeshRenderer\n");
  const manifestPath = join(root, "round-5-prepare-manifest.json");
  const candidates = ["typed-spec", "threenative", "vanilla"].flatMap((condition) => [1, 2, 3].map((repeat) => ({
    condition,
    path: join(root, "candidates", `${condition}-r${repeat}`),
    runId: `collector-${condition}-r${repeat}`,
  })));
  await writeFileJson(manifestPath, {
    candidates,
    conditions: ["typed-spec", "threenative", "vanilla"],
    promptId: "collector",
    repeats: 3,
    schema: "threenative.agent-benchmark-round-prepare",
    version: 1,
  });
  if (options.scored === true) {
    for (const candidate of candidates) {
      await writeFileJson(join(candidate.path, "session.json"), {});
      await writeFileJson(join(root, candidate.runId, "run-report.json"), {});
    }
  }
  return {
    matrixReportPath: join(root, "matrix-report.json"),
    protocolPath: join(root, "ROUND-5-PROTOCOL.md"),
    root,
    roundManifestPath: manifestPath,
    sessionCostReportPath: join(root, "session-cost.json"),
  };
}

async function writeFileJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
}

function sessionCostReport(): unknown {
  return {
    artifacts: {
      measurements: [{
        acceptance: {
          build: "pass",
          gamePlanApply: "pass",
          manualEdits: 0,
          playtest: "pass",
          scaffold: "pass",
          scenario: "playtests/top-down-collector.playtest.json",
        },
        failedCommandCount: 0,
        id: "typed-spec-recipe-top-down-collector",
        iterateOutputBytes: 1532,
        manualEditCount: 0,
        toolStepCount: 3,
      }],
    },
  };
}

function report(options: { threenativeRepeats: number; typedSpecRepeats: number; vanillaRepeats: number }): IBenchmarkReport {
  return {
    diagnostics: [],
    dialectConfusionFailureCount: 0,
    generatedAt: "2026-07-07T00:00:00.000Z",
    promptSummaries: [{
      behaviorMedian: {
        artifactForensicsCommandCount: null,
        discoveryCommandCount: null,
        engineSourceSearchCommandCount: null,
        iterateCommandCount: null,
        standaloneVerifyCommandCount: null,
      },
      costWeightedTokenRatio: null,
      dialectConfusionFailures: { threenative: 0, vanilla: 0 },
      failedCommandMedian: { threenative: null, vanilla: null },
      iterationMedian: { threenative: null, vanilla: null },
      promptClassification: "continuity",
      promptId: "collector",
      proofBar: {
        requiredAssertions: ["keyboard-movement", "pickup-objective", "win-state", "retry-path"],
        threenativePassed: options.threenativeRepeats >= 3,
        typedSpecPassed: options.typedSpecRepeats >= 3,
        vanillaPassed: options.vanillaRepeats >= 3,
      },
      rawTokenRatio: null,
      repeatCount: {
        threenative: options.threenativeRepeats,
        vanilla: options.vanillaRepeats,
      },
      threenativeMedianCachedInputTokens: null,
      threenativeMedianCostWeightedTokens: null,
      threenativeMedianFailedCommandCount: null,
      threenativeMedianInputTokens: null,
      threenativeMedianIterations: null,
      threenativeMedianOutputTokens: null,
      threenativeMedianTokens: null,
      threenativeMedianToolOutputBytes: null,
      threenativeMedianToolStepCount: null,
      threenativeMedianUncachedInputTokens: null,
      toolOutputMedian: { threenative: null, vanilla: null },
      toolStepMedian: { threenative: null, vanilla: null },
      typedSpecTrial: {
        failedCommandDelta: null,
        identicalAssertionRepeatDelta: null,
        maxSameDiagnosticDelta: null,
        rawTokenRatioToThreeNative: null,
        repeatCount: options.typedSpecRepeats,
        status: options.typedSpecRepeats >= 3 ? "default-candidate" : "insufficient-data",
        summary: "",
        typedSpecMedianFailedCommandCount: null,
        typedSpecMedianIdenticalAssertionRepeats: null,
        typedSpecMedianMaxSameDiagnostic: null,
        typedSpecMedianTokens: null,
        withinFailedCommandBudget: null,
        withinRepeatBudget: options.typedSpecRepeats >= 3,
        withinRetryChainBudget: null,
        withinTokenBudget: null,
      },
      vanillaMedianCachedInputTokens: null,
      vanillaMedianCostWeightedTokens: null,
      vanillaMedianFailedCommandCount: null,
      vanillaMedianInputTokens: null,
      vanillaMedianIterations: null,
      vanillaMedianOutputTokens: null,
      vanillaMedianTokens: null,
      vanillaMedianToolOutputBytes: null,
      vanillaMedianToolStepCount: null,
      vanillaMedianUncachedInputTokens: null,
      withinEqualProofTokenBudget: null,
      withinFailedCommandBudget: null,
      withinHalfX: null,
      withinInstructionAdoptionBudget: null,
      withinRepeatBudget: options.threenativeRepeats >= 3 && options.vanillaRepeats >= 3,
      withinRetryChainBudget: null,
      withinStepBudget: null,
    }],
    runCount: options.threenativeRepeats + options.typedSpecRepeats + options.vanillaRepeats,
    schema: "threenative.agent-benchmark-report",
    typedSpecVerdict: {
      status: options.typedSpecRepeats >= 3 ? "default-candidate" : "insufficient-data",
      summary: "",
      threshold: "typed-spec: equal proof repeats >=3; median tokens <= direct ThreeNative; failed commands ==0; retry chains <=1/0",
    },
    verdict: {
      status: options.threenativeRepeats >= 3 && options.vanillaRepeats >= 3 ? "pass" : "insufficient-data",
      summary: "",
      threshold: "equal-proof: continuity <=1.5x vanilla tokens; beyond-one-shot <=1.0x vanilla tokens; repeats >=3; failed commands ==0; retry chains <=1/0",
    },
    version: 2,
  };
}
