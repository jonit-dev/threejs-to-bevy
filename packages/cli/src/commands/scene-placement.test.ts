import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sceneCommand } from "./scene.js";

test("scene placement CLI dispatches add and descriptor-backed inspect", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-placement-cli-"));
  try {
    await mkdir(join(root, "content/scenes"), { recursive: true });
    await writeFile(join(root, "content/scenes/arena.scene.json"), JSON.stringify({ schema: "threenative.scene", version: "0.1.0", id: "arena", prefabs: [{ id: "coin", primitive: "sphere" }] }));
    const placement = JSON.stringify({ prefab: "coin", idFormat: "coin.{column}", pattern: { kind: "line", origin: [0, 0, 0], step: [1, 0, 0], count: 2 } });
    const add = await sceneCommand(["placement", "add", "arena", "coins", "--placement", placement, "--project", root, "--json"]);
    const inspect = await sceneCommand(["placement", "inspect", "arena", "coins", "--expand", "--project", root, "--json"]);
    assert.equal(add.exitCode, 0, add.stdout); assert.equal(inspect.exitCode, 0, inspect.stdout);
    assert.deepEqual((JSON.parse(inspect.stdout) as { expanded: Array<{ id: string }> }).expanded.map((item) => item.id), ["coin.0", "coin.1"]);
    const scene = JSON.parse(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8")) as { placementSets: Array<{ id: string; kind: string }> };
    assert.deepEqual(scene.placementSets.map(({ id, kind }) => ({ id, kind })), [{ id: "coins", kind: "placement-set" }]);
  } finally { await rm(root, { force: true, recursive: true }); }
});
