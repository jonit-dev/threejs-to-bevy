import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { runFreshSession } from "./session-runner.js";

test("should pin fresh ThreeNative sessions to the built workspace CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-benchmark-runner-root-"));
  const candidate = await preparedCandidate(root);
  await writeFile(join(root, "packages-cli-placeholder"), "", "utf8");
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
const messages = [];
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
createInterface({ input: process.stdin }).on("line", async (line) => {
  const message = JSON.parse(line); messages.push(message);
  if (message.id && message.method === "initialize") send({ id: message.id, jsonrpc: "2.0", result: {} });
  if (message.id && message.method === "thread/start") send({ id: message.id, jsonrpc: "2.0", result: { thread: { id: "thread-1", cliVersion: "test" } } });
  if (message.id && message.method === "thread/goal/set") send({ id: message.id, jsonrpc: "2.0", result: { goal: {} } });
  if (message.id && message.method === "turn/start") {
    await writeFile("runner-observation.json", JSON.stringify({ args: process.argv.slice(2), messages, path: process.env.PATH }));
    send({ id: message.id, jsonrpc: "2.0", result: { turn: { id: "turn-1" } } });
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "thread/tokenUsage/updated", params: { tokenUsage: { total: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 2, totalTokens: 12 } } } });
      send({ jsonrpc: "2.0", method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1" } } });
    }, 10);
  }
});
`, "utf8");
  await chmod(fakeCodex, 0o755);

  const result = await runFreshSession({ candidate, codexBin: fakeCodex, condition: "threenative", root });
  const observation = JSON.parse(await readFile(join(candidate, "runner-observation.json"), "utf8")) as {
    args: string[];
    messages: Array<{ method?: string; params?: unknown }>;
    path: string;
  };
  const wrapper = await readFile(join(candidate, ".benchmark-bin/tn"), "utf8");
  const goal = observation.messages.find((message) => message.method === "thread/goal/set");
  const turn = observation.messages.find((message) => message.method === "turn/start");

  assert.equal(result.ok, true);
  assert.deepEqual(observation.args, [
    "app-server",
    "--listen",
    "stdio://",
    "--config",
    'project_root_markers=["benchmark-observation-protocol.json"]',
    "--disable",
    "plugins",
    "--disable",
    "plugin_sharing",
  ]);
  assert.match(wrapper, /packages\/cli\/dist\/index\.js/u);
  assert.equal(observation.path.startsWith(join(candidate, ".benchmark-bin")), true);
  assert.match(JSON.stringify(goal?.params), /tokenBudget/u);
  assert.match(JSON.stringify(turn?.params), /Neutral proof only/u);
  assert.doesNotMatch(JSON.stringify(turn?.params), /After The Agent Stops/u);
  assert.match(JSON.stringify(turn?.params), /25 tool-call starts/u);
  assert.match(await readFile(join(candidate, ".benchmark-bin/codex"), "utf8"), /Nested agent sessions are disabled/u);
  assert.equal(JSON.parse(await readFile(join(candidate, "session.json"), "utf8")).stopReason, "turn-completed");
  await assert.rejects(
    runFreshSession({ candidate, codexBin: fakeCodex, condition: "threenative", root }),
    /append-only; refusing to overwrite/u,
  );
});

test("should interrupt a fresh session that exceeds the tool-step cap", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-benchmark-runner-cap-"));
  const candidate = await preparedCandidate(root);
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { createInterface } from "node:readline";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id && message.method === "initialize") send({ id: message.id, jsonrpc: "2.0", result: {} });
  if (message.id && message.method === "thread/start") send({ id: message.id, jsonrpc: "2.0", result: { thread: { id: "thread-1", cliVersion: "test" } } });
  if (message.id && message.method === "thread/goal/set") send({ id: message.id, jsonrpc: "2.0", result: { goal: {} } });
  if (message.id && message.method === "turn/start") {
    send({ id: message.id, jsonrpc: "2.0", result: { turn: { id: "turn-1" } } });
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "turn/started", params: { threadId: "thread-1", turn: { id: "active-turn" } } });
      for (let index = 0; index < 3; index += 1) {
        send({ jsonrpc: "2.0", method: "item/started", params: { item: { id: "cmd-" + index, type: "commandExecution", status: "inProgress" } } });
        send({ jsonrpc: "2.0", method: "item/completed", params: { item: { id: "cmd-" + index, type: "commandExecution", status: "completed", exitCode: 0, aggregatedOutput: "ok" } } });
      }
    }, 10);
  }
  if (message.id && message.method === "turn/interrupt") {
    if (message.params.turnId !== "active-turn") send({ id: message.id, jsonrpc: "2.0", error: { code: -32600, message: "wrong active turn" } });
    else send({ id: message.id, jsonrpc: "2.0", result: {} });
    send({ jsonrpc: "2.0", method: "thread/tokenUsage/updated", params: { tokenUsage: { total: { inputTokens: 20, cachedInputTokens: 0, outputTokens: 3, totalTokens: 23 } } } });
    send({ jsonrpc: "2.0", method: "turn/completed", params: { threadId: "thread-1", turn: { id: "active-turn" } } });
  }
});
`, "utf8");
  await chmod(fakeCodex, 0o755);

  const result = await runFreshSession({ candidate, codexBin: fakeCodex, condition: "vanilla", maxToolSteps: 3, root });

  assert.equal(result.ok, true);
  assert.equal(result.toolStepLimitExceeded, true);
  assert.equal(result.toolStepCount, 3);
});

test("should reserve enough usage to stop before the raw-token hard cap", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-benchmark-runner-token-cap-"));
  const candidate = await preparedCandidate(root);
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { createInterface } from "node:readline";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id && message.method === "initialize") send({ id: message.id, jsonrpc: "2.0", result: {} });
  if (message.id && message.method === "thread/start") send({ id: message.id, jsonrpc: "2.0", result: { thread: { id: "thread-1", cliVersion: "test" } } });
  if (message.id && message.method === "thread/goal/set") send({ id: message.id, jsonrpc: "2.0", result: { goal: {} } });
  if (message.id && message.method === "turn/start") {
    send({ id: message.id, jsonrpc: "2.0", result: { turn: { id: "placeholder" } } });
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "turn/started", params: { turn: { id: "active-turn" } } });
      send({ jsonrpc: "2.0", method: "thread/tokenUsage/updated", params: { tokenUsage: { total: { inputTokens: 99000, cachedInputTokens: 70000, outputTokens: 1001, totalTokens: 100001 } } } });
    }, 10);
  }
  if (message.id && message.method === "turn/interrupt") {
    send({ id: message.id, jsonrpc: "2.0", result: {} });
    send({ jsonrpc: "2.0", method: "turn/completed", params: { turn: { id: "active-turn" } } });
  }
});
`, "utf8");
  await chmod(fakeCodex, 0o755);

  const result = await runFreshSession({ candidate, codexBin: fakeCodex, condition: "vanilla", root });

  assert.equal(result.stopCause, "token-cap");
  assert.equal(result.tokenCount, 100001);
  assert.equal(result.tokenCount <= 300000, true);
});

test("should expose a configured Playwright browser cache inside the isolated home", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-benchmark-runner-playwright-cache-"));
  const candidate = await preparedCandidate(root);
  const browserCache = join(root, "host-playwright-cache");
  const fakeCodex = join(root, "fake-codex.mjs");
  const previousCache = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const { mkdir } = await import("node:fs/promises");
  await mkdir(browserCache, { recursive: true });
  await writeFile(join(browserCache, "cache-marker"), "ready\n", "utf8");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
createInterface({ input: process.stdin }).on("line", async (line) => {
  const message = JSON.parse(line);
  if (message.id && message.method === "initialize") send({ id: message.id, jsonrpc: "2.0", result: {} });
  if (message.id && message.method === "thread/start") send({ id: message.id, jsonrpc: "2.0", result: { thread: { id: "thread-1", cliVersion: "test" } } });
  if (message.id && message.method === "thread/goal/set") send({ id: message.id, jsonrpc: "2.0", result: { goal: {} } });
  if (message.id && message.method === "turn/start") {
    let cacheAvailable = true;
    try { await access(join(process.env.HOME, ".cache", "ms-playwright", "cache-marker")); } catch { cacheAvailable = false; }
    await writeFile("playwright-cache-observation.json", JSON.stringify({ cacheAvailable, configuredPath: process.env.PLAYWRIGHT_BROWSERS_PATH }));
    send({ id: message.id, jsonrpc: "2.0", result: { turn: { id: "turn-1" } } });
    setTimeout(() => send({ jsonrpc: "2.0", method: "turn/completed", params: { turn: { id: "turn-1" } } }), 10);
  }
});
`, "utf8");
  await chmod(fakeCodex, 0o755);

  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH = browserCache;
    const result = await runFreshSession({ candidate, codexBin: fakeCodex, condition: "vanilla", root });
    const observation = JSON.parse(await readFile(join(candidate, "playwright-cache-observation.json"), "utf8")) as { cacheAvailable: boolean; configuredPath?: string };

    assert.equal(result.ok, true);
    assert.equal(observation.cacheAvailable, true);
    assert.equal(observation.configuredPath, undefined);
  } finally {
    if (previousCache === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = previousCache;
  }
});

test("should defer token-cap interruption until the in-flight tool completes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-benchmark-runner-token-tool-"));
  const candidate = await preparedCandidate(root);
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
let toolCompleted = false;
createInterface({ input: process.stdin }).on("line", async (line) => {
  const message = JSON.parse(line);
  if (message.id && message.method === "initialize") send({ id: message.id, jsonrpc: "2.0", result: {} });
  if (message.id && message.method === "thread/start") send({ id: message.id, jsonrpc: "2.0", result: { thread: { id: "thread-1", cliVersion: "test" } } });
  if (message.id && message.method === "thread/goal/set") send({ id: message.id, jsonrpc: "2.0", result: { goal: {} } });
  if (message.id && message.method === "turn/start") {
    send({ id: message.id, jsonrpc: "2.0", result: { turn: { id: "turn-1" } } });
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "turn/started", params: { turn: { id: "active-turn" } } });
      send({ jsonrpc: "2.0", method: "item/started", params: { item: { id: "active-command", type: "commandExecution", status: "inProgress" } } });
      send({ jsonrpc: "2.0", method: "item/started", params: { item: { id: "command-file-change", type: "fileChange", status: "inProgress" } } });
      send({ jsonrpc: "2.0", method: "thread/tokenUsage/updated", params: { tokenUsage: { total: { inputTokens: 259000, cachedInputTokens: 200000, outputTokens: 1001, totalTokens: 260001 } } } });
      setTimeout(() => {
        toolCompleted = true;
        send({ jsonrpc: "2.0", method: "item/completed", params: { item: { id: "active-command", type: "commandExecution", status: "completed", exitCode: 0, aggregatedOutput: "finished" } } });
      }, 100);
    }, 10);
  }
  if (message.id && message.method === "turn/interrupt") {
    await writeFile("interrupt-observation.json", JSON.stringify({ toolCompleted }));
    send({ id: message.id, jsonrpc: "2.0", result: {} });
    send({ jsonrpc: "2.0", method: "turn/completed", params: { turn: { id: "active-turn" } } });
  }
});
`, "utf8");
  await chmod(fakeCodex, 0o755);

  const result = await runFreshSession({ candidate, codexBin: fakeCodex, condition: "vanilla", root });
  const observation = JSON.parse(await readFile(join(candidate, "interrupt-observation.json"), "utf8")) as { toolCompleted: boolean };

  assert.equal(result.stopCause, "token-cap");
  assert.equal(observation.toolCompleted, true);
});

test("should interrupt after the grace period when a long-lived preview command stays active", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-benchmark-runner-long-command-"));
  const candidate = await preparedCandidate(root);
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { createInterface } from "node:readline";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id && message.method === "initialize") send({ id: message.id, jsonrpc: "2.0", result: {} });
  if (message.id && message.method === "thread/start") send({ id: message.id, jsonrpc: "2.0", result: { thread: { id: "thread-1", cliVersion: "test" } } });
  if (message.id && message.method === "thread/goal/set") send({ id: message.id, jsonrpc: "2.0", result: { goal: {} } });
  if (message.id && message.method === "turn/start") {
    send({ id: message.id, jsonrpc: "2.0", result: { turn: { id: "turn-1" } } });
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "turn/started", params: { turn: { id: "active-turn" } } });
      send({ jsonrpc: "2.0", method: "item/started", params: { item: { command: "npm run dev", id: "preview-server", type: "commandExecution", status: "inProgress" } } });
      send({ jsonrpc: "2.0", method: "thread/tokenUsage/updated", params: { tokenUsage: { total: { inputTokens: 99000, cachedInputTokens: 70000, outputTokens: 1001, totalTokens: 100001 } } } });
    }, 10);
  }
  if (message.id && message.method === "turn/interrupt") {
    send({ id: message.id, jsonrpc: "2.0", result: {} });
    send({ jsonrpc: "2.0", method: "turn/completed", params: { turn: { id: "active-turn" } } });
  }
});
`, "utf8");
  await chmod(fakeCodex, 0o755);

  const result = await runFreshSession({ candidate, codexBin: fakeCodex, condition: "vanilla", root, tokenActiveToolGraceMs: 20 });

  assert.equal(result.stopCause, "token-cap");
  assert.equal(result.tokenCount, 100001);
});

test("should not let newly started commands extend the token grace deadline", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-benchmark-runner-fixed-token-deadline-"));
  const candidate = await preparedCandidate(root);
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
let deadlineExtended = false;
createInterface({ input: process.stdin }).on("line", async (line) => {
  const message = JSON.parse(line);
  if (message.id && message.method === "initialize") send({ id: message.id, jsonrpc: "2.0", result: {} });
  if (message.id && message.method === "thread/start") send({ id: message.id, jsonrpc: "2.0", result: { thread: { id: "thread-1", cliVersion: "test" } } });
  if (message.id && message.method === "thread/goal/set") send({ id: message.id, jsonrpc: "2.0", result: { goal: {} } });
  if (message.id && message.method === "turn/start") {
    send({ id: message.id, jsonrpc: "2.0", result: { turn: { id: "turn-1" } } });
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "turn/started", params: { turn: { id: "active-turn" } } });
      send({ jsonrpc: "2.0", method: "item/started", params: { item: { command: "npm run dev", id: "preview-server", type: "commandExecution", status: "inProgress" } } });
      send({ jsonrpc: "2.0", method: "thread/tokenUsage/updated", params: { tokenUsage: { total: { inputTokens: 99000, cachedInputTokens: 70000, outputTokens: 1001, totalTokens: 100001 } } } });
      setTimeout(() => send({ jsonrpc: "2.0", method: "item/started", params: { item: { command: "node verify-1.mjs", id: "verify-1", type: "commandExecution", status: "inProgress" } } }), 25);
      setTimeout(() => send({ jsonrpc: "2.0", method: "item/started", params: { item: { command: "node verify-2.mjs", id: "verify-2", type: "commandExecution", status: "inProgress" } } }), 50);
      setTimeout(() => send({ jsonrpc: "2.0", method: "item/started", params: { item: { command: "node verify-3.mjs", id: "verify-3", type: "commandExecution", status: "inProgress" } } }), 75);
      setTimeout(() => { deadlineExtended = true; }, 150);
    }, 10);
  }
  if (message.id && message.method === "turn/interrupt") {
    await writeFile("interrupt-deadline-observation.json", JSON.stringify({ deadlineExtended }));
    send({ id: message.id, jsonrpc: "2.0", result: {} });
    send({ jsonrpc: "2.0", method: "turn/completed", params: { turn: { id: "active-turn" } } });
  }
});
`, "utf8");
  await chmod(fakeCodex, 0o755);

  const result = await runFreshSession({ candidate, codexBin: fakeCodex, condition: "vanilla", root, tokenActiveToolGraceMs: 100 });
  const observation = JSON.parse(await readFile(join(candidate, "interrupt-deadline-observation.json"), "utf8")) as { deadlineExtended: boolean };

  assert.equal(result.stopCause, "token-cap");
  assert.equal(observation.deadlineExtended, false);
});

test("should initialize non-vanilla candidates from the workspace starter before the session", async () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const scratch = await mkdtemp(join(tmpdir(), "tn-benchmark-runner-init-"));
  const candidate = await preparedCandidate(scratch);
  await rm(join(candidate, "threenative.config.json"));
  const fakeCodex = join(scratch, "fake-codex.mjs");
  await writeFile(fakeCodex, `#!/usr/bin/env node
import { createInterface } from "node:readline";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id && message.method === "initialize") send({ id: message.id, jsonrpc: "2.0", result: {} });
  if (message.id && message.method === "thread/start") send({ id: message.id, jsonrpc: "2.0", result: { thread: { id: "thread-1", cliVersion: "test" } } });
  if (message.id && message.method === "thread/goal/set") send({ id: message.id, jsonrpc: "2.0", result: { goal: {} } });
  if (message.id && message.method === "turn/start") {
    send({ id: message.id, jsonrpc: "2.0", result: { turn: { id: "turn-1" } } });
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "thread/tokenUsage/updated", params: { tokenUsage: { total: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 2, totalTokens: 12 } } } });
      send({ jsonrpc: "2.0", method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1" } } });
    }, 10);
  }
});
`, "utf8");
  await chmod(fakeCodex, 0o755);

  const result = await runFreshSession({ candidate, codexBin: fakeCodex, condition: "typed-spec", root });

  assert.equal(result.ok, true);
  assert.match(await readFile(join(candidate, "threenative.config.json"), "utf8"), /authoring/u);
  assert.match(await readFile(join(candidate, "src", "game.spec.ts"), "utf8"), /defineTypedGameSpec/u);
  assert.equal(await readFile(join(candidate, "benchmark-prompt.txt"), "utf8"), "Build the requested game.");
});

async function preparedCandidate(root: string): Promise<string> {
  const candidate = join(root, "candidate");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(root, "packages/cli/dist"), { recursive: true });
  await mkdir(candidate, { recursive: true });
  await writeFile(join(root, "packages/cli/dist/index.js"), "", "utf8");
  await writeFile(join(candidate, "threenative.config.json"), "{}\n", "utf8");
  await writeFile(join(candidate, "benchmark-prompt.txt"), "Build the requested game.", "utf8");
  await writeFile(join(candidate, "OPERATOR.md"), "# Candidate\n\n## Condition Notes\n\nNeutral proof only.\n\n## Required Proof Artifacts\n\n- observable behavior\n\n## After The Agent Stops\n\nCapture usage.\n", "utf8");
  await writeFile(join(candidate, "session.template.json"), `${JSON.stringify({ condition: "threenative", humanRubric: { playability: 0, visual: 0 }, iterationCount: 0, promptId: "collector", runId: "test-run", schema: "threenative.agent-benchmark-session", stopReason: "operator-stopped", tokenCount: 0, version: 2 })}\n`, "utf8");
  return candidate;
}
