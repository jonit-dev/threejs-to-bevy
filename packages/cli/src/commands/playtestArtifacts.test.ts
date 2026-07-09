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

test("playtest artifacts should expose runtime observation sidecar paths when present", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-playtest-runtime-observations-"));
  const runDirectory = join(root, "artifacts/playtest/runtime-observations/latest");
  const scenario: IPlaytestScenario = {
    name: "runtime-observations",
    schemaVersion: 1,
    steps: [{ press: "KeyW", release: true }],
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
  };
  try {
    const bundle = await writePlaytestArtifactBundle({
      durationMs: 10,
      projectPath: root,
      report: {
        ...passingReport(),
        observations: {
          console: [],
          hud: {},
          network: [],
          resources: {},
          runtimeObservations: {
            assets: { "model.soldier": { animations: ["Idle"], loaded: true } },
            materials: { "mat.course.surface": { baseColorTexture: "tex.grid.floor" } },
            textures: { "tex.grid.floor": { loaded: true, repeat: [8, 12] } },
          },
        },
      },
      runDirectory,
      scenario,
    });
    const sidecar = JSON.parse(await readFile(bundle.artifacts.runtimeObservations, "utf8")) as {
      observations: { textures: Record<string, { repeat: [number, number] }> };
      source: string;
    };
    const manifest = JSON.parse(await readFile(bundle.artifacts.manifest, "utf8")) as {
      artifacts: Record<string, { path: string }>;
    };

    assert.deepEqual(sidecar.observations.textures["tex.grid.floor"]?.repeat, [8, 12]);
    assert.equal(sidecar.source, "runtime-observation");
    assert.equal(manifest.artifacts.runtimeObservations?.path.endsWith("runtime-observations.json"), true);
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

function passingReport(): IPlaytestReport {
  return {
    debugColliders: false,
    diagnostics: [],
    distance: 1,
    entity: "player",
    expectMoved: true,
    frames: 30,
    input: "KeyW",
    movementThreshold: 0.01,
    pass: true,
    runtime: "web",
    target: "web",
  };
}
