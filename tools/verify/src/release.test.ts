import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { resolveArtifactTargets } from "./artifacts.js";
import { RELEASE_FOCUSED_GATES, runReleaseGate } from "./release.js";

test("release gate should run without importing scripts implementation", async () => {
  const source = await readFile(new URL("../src/release.ts", import.meta.url), "utf8");

  assert.equal(source.includes("scripts/verify-v9.mjs"), false);
  assert.equal(source.includes("../../../scripts/verify-v9.mjs"), false);
  assert.equal(source.includes("--test"), false);
  assert.equal(source.includes(".test.mjs"), false);
});

test("release gate should report failed typed step diagnostics", async () => {
  const result = await runReleaseGate({
    artifactDir: "/tmp/tn-release-test-artifacts",
    focusedGates: [],
    repoRoot: "/tmp/tn-release-test-root",
    reportPath: "/tmp/tn-release-test-artifacts/verification-report.json",
    run: async () => ({
      durationMs: 1,
      exitCode: 1,
      stderr: "failed",
      stdout: "",
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "TN_VERIFY_RELEASE_STEP_FAILED");
});

test("release gate should keep focused gate artifact contracts", () => {
  assert.ok(RELEASE_FOCUSED_GATES.some((gate) => gate.script === "verify:bundle-safety-hardening"));
  assert.ok(RELEASE_FOCUSED_GATES.some((gate) => gate.script === "verify:generated-games"));
  assert.ok(RELEASE_FOCUSED_GATES.some((gate) => gate.script === "verify:scripting-helpers-lifecycle"));
  assert.ok(RELEASE_FOCUSED_GATES.some((gate) => gate.script === "verify:template-production"));
  assert.ok(RELEASE_FOCUSED_GATES.every((gate) => gate.reportPath.endsWith(".json")));
});

test("should not rebuild focused gate packages after release setup", async () => {
  const gate = {
    name: "verify input ui polish",
    reportPath: "tools/verify/artifacts/input-ui-polish/verification-report.json",
    script: "verify:input-ui-polish",
  };
  const { reportPath, root } = await prepareSuccessfulReleaseArtifacts(gate);
  const result = await runReleaseGate({
    focusedGates: [gate],
    repoRoot: root,
    reportPath,
    run: async () => ({
      durationMs: 1,
      exitCode: 0,
      stderr: "",
      stdout: "",
    }),
  });

  assert.equal(result.ok, true);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const focusedCommand = report.commands.find((command: { name: string }) => command.name === gate.name);
  assert.equal(focusedCommand.command, process.execPath);
  assert.deepEqual(focusedCommand.args, [
    resolve(root, "tools/verify/dist/cli/run.js"),
    "verify:input-ui-polish",
    "--no-setup",
  ]);
  assert.equal(
    report.commands.some((command: { args?: string[]; command: string }) =>
      command.command === "pnpm" && command.args?.includes("verify:input-ui-polish"),
    ),
    false,
  );
});

test("should categorize release timing steps", async () => {
  const gate = {
    name: "verify input ui polish",
    reportPath: "tools/verify/artifacts/input-ui-polish/verification-report.json",
    script: "verify:input-ui-polish",
  };
  const { reportPath, root } = await prepareSuccessfulReleaseArtifacts(gate);
  const result = await runReleaseGate({
    focusedGates: [gate],
    repoRoot: root,
    reportPath,
    run: async () => ({
      durationMs: 1,
      exitCode: 0,
      stderr: "",
      stdout: "",
    }),
    timingBudgetsMs: { "focused-gate": 0 },
  });

  assert.equal(result.ok, true);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.steps.every((step: { category?: string }) => typeof step.category === "string"), true);
  assert.equal(report.timing.categories.setup.stepCount, 9);
  assert.equal(report.timing.categories["focused-gate"].stepCount, 1);
  assert.equal(report.timing.categories.artifact.stepCount, 2);
  assert.equal(report.timing.budgetWarnings.length, 1);
  assert.equal(report.diagnostics[0].code, "TN_VERIFY_RELEASE_TIMING_BUDGET_WARNING");
});

async function prepareSuccessfulReleaseArtifacts(gate: { reportPath: string }) {
  const root = await mkdtemp(resolve(tmpdir(), "tn-release-artifacts-"));
  const sampleScenesTargets = resolveArtifactTargets({ gate: "sample-scenes", owner: { kind: "aggregate", name: "sample-scenes" }, root });
  const visualMatrixTargets = resolveArtifactTargets({ gate: "visual-matrix", owner: { kind: "aggregate", name: "visual-matrix" }, root });
  for (const path of [
    resolve(root, gate.reportPath),
    resolve(root, "packages/ir/artifacts/conformance/verification-report.json"),
    sampleScenesTargets.reportPath,
    visualMatrixTargets.reportPath,
  ]) {
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, "{}\n", "utf8");
  }
  return {
    reportPath: resolve(root, "tools/verify/artifacts/release/verification-report.json"),
    root,
  };
}
