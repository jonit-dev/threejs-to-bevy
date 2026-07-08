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

function assertion(id: string, pass: boolean, details: Record<string, unknown>): Record<string, unknown> {
  return { details, id, pass };
}
