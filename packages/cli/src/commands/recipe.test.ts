import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { recipeCommand } from "./recipe.js";

test("should apply collectible recipe to structured source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-recipe-"));
  try {
    await writeScene(root, "arena");
    await mkdir(join(root, "src", "scripts"), { recursive: true });
    await writeFile(join(root, "src", "scripts", "collectible.ts"), "export function collectible() {}\n", "utf8");

    const result = await recipeCommand(["collectible", "--scene", "arena", "--entity", "coin.001", "--project", root, "--json"]);
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string }>;
      resources: Array<{ id: string; path?: string; value?: unknown }>;
      systems: Array<{ id: string; script?: { export: string; module: string } }>;
      ui: { bindings: Array<{ node: string; resource: string }>; nodes: Array<{ id: string }> };
    };
    const payload = JSON.parse(result.stdout) as {
      filesWritten: string[];
      operations: Array<{ name: string }>;
    };
    const coin = scene.entities.find((entity) => entity.id === "coin.001");

    assert.equal(result.exitCode, 0);
    assert.equal(coin?.components?.Collider !== undefined, true);
    assert.equal((coin?.components?.Collider as { trigger?: boolean } | undefined)?.trigger, true);
    assert.deepEqual(scene.systems, [{ id: "coin.001.collect", script: { export: "collectible", module: "src/scripts/collectible.ts" } }]);
    assert.deepEqual(scene.resources, [{ id: "coin.001.collected", path: "collectibles.coin.001.collected", value: false }]);
    assert.deepEqual(scene.ui.nodes, [{ id: "coin.001.prompt" }]);
    assert.deepEqual(scene.ui.bindings, [{ node: "coin.001.prompt", resource: "coin.001.collected" }]);
    assert.deepEqual(payload.filesWritten, ["content/scenes/arena.scene.json"]);
    assert.deepEqual(payload.operations.map((operation) => operation.name), [
      "scene.add_prefab",
      "scene.add_entity",
      "scene.set_transform",
      "scene.set_collider",
      "scene.attach_script",
      "scene.add_resource",
      "scene.add_ui_node",
      "scene.bind_ui",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should return a dry-run plan without writing source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-cli-recipe-dry-run-"));
  try {
    await writeScene(root, "arena");
    const result = await recipeCommand(["health-bar", "--scene", "arena", "--entity", "player", "--project", root, "--dry-run", "--json"]);
    const payload = JSON.parse(result.stdout) as { operations: Array<{ name: string }> };
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as { resources?: unknown[] };

    assert.equal(result.exitCode, 0);
    assert.deepEqual(payload.operations.map((operation) => operation.name), ["scene.add_resource", "scene.add_ui_node", "scene.bind_ui"]);
    assert.deepEqual(scene.resources, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeScene(root: string, sceneId: string): Promise<void> {
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await writeFile(
    join(root, "content", "scenes", `${sceneId}.scene.json`),
    `${JSON.stringify(
      {
        schema: "threenative.scene",
        version: "0.1.0",
        id: sceneId,
        entities: [],
        prefabs: [],
        resources: [],
        systems: [],
        ui: { nodes: [], bindings: [] },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
