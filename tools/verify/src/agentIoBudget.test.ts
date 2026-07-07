import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runAgentIoBudgetGate, type AgentIoBudgetCommand } from "./agentIoBudget.js";

test("should fail when a documented command exceeds stdout budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-io-budget-"));
  const command: AgentIoBudgetCommand = {
    args: ["oversized"],
    budgetBytes: 8,
    command: "tn",
    name: "tn oversized --json",
  };

  const result = await runAgentIoBudgetGate({
    commands: [command],
    root,
    runner: async () => ({
      durationMs: 1,
      exitCode: 0,
      stderr: "",
      stdout: "x".repeat(9),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AGENT_IO_STDOUT_BUDGET_EXCEEDED"), true);
  assert.equal(result.measurements[0]?.stdoutBytes, 9);
});

test("should pass compact starter command outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-agent-io-budget-"));
  const commands: AgentIoBudgetCommand[] = [
    { args: ["playtest"], budgetBytes: 64, command: "tn", name: "tn playtest --json" },
    { args: ["iterate"], budgetBytes: 64, command: "tn", name: "tn iterate --json" },
  ];

  const result = await runAgentIoBudgetGate({
    commands,
    root,
    runner: async (command) => ({
      durationMs: 1,
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({ ok: true, step: command.name }),
    }),
  });
  const report = JSON.parse(await readFile(result.reportPath, "utf8")) as { status: string };

  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length, 0);
  assert.equal(report.status, "pass");
  assert.deepEqual(result.measurements.map((measurement) => measurement.name), ["tn playtest --json", "tn iterate --json"]);
});
