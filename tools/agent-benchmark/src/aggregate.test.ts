import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { aggregateRunReports } from "./aggregate.js";

test("should compute cached and uncached token medians", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const vanilla = join(root, "vanilla.json");
  const threenative = join(root, "threenative.json");
  await writeFile(vanilla, JSON.stringify(run("vanilla", 1000), null, 2));
  await writeFile(threenative, JSON.stringify(run("threenative", 400), null, 2));
  const report = await aggregateRunReports([vanilla, threenative]);
  const summary = report.promptSummaries[0];

  assert.equal(report.verdict.status, "pass");
  assert.equal(summary?.withinHalfX, true);
  assert.equal(summary?.threenativeMedianCachedInputTokens, 40);
  assert.equal(summary?.threenativeMedianUncachedInputTokens, 300);
  assert.equal(summary?.threenativeMedianOutputTokens, 60);
  assert.equal(summary?.threenativeMedianCostWeightedTokens, 364);
  assert.equal(summary?.rawTokenRatio, 0.4);
});

test("should fail when threenative raw median exceeds half vanilla", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const vanilla = join(root, "vanilla.json");
  const threenative = join(root, "threenative.json");
  await writeFile(vanilla, JSON.stringify(run("vanilla", 1000), null, 2));
  await writeFile(threenative, JSON.stringify(run("threenative", 600), null, 2));
  const report = await aggregateRunReports([vanilla, threenative]);

  assert.equal(report.verdict.status, "fail");
  assert.equal(report.promptSummaries[0]?.withinHalfX, false);
});

test("should include failed command and tool output medians", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const vanilla = join(root, "vanilla.json");
  const threenative = join(root, "threenative.json");
  await writeFile(vanilla, JSON.stringify({ ...run("vanilla", 1000), session: { ...run("vanilla", 1000).session, failedCommandCount: 1, toolOutputBytes: 2048 } }, null, 2));
  await writeFile(threenative, JSON.stringify({ ...run("threenative", 400), session: { ...run("threenative", 400).session, failedCommandCount: 3, toolOutputBytes: 8192 } }, null, 2));
  const report = await aggregateRunReports([vanilla, threenative]);
  const summary = report.promptSummaries[0];

  assert.equal(summary?.failedCommandMedian.threenative, 3);
  assert.equal(summary?.failedCommandMedian.vanilla, 1);
  assert.equal(summary?.toolOutputMedian.threenative, 8192);
  assert.equal(summary?.toolOutputMedian.vanilla, 2048);
});

test("should fail present ThreeNative step budget above 12 steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-benchmark-aggregate-"));
  const vanilla = join(root, "vanilla.json");
  const threenative = join(root, "threenative.json");
  await writeFile(vanilla, JSON.stringify({ ...run("vanilla", 1000), session: { ...run("vanilla", 1000).session, toolStepCount: 4 } }, null, 2));
  await writeFile(threenative, JSON.stringify({ ...run("threenative", 400), session: { ...run("threenative", 400).session, toolStepCount: 13 } }, null, 2));
  const report = await aggregateRunReports([vanilla, threenative]);
  const summary = report.promptSummaries[0];

  assert.equal(report.verdict.status, "fail");
  assert.equal(summary?.withinHalfX, true);
  assert.equal(summary?.withinStepBudget, false);
  assert.equal(summary?.toolStepMedian.threenative, 13);
});

function run(condition: "threenative" | "vanilla", tokenCount: number) {
  return {
    artifacts: {},
    candidate: `/tmp/${condition}`,
    condition,
    diagnostics: [],
    generatedAt: "2026-07-06T00:00:00.000Z",
    ok: true,
    promptId: "collector",
    runId: `${condition}-1`,
    schema: "threenative.agent-benchmark-run",
    session: {
      condition,
      costWeightedTokens: tokenCount === 400 ? 364 : tokenCount === 600 ? 546 : 910,
      cachedInputTokens: tokenCount * 0.1,
      humanRubric: { playability: 2, visual: 2 },
      inputTokens: tokenCount * 0.85,
      iterationCount: 1,
      outputTokens: tokenCount * 0.15,
      promptId: "collector",
      runId: `${condition}-1`,
      schema: "threenative.agent-benchmark-session",
      stopReason: "claimed-playable",
      tokenCount,
      toolOutputBytes: 4096,
      uncachedInputTokens: tokenCount * 0.75,
      version: 2,
    },
    version: 2,
  };
}
