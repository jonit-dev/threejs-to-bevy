import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parityPlaytestCommand } from "./parityPlaytest.js";
import type { ICommandResult } from "../diagnostics.js";

test("gameplay parity should run the same scenario for web and desktop targets", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tn-parity-playtest-"));
  await writeScenario(cwd);
  const calls: readonly string[][] = [];
  const result = await parityPlaytestCommand(
    ["playtest", "--project", ".", "--scenario", "playtests/humanoid-course-forward-movement.playtest.json", "--targets", "web,desktop", "--stable-artifacts", "--json"],
    cwd,
    {
      async playtestRunner(argv) {
        (calls as string[][]).push([...argv]);
        const target = argv[argv.indexOf("--target") + 1];
        return passingPlaytest(target ?? "web");
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { pass: boolean };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.pass, true);
  assert.deepEqual(calls.map((call) => call[call.indexOf("--target") + 1]), ["web", "desktop"]);
  assert.equal(calls.every((call) => call.includes("playtests/humanoid-course-forward-movement.playtest.json")), true);
});

test("gameplay parity should fail when one target playtest fails", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tn-parity-playtest-fail-"));
  await writeScenario(cwd);
  const result = await parityPlaytestCommand(
    ["playtest", "--project", ".", "--scenario", "playtests/humanoid-course-forward-movement.playtest.json", "--targets", "web,desktop", "--json"],
    cwd,
    {
      async playtestRunner(argv) {
        const target = argv[argv.indexOf("--target") + 1] ?? "web";
        return target === "desktop" ? failingPlaytest(target) : passingPlaytest(target);
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string; target?: string }> };

  assert.equal(result.exitCode, 1);
  assert.deepEqual(payload.diagnostics, [{ code: "TN_GAMEPLAY_PARITY_TARGET_FAILED", message: "Parity playtest target 'desktop' failed for scenario 'playtests/humanoid-course-forward-movement.playtest.json'.", severity: "error", target: "desktop" }]);
});

test("gameplay parity should not request native recording in smoke mode", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tn-parity-playtest-recording-"));
  await writeScenario(cwd);
  const calls: readonly string[][] = [];
  await parityPlaytestCommand(
    ["playtest", "--project", ".", "--scenario", "playtests/humanoid-course-forward-movement.playtest.json", "--targets", "desktop", "--json"],
    cwd,
    {
      async playtestRunner(argv) {
        (calls as string[][]).push([...argv]);
        return passingPlaytest("desktop");
      },
    },
  );

  assert.equal(calls[0]?.includes("--native-recording"), false);
  assert.equal(calls[0]?.includes("--native-screenshots"), false);
});

test("gameplay parity should fail semantic movement drift outside scenario tolerance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tn-parity-playtest-drift-"));
  await writeScenario(cwd, { parity: { compare: { movementDistance: { maxDelta: 0.15 } }, targets: ["web", "desktop"] } });
  const result = await parityPlaytestCommand(
    ["playtest", "--project", ".", "--scenario", "playtests/humanoid-course-forward-movement.playtest.json", "--targets", "web,desktop", "--json"],
    cwd,
    {
      async playtestRunner(argv) {
        const target = argv[argv.indexOf("--target") + 1] ?? "web";
        return passingPlaytest(target, target === "web" ? 1 : 1.4);
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { diagnostics: Array<{ code: string }> };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAMEPLAY_PARITY_MOVEMENT_DRIFT"), true);
});

async function writeScenario(root: string, extra: Record<string, unknown> = {}): Promise<void> {
  await mkdir(join(root, "playtests"), { recursive: true });
  await writeFile(join(root, "playtests/humanoid-course-forward-movement.playtest.json"), `${JSON.stringify({
    name: "humanoid-course-forward-movement",
    schemaVersion: 1,
    steps: [{ holdFrames: 1, press: "KeyW", release: true }],
    subject: "player",
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
    ...extra,
  })}\n`);
}

function passingPlaytest(target: string, distance = 1): ICommandResult {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({
      artifacts: { summary: `/tmp/${target}/summary.json` },
      diagnostics: [],
      distance,
      pass: true,
      target,
    })}\n`,
  };
}

function failingPlaytest(target: string): ICommandResult {
  return {
    exitCode: 1,
    stdout: `${JSON.stringify({
      artifacts: { summary: `/tmp/${target}/summary.json` },
      diagnostics: [{ code: "TN_PLAYTEST_FAILED", message: "failed", severity: "error" }],
      pass: false,
      target,
    })}\n`,
  };
}
