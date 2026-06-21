import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AUTHORING_OPERATION_NAMES,
  dispatchAuthoringOperation,
  getAuthoringOperationDescriptor,
  listAuthoringOperationDescriptors,
} from "./operationRegistry.js";

test("should dispatch promoted editor-safe operations", async () => {
  const root = await createRegistryProject();
  try {
    const result = await dispatchAuthoringOperation({
      args: {
        entityId: "player",
        position: [1, 2, 3],
        sceneId: "scene.arena",
      },
      name: "scene.set_transform",
      projectPath: root,
    });
    const scene = JSON.parse(await readFile(join(root, "content", "scenes", "arena.scene.json"), "utf8")) as {
      entities: Array<{ id: string; transform?: { position?: number[] } }>;
    };

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.deepEqual(result.filesWritten, ["content/scenes/arena.scene.json"]);
    assert.deepEqual(scene.entities.find((entity) => entity.id === "player")?.transform?.position, [1, 2, 3]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should expose operation metadata and registry diagnostics", async () => {
  const descriptors = listAuthoringOperationDescriptors();
  const transform = getAuthoringOperationDescriptor("scene.set_transform");
  const missing = await dispatchAuthoringOperation({ args: { entityId: "player" }, name: "scene.set_transform", projectPath: "/project" });
  const unsupported = await dispatchAuthoringOperation({ args: {}, name: "scene.delete_entity", projectPath: "/project" });

  assert.deepEqual(AUTHORING_OPERATION_NAMES, [
    "scene.add_entity",
    "scene.set_transform",
    "scene.set_camera",
    "scene.attach_script",
    "scene.bind_ui",
    "ui.set_layout",
    "ui.bind",
    "material.set",
    "system.attach_script",
  ]);
  assert.equal(descriptors.length, AUTHORING_OPERATION_NAMES.length);
  assert.equal(transform?.pathPolicy, "source-document");
  assert.equal(transform?.sourceFamily, "scene");
  assert.equal(missing.ok, false);
  assert.equal(missing.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_ARG_MISSING");
  assert.equal(missing.diagnostics[0]?.path, "/sceneId");
  assert.equal(unsupported.diagnostics[0]?.code, "TN_AUTHORING_OPERATION_UNSUPPORTED");
});

async function createRegistryProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-operation-registry-"));
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await writeFile(
    join(root, "content", "scenes", "arena.scene.json"),
    `${JSON.stringify(
      {
        schema: "threenative.scene",
        version: "0.1.0",
        id: "scene.arena",
        entities: [{ id: "player", transform: { position: [0, 0, 0] } }],
        prefabs: [],
        resources: [],
        systems: [],
        ui: { nodes: [] },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}
