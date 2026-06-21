import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadAuthoringProject } from "@threenative/authoring";

import { runEditorOperation } from "./operations.js";
import { buildSceneHierarchyModel, buildSceneLifecycleModel } from "./sceneModel.js";

test("should build hierarchy from scene source documents", async () => {
  const root = await createSceneProject();
  try {
    const project = await loadAuthoringProject({ projectPath: root });
    const rows = buildSceneHierarchyModel(project.documents);

    assert.deepEqual(rows.map((row) => [row.kind, row.id, row.documentPath]), [
      ["scene", "scene:scene.arena", "content/scenes/arena.scene.json"],
      ["entity", "entity:player", "content/scenes/arena.scene.json"],
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should list source scenes and selected active scene", async () => {
  const root = await createSceneProject();
  try {
    await writeFile(
      join(root, "content", "scenes", "menu.scene.json"),
      `${JSON.stringify({ schema: "threenative.scene", version: "0.1.0", id: "scene.menu", entities: [], prefabs: [], resources: [], systems: [], ui: { nodes: [] } }, null, 2)}\n`,
    );
    const project = await loadAuthoringProject({ projectPath: root });
    const lifecycle = buildSceneLifecycleModel(project.documents, { activeScenePath: "content/scenes/menu.scene.json" });

    assert.equal(lifecycle.state, "saved");
    assert.deepEqual(lifecycle.scenes.map((scene) => [scene.id, scene.documentPath]), [
      ["scene.arena", "content/scenes/arena.scene.json"],
      ["scene.menu", "content/scenes/menu.scene.json"],
    ]);
    assert.equal(lifecycle.activeScene?.id, "scene.menu");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report diagnostic lifecycle state when project has errors", async () => {
  const root = await createSceneProject();
  try {
    const project = await loadAuthoringProject({ projectPath: root });
    const lifecycle = buildSceneLifecycleModel(project.documents, { hasErrors: true });

    assert.equal(lifecycle.state, "diagnostic");
    assert.equal(lifecycle.activeScene?.id, "scene.arena");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should distinguish dirty and build-ready lifecycle states", async () => {
  const root = await createSceneProject();
  try {
    const project = await loadAuthoringProject({ projectPath: root });

    assert.equal(buildSceneLifecycleModel(project.documents, { buildReady: true }).state, "build-ready");
    assert.equal(buildSceneLifecycleModel(project.documents, { buildReady: true, dirty: true }).state, "dirty");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should apply transform through authoring operation", async () => {
  const root = await createSceneProject();
  try {
    const result = await runEditorOperation({
      args: { entityId: "player", position: [3, 2, 1], sceneId: "scene.arena" },
      name: "scene.set_transform",
      projectPath: root,
    });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { position?: number[] } }>;
    };

    assert.equal(result.ok, true);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.transform?.position, [3, 2, 1]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function createSceneProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-scene-model-"));
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await writeFile(
    join(root, "content", "scenes", "arena.scene.json"),
    `${JSON.stringify({ schema: "threenative.scene", version: "0.1.0", id: "scene.arena", entities: [{ id: "player" }], prefabs: [], resources: [], systems: [], ui: { nodes: [] } }, null, 2)}\n`,
  );
  return root;
}
