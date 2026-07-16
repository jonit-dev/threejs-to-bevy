import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inferBenchmarkProofFromArtifacts } from "./proof-adapter.js";

test("should infer passing collector proof from playtest summary assertions", async () => {
  const root = await candidateWithSummary([
    assertion("movement", true, { distance: 3.5 }),
    assertion("resource.GameState.scoreText", true, { after: "Score 5 / 5", before: "Score 0 / 5" }),
    assertion("resource.GameState.statusText", true, { after: "You win - press R or Enter to retry", before: "Collect all pickups" }),
  ]);

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "collector" });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.proof?.ok, true);
  assert.equal(result.proof?.assertions.find((item) => item.id === "keyboard-movement")?.pass, true);
  assert.equal(result.proof?.assertions.find((item) => item.id === "pickup-objective")?.pass, true);
  assert.equal(result.proof?.assertions.find((item) => item.id === "win-state")?.pass, true);
  assert.equal(result.proof?.assertions.find((item) => item.id === "retry-path")?.pass, true);
});

test("should choose passing collector proof when reset summary appears first", async () => {
  const root = await candidateWithSummaries([
    [
      assertion("movement", true, { distance: 0.8 }),
      assertion("resource.GameState.scoreText", true, { after: "Score 0 / 5", before: "Score 5 / 5" }),
      assertion("resource.GameState.statusText", true, { after: "Collect all pickups", before: "All pickups collected - press R to retry" }),
    ],
    [
      assertion("movement", true, { distance: 2.4 }),
      assertion("resource.GameState.scoreText", true, { after: "Score 5 / 5", before: "Score 0 / 5" }),
      assertion("resource.GameState.statusText", true, { after: "All pickups collected - press R to retry", before: "Collect all pickups" }),
    ],
  ]);

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "collector" });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.proof?.ok, true);
  assert.equal(result.proof?.assertions.find((item) => item.id === "retry-path")?.pass, true);
});

test("should combine generated scaffold collector proof across iterate summaries", async () => {
  const root = await candidateWithSummaries([
    [
      assertion("movement", true, { distance: 4.2 }),
      assertion("resource.GameState", true, {
        after: { scoreText: "Score 1 / 5", statusText: "Collect all pickups", won: false },
        before: { scoreText: "Score 0 / 5", statusText: "Collect all pickups", won: false },
      }),
      assertion("hud.hud.progress", true, { after: { text: "Score 1 / 5" }, before: { text: "Score 0 / 5" } }),
    ],
    [
      assertion("movement", true, { distance: 4.2 }),
      assertion("resource.GameState.won", true, { after: true, before: false }),
      assertion("hud.hud.status", true, { after: { text: "All pickups collected - press R to retry" }, before: { text: "Collect all pickups" } }),
    ],
    [
      assertion("resource.GameState.statusText", true, { after: "Collect all pickups", before: "Collect all pickups" }),
      assertion("hud.hud.retry", true, { after: { text: "Press R to retry" }, before: { text: "Press R to retry" } }),
    ],
  ]);

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "collector" });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.proof?.ok, true);
  assert.equal(result.proof?.assertions.find((item) => item.id === "keyboard-movement")?.pass, true);
  assert.equal(result.proof?.assertions.find((item) => item.id === "pickup-objective")?.pass, true);
  assert.equal(result.proof?.assertions.find((item) => item.id === "win-state")?.pass, true);
  assert.equal(result.proof?.assertions.find((item) => item.id === "retry-path")?.pass, true);
});

test("should infer passing collector proof from neutral browser artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-neutral-proof-"));
  await mkdir(join(root, "artifacts", "proof"), { recursive: true });
  await writeFile(join(root, "artifacts", "proof", "collector-proof.json"), `${JSON.stringify({
    assertions: [
      assertion("keyboard-movement", true, { evidence: "actual keyboard/browser run" }),
      assertion("pickup-objective", true, { scoreText: "Score 5 / 5" }),
      assertion("win-state", true, { statusText: "All pickups collected - press R to retry" }),
      assertion("retry-path", true, { resetScoreText: "Score 0 / 5" }),
    ],
    promptId: "collector",
    schema: "threenative.agent-benchmark-proof",
  }, null, 2)}\n`, "utf8");

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "collector" });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.proof?.ok, true);
  assert.equal(result.proof?.assertions.find((item) => item.id === "pickup-objective")?.pass, true);
});

test("should report failing neutral browser artifact proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-neutral-proof-fail-"));
  await mkdir(join(root, "artifacts", "proof"), { recursive: true });
  await writeFile(join(root, "artifacts", "proof", "collector-proof.json"), `${JSON.stringify({
    assertions: [
      assertion("keyboard-movement", true, { evidence: "actual keyboard/browser run" }),
      assertion("pickup-objective", false, { scoreText: "Score 2 / 5" }),
      assertion("win-state", false, { statusText: "Collect all pickups" }),
      assertion("retry-path", false, { resetScoreText: "Score 2 / 5" }),
    ],
    promptId: "collector",
    schema: "threenative.agent-benchmark-proof",
  }, null, 2)}\n`, "utf8");

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "collector" });

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_EQUAL_PROOF_FAILED"), true);
  assert.equal(result.proof?.ok, false);
});

test("should infer off-recipe proof from a prompt-matched neutral artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-checkpoint-proof-"));
  await mkdir(join(root, "artifacts", "proof"), { recursive: true });
  await writeFile(join(root, "artifacts", "proof", "checkpoint-race-proof.json"), `${JSON.stringify({
    assertions: [
      assertion("ordered-checkpoints", true, { evidence: "browser route run" }),
      assertion("timer-or-counter", true, { checkpointCounter: "3 / 3" }),
      assertion("finish-state", true, { status: "Finished" }),
      assertion("retry-path", true, { status: "Press R to retry" }),
    ],
    promptId: "checkpoint-race",
    schema: "threenative.agent-benchmark-proof",
  }, null, 2)}\n`, "utf8");

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "checkpoint-race" });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.proof?.ok, true);
  assert.equal(result.proof?.classification, "beyond-one-shot");
});

test("should infer physics knockdown proof only from observed impact and retry summaries", async () => {
  const root = await candidateWithNamedSummaries([
    {
      assertions: [
        assertion("movement", true, { distance: 128.75, threshold: 2.5 }),
        assertion("resource.GameScore.score", true, { after: 4, before: 0 }),
      ],
      scenario: "block-physics-target",
    },
    {
      assertions: [
        assertion("resource.GameScore.score", true, { after: 0, before: 0 }),
        assertion("resource.GameScore.statusText", true, { after: "SPACE: LAUNCH - ENTER/R: RETRY", before: "TARGET DOWN" }),
      ],
      scenario: "block-physics-target-retry",
    },
  ]);

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "physics-knockdown" });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.proof?.ok, true);
  assert.deepEqual(result.proof?.assertions.map((item) => item.id), ["launch-or-push", "target-displacement", "score-updates", "retry-path"]);
});

test("should reject physics knockdown summaries when score did not increase", async () => {
  const root = await candidateWithNamedSummaries([{ assertions: [
    assertion("movement", true, { distance: 12, threshold: 2.5 }),
    assertion("resource.GameScore.score", true, { after: 0, before: 0 }),
  ], scenario: "block-physics-target" }]);

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "physics-knockdown" });

  assert.equal(result.proof?.ok, false);
  assert.equal(result.proof?.assertions.find((item) => item.id === "score-updates")?.pass, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_EQUAL_PROOF_FAILED"), true);
});

test("should infer checkpoint race proof from ordered progress, timer, finish, and retry observations", async () => {
  const root = await candidateWithNamedSummaries([
    {
      assertions: [
        assertion("resource.RaceState.nextCheckpoint", true, { after: 5, before: 0 }),
        assertion("resource.RaceState.time", true, { after: 1.3, before: 0 }),
        assertion("resource.RaceState.finished", true, { after: true, before: false }),
        assertion("hud.race.status", true, { after: { text: "FINISH! Time 1.3s - R/ENTER: RETRY" }, before: { text: "DRIVE" } }),
      ],
      scenario: "vehicle-checkpoint",
    },
    {
      assertions: [
        assertion("resource.RaceState.nextCheckpoint", true, { after: 0, before: 0 }),
        assertion("resource.RaceState.finished", true, { after: false, before: false }),
        assertion("hud.race.status", true, { after: { text: "DRIVE - R/ENTER: RETRY" }, before: { text: "DRIVE - R/ENTER: RETRY" } }),
      ],
      scenario: "vehicle-checkpoint-retry",
    },
  ]);

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "checkpoint-race" });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.proof?.ok, true);
  assert.deepEqual(result.proof?.assertions.map((item) => item.id), ["ordered-checkpoints", "timer-or-counter", "finish-state", "retry-path"]);
});

test("should reject checkpoint summaries without an observed finish transition", async () => {
  const root = await candidateWithNamedSummaries([{ assertions: [
    assertion("resource.RaceState.nextCheckpoint", true, { after: 5, before: 0 }),
    assertion("resource.RaceState.time", true, { after: 1.3, before: 0 }),
    assertion("resource.RaceState.finished", false, { after: false, before: false }),
  ], scenario: "vehicle-checkpoint" }]);

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "checkpoint-race" });

  assert.equal(result.proof?.ok, false);
  assert.equal(result.proof?.assertions.find((item) => item.id === "finish-state")?.pass, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_EQUAL_PROOF_FAILED"), true);
});

test("should infer failing collector proof from unchanged score and status assertions", async () => {
  const root = await candidateWithSummary([
    assertion("movement", true, { distance: 6.5 }),
    assertion("resource.GameState.scoreText", false, { after: "Score 0 / 5", before: "Score 0 / 5" }),
    assertion("resource.GameState.statusText", false, { after: "Collect all five pickups", before: "Collect all five pickups" }),
  ], [{
    code: "TN_PLAYTEST_RESOURCE_STATE_STAGNATED",
    message: "Resource did not change.",
    severity: "error",
  }]);

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "collector" });

  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_EQUAL_PROOF_FAILED"), true);
  assert.equal(result.proof?.ok, false);
  assert.equal(result.proof?.assertions.find((item) => item.id === "keyboard-movement")?.pass, true);
  assert.equal(result.proof?.assertions.find((item) => item.id === "pickup-objective")?.pass, false);
  assert.equal(result.proof?.assertions.find((item) => item.id === "win-state")?.pass, false);
  assert.equal(result.proof?.assertions.find((item) => item.id === "retry-path")?.pass, false);
});

test("should leave unsupported prompts without inferred proof", async () => {
  const root = await candidateWithSummary([
    assertion("movement", true, { distance: 3.5 }),
  ]);

  const result = await inferBenchmarkProofFromArtifacts({ candidate: root, promptId: "lane-runner" });

  assert.deepEqual(result, { diagnostics: [] });
});

async function candidateWithSummary(assertions: unknown[], diagnostics: unknown[] = []): Promise<string> {
  const root = await candidateWithSummaries([assertions], diagnostics);
  return root;
}

async function candidateWithSummaries(summaries: unknown[][], diagnostics: unknown[] = []): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-proof-adapter-"));
  for (const [index, assertions] of summaries.entries()) {
    const summaryDir = join(root, "artifacts", `proof-${index}`);
    await mkdir(summaryDir, { recursive: true });
    await writeFile(join(summaryDir, "summary.json"), `${JSON.stringify({ assertions, diagnostics }, null, 2)}\n`, "utf8");
  }
  return root;
}

async function candidateWithNamedSummaries(summaries: Array<{ assertions: unknown[]; scenario: string }>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-named-proof-adapter-"));
  for (const [index, summary] of summaries.entries()) {
    const summaryDir = join(root, "artifacts", `proof-${index}`);
    await mkdir(summaryDir, { recursive: true });
    await writeFile(join(summaryDir, "summary.json"), `${JSON.stringify({ ...summary, diagnostics: [] }, null, 2)}\n`, "utf8");
  }
  return root;
}

function assertion(id: string, pass: boolean, details: Record<string, unknown>): Record<string, unknown> {
  return { details, id, pass };
}
