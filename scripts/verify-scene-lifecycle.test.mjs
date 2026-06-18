import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { verifySceneLifecycle } from "./verify-scene-lifecycle.mjs";

test("should report matching scene lifecycle trace artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-scene-lifecycle-"));
  try {
    const artifactDir = join(root, "packages/ir/artifacts/scene-lifecycle");
    const result = await verifySceneLifecycle({
      artifactDir,
      bundlePath: join(root, "packages/ir/fixtures/conformance/scene-lifecycle/game.bundle"),
      repoRoot: root,
      webReport: makeReport("web-three"),
      runNativeReport: async ({ nativeTracePath }) => {
        await mkdir(dirname(nativeTracePath), { recursive: true });
        await writeFile(
          nativeTracePath,
          `${JSON.stringify(
            {
              activeScene: "level",
              additiveScenes: [],
              stack: ["level"],
              trace: expectedTrace(),
            },
            null,
            2,
          )}\n`,
        );
      },
    });
    const diff = JSON.parse(await readFile(result.artifacts.diffPath, "utf8"));

    assert.equal(result.ok, true);
    assert.equal(diff.comparison.ok, true);
    assert.deepEqual(JSON.parse(await readFile(result.artifacts.webTracePath, "utf8")).trace, expectedTrace());
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function makeReport(runtime) {
  return {
    activeCamera: undefined,
    assets: [],
    diagnostics: [],
    entities: [],
    events: [],
    fixture: "scene-lifecycle",
    materials: [],
    resources: [],
    runtime,
    sceneLifecycle: {
      activeScene: "level",
      additiveScenes: [],
      stack: ["level"],
      trace: expectedTrace(),
    },
  };
}

function expectedTrace() {
  return [
    { phase: "preload", reason: "initial", scene: "menu" },
    { phase: "enter", reason: "initial", scene: "menu" },
    { phase: "active", reason: "initial", scene: "menu" },
    { phase: "exit", reason: "change", scene: "menu" },
    { phase: "unload", reason: "change", scene: "menu" },
    { phase: "preload", reason: "change", scene: "level" },
    { phase: "enter", reason: "change", scene: "level" },
    { phase: "active", reason: "change", scene: "level" },
    { phase: "pause", reason: "push", scene: "level" },
    { phase: "preload", reason: "push", scene: "pause" },
    { phase: "enter", reason: "push", scene: "pause" },
    { phase: "active", reason: "push", scene: "pause" },
    { phase: "exit", reason: "pop", scene: "pause" },
    { phase: "unload", reason: "pop", scene: "pause" },
    { phase: "resume", reason: "pop", scene: "level" },
    { phase: "active", reason: "pop", scene: "level" },
  ];
}
