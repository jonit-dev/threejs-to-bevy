import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openProject } from "./index.js";

test("should create a primitive scene object through fluent calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-client-scene-"));
  try {
    await writeScene(root, "arena");
    const result = await openProject(root)
      .scene("arena")
      .addPrefab("prefab.crate", { color: "#8f5a2a", primitive: "box" })
      .addEntity("crate.001", { prefabId: "prefab.crate" })
      .transform("crate.001", { position: [2, 1, -3], scale: [1, 2, 1] })
      .rigidBody("crate.001", { kind: "dynamic", mass: 4 })
      .collider("crate.001", { kind: "box", size: [1, 2, 1] })
      .commit();

    assert.equal(result.ok, true);
    assert.deepEqual(result.operations.map((operation) => operation.name), [
      "scene.add_prefab",
      "scene.add_entity",
      "scene.set_transform",
      "scene.set_rigid_body",
      "scene.set_collider",
    ]);

    const scene = JSON.parse(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string; prefab?: string; transform?: { position?: number[]; scale?: number[] } }>;
      prefabs: Array<{ color?: string; id: string; primitive?: string }>;
    };
    const entity = scene.entities.find((candidate) => candidate.id === "crate.001");
    assert.equal(scene.prefabs.find((candidate) => candidate.id === "prefab.crate")?.primitive, "box");
    assert.equal(entity?.prefab, "prefab.crate");
    assert.deepEqual(entity?.transform?.position, [2, 1, -3]);
    assert.deepEqual(entity?.transform?.scale, [1, 2, 1]);
    assert.deepEqual(entity?.components?.RigidBody, { kind: "dynamic", mass: 4 });
    assert.deepEqual(entity?.components?.Collider, { kind: "box", size: [1, 2, 1] });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should expose operation trace for fluent scene calls", () => {
  const dryRun = openProject("/repo")
    .scene("arena")
    .addPrefab("prefab.player", { primitive: "sphere" })
    .addEntity("player", { prefabId: "prefab.player" })
    .transform("player", { position: [0, 1, 0] })
    .dryRun();

  assert.equal(dryRun.ok, true);
  assert.deepEqual(dryRun.operations.map((operation) => operation.name), ["scene.add_prefab", "scene.add_entity", "scene.set_transform"]);
  assert.deepEqual(dryRun.operations.map((operation) => operation.args.sceneId), ["arena", "arena", "arena"]);
});

test("should report dry run diagnostics without writing source", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-client-scene-dry-run-"));
  try {
    const builder = openProject(root).scene("arena").addEntity("player").script("controller", { modulePath: "src/scripts/player.ts", exportName: "" });
    const dryRun = builder.dryRun();

    assert.equal(dryRun.ok, false);
    assert.deepEqual(dryRun.operations.map((operation) => operation.name), ["scene.add_entity", "scene.attach_script"]);
    assert.equal(dryRun.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_OPERATION_ARG_INVALID"), true);
    await assert.rejects(readFile(join(root, "content/scenes/arena.scene.json"), "utf8"));
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
      },
      null,
      2,
    )}\n`,
  );
}
