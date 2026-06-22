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
  assert.equal(payload.topics.some((topic) => topic.name === "scene"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "camera"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "transform"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "visual-qa"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "screenshot"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "record"), true);
  assert.equal(payload.topics.some((topic) => topic.name === "examples"), true);
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

test("should describe the agent scene authoring loop", async () => {
  const result = await helpCommand(["scene", "--json"]);
  const payload = JSON.parse(result.stdout) as { commands: string[]; examples: string[]; failureSymptoms: string[]; name: string };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.name, "scene");
  assert.equal(payload.commands.includes("tn scene create <scene-id> [--file <path>] --json"), true);
  assert.equal(payload.commands.includes("tn build --json"), true);
  assert.equal(payload.commands.includes("tn scene proof <scene-id> --project <path> --web-url <preview-url> --out artifacts/proof --native --json"), true);
  assert.equal(payload.examples.some((example) => example.includes("MCP tools wrap tn commands")), true);
  assert.equal(payload.failureSymptoms.some((symptom) => symptom.includes("missing first .scene.json")), true);
});

test("should mention asset inspection in asset help", async () => {
  const result = await helpCommand(["assets", "--json"]);
  const payload = JSON.parse(result.stdout) as { commands: string[]; docs: string[]; examples: string[] };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.commands.includes("tn asset inspect <path> [--json]"), true);
  assert.equal(payload.docs.includes("docs/workflows/asset-pipeline.md"), true);
  assert.equal(payload.examples.includes("tn asset inspect assets/kart.glb --json"), true);
});

test("should resolve aliases for topic help", async () => {
  const result = await helpCommand(["proof", "--json"]);
  const payload = JSON.parse(result.stdout) as { name: string; failureSymptoms: string[] };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.name, "visual-qa");
  assert.equal(payload.failureSymptoms.some((symptom) => symptom.includes("black")), true);
});

test("should describe racing-kart from examples help", async () => {
  const result = await helpCommand(["examples", "--json"]);
  const payload = JSON.parse(result.stdout) as { commands: string[]; docs: string[]; examples: string[]; name: string };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.name, "examples");
  assert.equal(payload.commands.includes("tn create kart-racer --template racing-kart --json"), true);
  assert.equal(payload.docs.includes("templates/racing-kart/README.md"), true);
  assert.equal(payload.examples.some((example) => example.includes("visible rivals")), true);
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
