import assert from "node:assert/strict";
import test from "node:test";

import { allowedEditorChatOperationCatalog, planEditorChatOperations, type IEditorChatContext } from "./chatPlan.js";

test("should plan an add-entity ECS change from chat context", () => {
  const plan = planEditorChatOperations({
    context: context(),
    message: "add a dynamic physics cube in front of the camera",
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.operations.map((operation) => operation.name).slice(0, 3), ["scene.add_prefab", "scene.add_entity", "scene.set_transform"]);
  assert.equal(plan.operations.some((operation) => operation.name === "scene.set_rigid_body"), true);
  assert.equal(plan.operations.some((operation) => operation.name === "scene.set_collider"), true);
  assert.equal(plan.affectedFiles.includes("content/scenes/arena.scene.json"), true);
  assert.equal(plan.diagnostics.length, 0);
});

test("should reject unsupported chat intents without source writes", () => {
  const plan = planEditorChatOperations({
    context: context(),
    message: "rewrite the generated world.ir.json by hand",
  });

  assert.equal(plan.ok, false);
  assert.deepEqual(plan.operations, []);
  assert.equal(plan.diagnostics[0]?.code, "TN_EDITOR_CHAT_INTENT_UNSUPPORTED");
});

test("should include selected entity context in chat transform plans", () => {
  const plan = planEditorChatOperations({
    context: context({ selectedEntityId: "player", selectedRowId: "entity:content/scenes/arena.scene.json:player" }),
    message: "move selected entity to 1, 2, 3",
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.operations.map((operation) => operation.name), ["scene.set_transform"]);
  assert.deepEqual(plan.operations[0]?.args, { entityId: "player", position: [1, 2, 3], sceneId: "arena" });
});

function context(overrides: Partial<IEditorChatContext> = {}): IEditorChatContext {
  return {
    activeSceneId: "arena",
    diagnostics: [],
    operationCatalog: allowedEditorChatOperationCatalog(),
    projectRevision: "rev:1",
    sceneObjects: [
      {
        components: ["Transform", "MeshRenderer"],
        documentPath: "content/scenes/arena.scene.json",
        id: "player",
        kind: "entity",
        label: "Player",
        position: [0, 0.35, 0],
        primitive: "box",
        rowId: "entity:content/scenes/arena.scene.json:player",
        sourcePath: "content/scenes/arena.scene.json#/entities/1",
      },
    ],
    ...overrides,
  };
}
