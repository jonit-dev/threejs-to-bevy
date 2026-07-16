import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { captureBenchmarkSession } from "./session-capture.js";

test("captures real agent usage without pricing scaffold-created JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-benchmark-session-capture-"));
  const eventsPath = join(root, "codex-events.jsonl");
  const templatePath = join(root, "session.template.json");
  const outPath = join(root, "session.json");
  await writeFile(templatePath, `${JSON.stringify(template())}\n`);
  await writeFile(eventsPath, [
    JSON.stringify({ type: "item.completed", item: { type: "command_execution", status: "completed", exit_code: 0, aggregated_output: "{\"generated\":true}" } }),
    JSON.stringify({ type: "item.completed", item: { type: "command_execution", status: "failed", exit_code: 1, aggregated_output: "bad" } }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 200 } }),
  ].join("\n"));

  const result = await captureBenchmarkSession({ eventsPath, outPath, stopReason: "claimed-playable", templatePath });
  const session = JSON.parse(await readFile(outPath, "utf8")) as Record<string, unknown>;

  assert.equal(result.generatedArtifactTokensExcluded, true);
  assert.equal(session.tokenAccounting, "codex-turn-usage");
  assert.equal(session.tokenCount, 1200);
  assert.equal(session.inputTokens, 1000);
  assert.equal(session.cachedInputTokens, 400);
  assert.equal(session.uncachedInputTokens, 600);
  assert.equal(session.outputTokens, 200);
  assert.equal(session.costWeightedTokens, 840);
  assert.equal(session.toolOutputBytes, 21);
  assert.equal(session.toolStepCount, 2);
  assert.equal(session.failedCommandCount, 1);
});

test("rejects event streams without authoritative agent usage", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-benchmark-session-capture-missing-"));
  const eventsPath = join(root, "codex-events.jsonl");
  const templatePath = join(root, "session.template.json");
  await writeFile(templatePath, `${JSON.stringify(template())}\n`);
  await writeFile(eventsPath, `${JSON.stringify({ type: "turn.started" })}\n`);
  await assert.rejects(captureBenchmarkSession({ eventsPath, outPath: join(root, "session.json"), templatePath }), /completed turn with token usage/);
});

function template(): Record<string, unknown> {
  return { condition: "threenative", humanRubric: { playability: 0, visual: 0 }, iterationCount: 0, promptId: "checkpoint-race", runId: "checkpoint-race-threenative-r1", schema: "threenative.agent-benchmark-session", stopReason: "operator-stopped", tokenCount: 0, version: 2 };
}
