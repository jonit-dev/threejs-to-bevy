import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runSessionCostGate, type SessionCostReplayCase } from "./sessionCostGate.js";

test("should pass golden path under thresholds", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-session-cost-gate-"));
  const cases: SessionCostReplayCase[] = [{ archetype: "top-down", id: "archetype-top-down", kind: "archetype" }];
  const result = await runSessionCostGate({
    cases,
    root,
    run: async () => ({
      durationMs: 1,
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({ code: "TN_ITERATE_OK", ok: true }),
    }),
  });
  const report = JSON.parse(await readFile(result.reportPath, "utf8")) as { status: string };

  assert.equal(result.ok, true);
  assert.equal(result.measurements[0]?.toolStepCount, 2);
  assert.equal(result.measurements[0]?.failedCommandCount, 0);
  assert.equal(report.status, "pass");
});

test("should fail when iterate output exceeds budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-session-cost-gate-"));
  const cases: SessionCostReplayCase[] = [{ archetype: "top-down", id: "archetype-top-down", kind: "archetype" }];
  const result = await runSessionCostGate({
    cases,
    root,
    run: async (command) => ({
      durationMs: 1,
      exitCode: 0,
      stderr: "",
      stdout: command.name?.endsWith(": iterate") === true ? "x".repeat(65) : JSON.stringify({ ok: true }),
    }),
    thresholds: { iterateOutputBytes: 64 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_SESSION_COST_ITERATE_OUTPUT_BUDGET_EXCEEDED"), true);
  assert.equal(result.measurements[0]?.iterateOutputBytes, 65);
});

test("should fail when deterministic replay has failed commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-session-cost-gate-"));
  const cases: SessionCostReplayCase[] = [{ goal: "lane runner", id: "recipe-lane-runner", kind: "recipe" }];
  const result = await runSessionCostGate({
    cases,
    root,
    run: async (command) => ({
      durationMs: 1,
      exitCode: command.name?.includes("game plan") === true ? 1 : 0,
      stderr: command.name?.includes("game plan") === true ? "bad plan" : "",
      stdout: JSON.stringify({ code: "TN_ITERATE_OK", ok: true }),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.measurements[0]?.failedCommandCount, 1);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_SESSION_COST_COMMAND_FAILED"), true);
});

test("should replay typed-spec recipe with playtest proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-session-cost-gate-"));
  const cases: SessionCostReplayCase[] = [{
    authoring: "typed-spec",
    goal: "top down coin collector",
    id: "typed-spec-recipe-top-down-collector",
    kind: "recipe",
    playtest: true,
  }];
  const seenArgs: string[][] = [];
  const result = await runSessionCostGate({
    cases,
    root,
    run: async (command) => {
      seenArgs.push([...command.args]);
      return {
        durationMs: 1,
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({ code: command.name?.endsWith(": iterate") === true ? "TN_ITERATE_OK" : "TN_CREATE_OK", ok: true }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(seenArgs[0]?.includes("--authoring"), true);
  assert.equal(seenArgs[0]?.includes("typed-spec"), true);
  assert.equal(seenArgs[2]?.includes("--skip-playtest"), false);
  assert.deepEqual(seenArgs[2]?.slice(-1), ["--json"]);
  assert.equal(seenArgs[2]?.includes("--scenario"), false);
  assert.equal(result.measurements[0]?.toolStepCount, 3);
  assert.deepEqual(result.measurements[0]?.acceptance, {
    authoredScenarios: 0,
    build: "pass",
    gamePlanApply: "pass",
    manualEdits: 0,
    playtest: "pass",
    scaffold: "pass",
  });
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_SESSION_COST_ACCEPTANCE_FAILED"), false);
});

test("should fail typed-spec recipe acceptance proof when iterate does not pass", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-session-cost-gate-"));
  const cases: SessionCostReplayCase[] = [{
    authoring: "typed-spec",
    goal: "top down coin collector",
    id: "typed-spec-recipe-top-down-collector",
    kind: "recipe",
    playtest: true,
  }];
  const result = await runSessionCostGate({
    cases,
    root,
    run: async (command) => ({
      durationMs: 1,
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({ code: command.name?.endsWith(": iterate") === true ? "TN_ITERATE_FAILED" : "TN_CREATE_OK", ok: command.name?.endsWith(": iterate") !== true }),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.measurements[0]?.acceptance?.build, "skip");
  assert.equal(result.measurements[0]?.acceptance?.playtest, "skip");
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_SESSION_COST_ACCEPTANCE_FAILED"), true);
});

test("should fail when identical failed assertions repeat", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-session-cost-gate-"));
  const cases: SessionCostReplayCase[] = [{ archetype: "top-down", id: "archetype-top-down", kind: "archetype" }];
  const repeatedAssertion = { details: { distance: 0, entity: "player" }, id: "movement", pass: false };
  const result = await runSessionCostGate({
    cases,
    root,
    run: async (command) => ({
      durationMs: 1,
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
        assertions: [repeatedAssertion],
        code: command.name?.endsWith(": iterate") === true ? "TN_ITERATE_OK" : "TN_CREATE_OK",
        ok: true,
      }),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.measurements[0]?.identicalAssertionRepeatCount, 1);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_SESSION_COST_ASSERTION_REPEAT_EXCEEDED"), true);
});
