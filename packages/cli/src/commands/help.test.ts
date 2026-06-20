import assert from "node:assert/strict";
import test from "node:test";

import { helpCommand } from "./help.js";

test("should list task-oriented help topics", async () => {
  const result = await helpCommand(["--json"]);
  const payload = JSON.parse(result.stdout) as { code: string; topics: Array<{ name: string }> };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_HELP_TOPICS");
  assert.equal(payload.topics.some((topic) => topic.name === "scaffold"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "assets"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "camera"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "transform"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "visual-qa"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "screenshot"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "record"), true);
});

test("should render known help topic with commands and docs", async () => {
  const result = await helpCommand(["scaffold", "--json"]);
  const payload = JSON.parse(result.stdout) as { code: string; commands: string[]; docs: string[]; name: string };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_HELP_TOPIC");
  assert.equal(payload.name, "scaffold");
  assert.equal(payload.commands.includes("tn init <name> [--template <template>]"), true);
  assert.equal(payload.docs.includes("docs/workflows/developer-workflow.md"), true);
});

test("should resolve aliases for topic help", async () => {
  const result = await helpCommand(["proof", "--json"]);
  const payload = JSON.parse(result.stdout) as { name: string; failureSymptoms: string[] };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.name, "visual-qa");
  assert.equal(payload.failureSymptoms.some((symptom) => symptom.includes("black")), true);
});

test("should reject unknown help topic with stable diagnostic", async () => {
  const result = await helpCommand(["teleportation", "--json"]);
  const payload = JSON.parse(result.stdout) as { code: string; severity: string; topic: string; topics: string[] };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_HELP_TOPIC_UNKNOWN");
  assert.equal(payload.severity, "error");
  assert.equal(payload.topic, "teleportation");
  assert.equal(payload.topics.includes("assets"), true);
});
