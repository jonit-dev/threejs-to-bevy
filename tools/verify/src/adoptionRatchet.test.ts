import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const controllerExamples = [
  "examples/coin-patrol/src/scripts/player.ts",
  "examples/dense-world-benchmark/src/scripts/player.ts",
  "examples/neon-harbor-rescue/src/scripts/player.ts",
  "examples/orb-reactor/src/scripts/player.ts",
];

test("canonical simple movement uses the promoted cardinal controller", async () => {
  for (const path of controllerExamples) {
    const source = await readFile(resolve(repoRoot, path), "utf8");
    assert.match(source, /ControllerEx\.worldCardinalCharacter\(/, path);
    assert.doesNotMatch(source, /Vector3\.add\(position, \[.*fixedDelta/s, path);
  }
});

test("canonical sibling documents own systems and retained UI", async () => {
  for (const path of [
    "examples/dense-world-benchmark/content/scenes/arena.scene.json",
    "examples/neon-harbor-rescue/content/scenes/arena.scene.json",
  ]) {
    const scene = JSON.parse(await readFile(resolve(repoRoot, path), "utf8")) as { systems?: unknown; ui?: unknown };
    assert.equal(scene.systems, undefined, `${path} must leave system ownership to content/systems`);
    assert.equal(scene.ui, undefined, `${path} must leave retained UI ownership to content/ui`);
  }
});

test("canonical duplicate defaults use registry presets and UI recipe provenance", async () => {
  const presetFiles: ReadonlyArray<readonly [string, string]> = [
    ...["orb-reactor", "coin-patrol", "dense-world-benchmark"].map((name) => [`examples/${name}/content/archetypes/top-down.archetype.json`, "game-archetype.top-down"] as const),
    ...["orb-reactor", "coin-patrol", "neon-harbor-rescue"].flatMap((name) => [
      [`examples/${name}/content/flow/match.flow.json`, "flow.ready-playing-win"] as const,
      [`examples/${name}/content/sequences/intro.sequence.json`, "sequence.intro-camera"] as const,
    ]),
  ];
  for (const [path, preset] of presetFiles) {
    const source = JSON.parse(await readFile(resolve(repoRoot, path), "utf8")) as { preset?: string };
    assert.deepEqual(source, { preset }, path);
  }
  for (const name of ["orb-reactor", "coin-patrol", "dense-world-benchmark", "neon-harbor-rescue"]) {
    const path = `examples/${name}/content/ui/hud.ui.json`;
    const source = JSON.parse(await readFile(resolve(repoRoot, path), "utf8")) as { recipes?: Array<{ kind?: string }>; provenance?: Record<string, unknown> };
    assert.equal(source.recipes?.some((recipe) => recipe.kind === "hud-status-cluster"), true, path);
    assert.ok(source.provenance?.["recipes/hud.status"], path);
  }
});

test("web playtest collection pauses gameplay outside declared scenario steps", async () => {
  const render = await readFile(resolve(repoRoot, "packages/runtime-web-three/src/render.ts"), "utf8");
  const browser = await readFile(resolve(repoRoot, "packages/runtime-web-three/src/browser/main.ts"), "utf8");
  const playtest = await readFile(resolve(repoRoot, "packages/cli/src/commands/playtest.ts"), "utf8");
  assert.match(render, /setPaused\(paused: boolean\).*setGameLoopPaused\(loopState, paused\)/s);
  assert.match(browser, /setPaused: result\.setPaused/);
  assert.match(playtest, /waitForWebFrameSamples[\s\S]*setWebPaused\(page, true\)[\s\S]*readResourceSnapshots/);
  assert.match(playtest, /setWebPaused\(page, false\)[\s\S]*waitForWebFrameAdvance[\s\S]*setWebPaused\(page, true\)/);
});
