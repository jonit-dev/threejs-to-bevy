import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openProject } from "./index.js";

test("should dispatch queued operations through the shared registry", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-client-"));
  try {
    await writeScene(root, "arena");
    const project = openProject(root);
    const result = await project
      .transaction()
      .operation("scene.add_prefab", {
        color: "#44aa88",
        prefabId: "prefab.player",
        primitive: "box",
        sceneId: "arena",
      })
      .operation("scene.add_entity", {
        entityId: "player",
        prefabId: "prefab.player",
        sceneId: "arena",
      })
      .operation("scene.set_transform", {
        entityId: "player",
        position: [1, 2, 3],
        sceneId: "arena",
      })
      .commit();

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.deepEqual(result.operations.map((operation) => operation.name), ["scene.add_prefab", "scene.add_entity", "scene.set_transform"]);
    assert.equal(result.operationResults.length, 3);
    assert.deepEqual(result.filesWritten, ["content/scenes/arena.scene.json"]);

    const scene = JSON.parse(await readFile(join(root, "content/scenes/arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; prefab?: string; transform?: { position?: number[] } }>;
      prefabs: Array<{ color?: string; id: string; primitive?: string }>;
    };
    assert.equal(scene.prefabs[0]?.id, "prefab.player");
    assert.equal(scene.entities[0]?.id, "player");
    assert.deepEqual(scene.entities[0]?.transform?.position, [1, 2, 3]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should stop and report failed operations deterministically", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-client-invalid-"));
  try {
    const result = await openProject(root)
      .transaction()
      .operation("scene.add_entity", {
        sceneId: "arena",
      })
      .operation("scene.add_entity", {
        entityId: "should-not-run",
        sceneId: "arena",
      })
      .commit();

    assert.equal(result.ok, false);
    assert.equal(result.changed, false);
    assert.equal(result.stoppedAt, 0);
    assert.equal(result.operationResults.length, 1);
    assert.equal(result.operations.length, 2);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_OPERATION_ARG_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should support collecting multiple failed operation diagnostics when requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-client-continue-"));
  try {
    const result = await openProject(root)
      .transaction()
      .operation("scene.set_transform", {
        entityId: "player",
        sceneId: "arena",
      })
      .operation("scene.delete_entity", {
        entityId: "player",
        sceneId: "arena",
      })
      .commit({ stopOnError: false });

    assert.equal(result.ok, false);
    assert.equal(result.stoppedAt, undefined);
    assert.equal(result.operationResults.length, 2);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_SCENE_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_OPERATION_UNSUPPORTED"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should expose authoring recipes as queued facade transactions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-authoring-client-recipe-"));
  try {
    await writeScene(root, "arena");
    const project = openProject(root);
    const plan = project.planRecipe("health-bar", { sceneId: "arena", entityId: "player" });
    const result = await project.recipe("health-bar", { sceneId: "arena", entityId: "player" }).commit();

    assert.equal(plan.ok, true);
    assert.deepEqual(plan.operations.map((operation) => operation.name), ["scene.add_resource", "scene.add_ui_node", "scene.bind_ui"]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.operations.map((operation) => operation.name), ["scene.add_resource", "scene.add_ui_node", "scene.bind_ui"]);
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
