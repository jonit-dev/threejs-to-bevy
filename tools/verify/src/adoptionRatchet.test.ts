import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const controllerExamples = [
  "examples/dense-world-benchmark/src/scripts/player.ts",
  "examples/neon-harbor-rescue/src/scripts/player.ts",
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
