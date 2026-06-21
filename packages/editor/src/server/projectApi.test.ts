import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { applyEditorOperationApi } from "./operationApi.js";
import { loadEditorProjectApi } from "./projectApi.js";

test("should load structured-source starter inventory", async () => {
  const root = await copyStarterProject();
  try {
    const result = await loadEditorProjectApi({ projectPath: root });

    assert.equal(result.ok, true);
    assert.equal(result.documents.some((group) => group.kind === "scene" && group.documents[0]?.path === "content/scenes/arena.scene.json"), true);
    assert.equal(result.documents.some((group) => group.kind === "material"), true);
    assert.equal(result.lod.selected, "original");
    assert.equal(result.lod.loading, false);
    assert.equal(result.lod.triangleCount > 0, true);
    assert.equal(result.lod.loadedTriangles, result.lod.triangleCount);
    assert.deepEqual(
      result.sceneObjects.map((object) => [object.id, object.primitive, object.color, object.position?.join(",")]),
      [
        ["arena.floor", "plane", "#34373d", "0,-0.05,0"],
        ["player", "box", "#2f80ed", "0,0.35,0"],
        ["goal", "box", "#f2c94c", "1.8,0.3,-1.6"],
        ["camera.main", "camera", undefined, undefined],
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should surface validation diagnostics", async () => {
  const root = await copyStarterProject();
  try {
    await writeFile(join(root, "content", "materials", "arena.materials.json"), "{ invalid json\n");
    const result = await loadEditorProjectApi({ projectPath: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_DOCUMENT_READ_FAILED"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported operations without writing source", async () => {
  const root = await copyStarterProject();
  try {
    const scenePath = join(root, "content", "scenes", "arena.scene.json");
    const before = await readFile(scenePath, "utf8");
    const result = await applyEditorOperationApi({ projectPath: root, request: { args: {}, name: "scene.delete_entity" } });
    const after = await readFile(scenePath, "utf8");

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_UNSUPPORTED");
    assert.equal(after, before);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should create, save, and reload default editor scene entities", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-default-scene-"));
  try {
    const create = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { sceneId: "sample-scene" }, name: "scene.create_default" },
    });
    assert.equal(create.ok, true);

    const scenePath = join(root, "content", "scenes", "sample-scene.scene.json");
    const scene = JSON.parse(await readFile(scenePath, "utf8")) as {
      entities: Array<{ components?: Record<string, unknown>; id: string; transform?: { position?: number[] } }>;
      id: string;
    };
    assert.equal(scene.id, "sample-scene");
    assert.deepEqual(scene.entities.map((entity) => entity.id), ["main-camera", "directional-light", "ambient-light"]);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "main-camera")?.components?.camera, { mode: "perspective" });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "directional-light")?.components?.Light, { intensity: 1, kind: "directional" });
    assert.deepEqual(scene.entities.find((entity) => entity.id === "ambient-light")?.components?.Light, { intensity: 0.4, kind: "ambient" });

    const save = await applyEditorOperationApi({
      projectPath: root,
      request: { args: { entityId: "main-camera", position: [1, 2, 3], sceneId: "sample-scene" }, name: "scene.set_transform", projectRevision: create.projectRevision },
    });
    assert.equal(save.ok, true);

    const reloaded = await loadEditorProjectApi({ projectPath: root });
    assert.equal(reloaded.ok, true);
    assert.deepEqual(
      reloaded.sceneObjects.map((object) => [object.id, object.kind, object.position?.join(",")]),
      [
        ["main-camera", "camera", "1,2,3"],
        ["directional-light", "light", "2,4,3"],
        ["ambient-light", "light", undefined],
      ],
    );
    assert.equal(reloaded.lod.triangleCount, 0);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function copyStarterProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-editor-project-api-"));
  await mkdir(root, { recursive: true });
  await cp(resolve("../../templates/structured-source-starter"), root, { recursive: true });
  return root;
}
