import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { IPlaytestReport } from "./playtest.js";
import type { IPlaytestScenario } from "./playtestScenario.js";
import { writePlaytestArtifactBundle } from "./playtestArtifacts.js";

test("playtest artifacts should flag repeated identical assertion failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-playtest-repeat-"));
  const runDirectory = join(root, "artifacts/playtest/repeat/latest");
  const scenario: IPlaytestScenario = {
    name: "repeat",
    schemaVersion: 1,
    steps: [{ press: "KeyW", release: true }],
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
  };
  try {
    await writePlaytestArtifactBundle({ durationMs: 10, projectPath: root, report: failingReport(), runDirectory, scenario });
    const second = await writePlaytestArtifactBundle({ durationMs: 10, projectPath: root, report: failingReport(), runDirectory, scenario });
    const summary = JSON.parse(await readFile(second.artifacts.summary, "utf8")) as { diagnostics: Array<{ code: string; path?: string }> };

    assert.equal(summary.diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_REPEATED_ASSERTION" && diagnostic.path?.includes("repeat/latest/summary.json") === true), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function failingReport(): IPlaytestReport {
  return {
    debugColliders: false,
    diagnostics: [{ code: "TN_PLAYTEST_INPUT_NO_EFFECT", message: "No movement.", severity: "error" }],
    distance: 0,
    entity: "player",
    expectMoved: true,
    frames: 30,
    input: "KeyW",
    movementThreshold: 0.01,
    pass: false,
    runtime: "web",
  };
}
