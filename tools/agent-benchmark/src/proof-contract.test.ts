import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BENCHMARK_OBSERVATION_PROTOCOL, BENCHMARK_OBSERVATION_PROTOCOL_VERSION, BENCHMARK_PROOF_CONTRACTS, validatePromptProofContracts } from "./proof-contract.js";

test("should version scorer-owned observations separately from frozen prompts", () => {
  assert.equal(BENCHMARK_OBSERVATION_PROTOCOL_VERSION, "observation-route-v8");
  assert.deepEqual(BENCHMARK_OBSERVATION_PROTOCOL, {
    protocolVersion: "observation-route-v8",
    schema: "threenative.agent-benchmark-observation-protocol",
    version: 8,
  });
});

test("should require proof assertions for every prompt", async () => {
  const diagnostics = await validatePromptProofContracts({ promptsDir: "prompts" });

  assert.deepEqual(diagnostics, []);
  assert.equal(BENCHMARK_PROOF_CONTRACTS.every((contract) => contract.assertions.length >= 3), true);
});

test("should classify continuity and beyond-one-shot prompts", () => {
  const classifications = new Map(BENCHMARK_PROOF_CONTRACTS.map((contract) => [contract.promptId, contract.classification]));

  assert.equal(classifications.get("collector"), "continuity");
  assert.equal(classifications.get("lane-runner"), "continuity");
  assert.equal(classifications.get("checkpoint-race"), "beyond-one-shot");
  assert.equal(classifications.get("physics-knockdown"), "beyond-one-shot");
  assert.equal(classifications.get("grid-push-puzzle"), "beyond-one-shot");
  assert.equal(classifications.get("wave-defense"), "beyond-one-shot");
  assert.equal(classifications.get("turn-based-tactics"), "beyond-one-shot");
});

test("should expose complete proof for every frozen unfamiliar prompt", () => {
  const unfamiliarPromptIds = ["grid-push-puzzle", "wave-defense", "turn-based-tactics"];
  const contracts = unfamiliarPromptIds.map((promptId) =>
    BENCHMARK_PROOF_CONTRACTS.find((contract) => contract.promptId === promptId));

  for (const contract of contracts) {
    assert.ok(contract);
    assert.match(contract.promptSha256, /^[a-f0-9]{64}$/);
    assert.equal(contract.protocolVersion.endsWith(contract.promptSha256.slice(0, 12)), true);
    assert.equal(contract.assertions.some((item) => /input|movement|selection|push/i.test(`${item.id} ${item.description}`)), true);
    assert.equal(contract.assertions.some((item) => /objective|progress|wave|goal/i.test(`${item.id} ${item.description}`)), true);
    assert.equal(contract.assertions.some((item) => /retry|reset|failure|fail/i.test(`${item.id} ${item.description}`)), true);
  }
});

test("should retain material grid and wave requirements in equal-proof assertions", () => {
  const grid = BENCHMARK_PROOF_CONTRACTS.find((contract) => contract.promptId === "grid-push-puzzle");
  const wave = BENCHMARK_PROOF_CONTRACTS.find((contract) => contract.promptId === "wave-defense");

  assert.ok(grid);
  assert.ok(wave);
  assert.match(grid.assertions.find((item) => item.id === "crate-push")?.description ?? "", /at least two visible crates/i);
  assert.match(grid.assertions.find((item) => item.id === "grid-movement")?.description ?? "", /readable floor-grid and wall geometry/i);
  assert.match(wave.assertions.find((item) => item.id === "wave-progression")?.description ?? "", /later waves become meaningfully harder/i);
});

test("should reject prompt content drift without a protocol version bump", async () => {
  const promptsDir = await mkdtemp(join(tmpdir(), "tn-frozen-prompts-"));
  try {
    await Promise.all(BENCHMARK_PROOF_CONTRACTS.map(async (contract) => {
      const source = await readFile(join("prompts", `${contract.promptId}.md`), "utf8");
      await writeFile(join(promptsDir, `${contract.promptId}.md`), source, "utf8");
    }));
    await writeFile(
      join(promptsDir, "wave-defense.md"),
      `${await readFile(join(promptsDir, "wave-defense.md"), "utf8")}\nUnreviewed rule change.\n`,
      "utf8",
    );

    const diagnostics = await validatePromptProofContracts({ promptsDir });

    assert.equal(diagnostics.some((item) => item.code === "TN_BENCH_PROMPT_CONTENT_DRIFT" && item.message.startsWith("wave-defense:")), true);
  } finally {
    await rm(promptsDir, { force: true, recursive: true });
  }
});
