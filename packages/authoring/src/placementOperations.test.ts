import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { dispatchAuthoringOperation, getAuthoringOperationDescriptor } from "./operationRegistry.js";

test("placement descriptors own CLI adapter paths", () => {
  for (const [name, action] of [["scene.placement_add", "add"], ["scene.placement_inspect", "inspect"], ["scene.placement_migrate", "migrate"], ["scene.placement_apply", "apply"]] as const) {
    assert.deepEqual(getAuthoringOperationDescriptor(name)?.adapters?.cli?.path, ["scene", "placement", action]);
  }
});

test("placement inspect previews ids and migration only applies exact matches", async () => {
  const root = await project();
  try {
    const placement = { id: "coins", kind: "placement-set", prefab: "coin", idFormat: "coin.{column}", pattern: { kind: "line", origin: [0, 0, 0], step: [1, 0, 0], count: 2 } };
    const before = await readFile(join(root, "content/scenes/arena.scene.json"), "utf8");
    const dryRun = await dispatchAuthoringOperation({ args: { placement, placementId: "coins", sceneId: "arena" }, name: "scene.placement_migrate", projectPath: root }) as unknown as { exactMatch: boolean; generatedIds: string[] };
    assert.equal(dryRun.exactMatch, true); assert.deepEqual(dryRun.generatedIds, ["coin.0", "coin.1"]);
    assert.equal(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8"), before);
    const applied = await dispatchAuthoringOperation({ args: { placement, placementId: "coins", sceneId: "arena" }, name: "scene.placement_apply", projectPath: root });
    assert.equal(applied.ok, true);
    const inspect = await dispatchAuthoringOperation({ args: { expand: true, placementId: "coins", sceneId: "arena" }, name: "scene.placement_inspect", projectPath: root }) as unknown as { expanded: Array<{ id: string; provenance: { index: number; placementSetId: string; sourcePath: string } }> };
    assert.deepEqual(inspect.expanded.map((item) => item.id), ["coin.0", "coin.1"]);
    assert.deepEqual(inspect.expanded[1]?.provenance, { generatedId: "coin.1", index: 1, placementSetId: "coins", sourcePath: "content/scenes/arena.scene.json" });
    const scene = JSON.parse(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8")) as { entities: unknown[]; placementSets: unknown[] };
    assert.equal(scene.entities.length, 0); assert.equal(scene.placementSets.length, 1);
  } finally { await rm(root, { force: true, recursive: true }); }
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-placement-ops-")); await mkdir(join(root, "content/scenes"), { recursive: true });
  await writeFile(join(root, "content/scenes/arena.scene.json"), JSON.stringify({ schema: "threenative.scene", version: "0.1.0", id: "arena", prefabs: [{ id: "coin", primitive: "sphere" }], entities: [{ id: "coin.0", prefab: "coin", transform: { position: [0, 0, 0] } }, { id: "coin.1", prefab: "coin", transform: { position: [1, 0, 0] } }] }, null, 2) + "\n"); return root;
}
