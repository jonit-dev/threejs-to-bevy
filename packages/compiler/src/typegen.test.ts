import assert from "node:assert/strict";
import test from "node:test";

import { generateProjectContextTypes } from "./typegen.js";

test("should generate project context id unions and schema maps", () => {
  const output = generateProjectContextTypes([
    {
      data: {
        entities: [{ components: { ChessPiece: { side: "white" }, Health: { value: 100 } }, id: "hero" }],
        id: "arena",
        instances: [{ id: "coin.1", prefab: "coin" }],
        prefabs: [{ id: "coin" }],
        resources: [{ id: "GameState", value: { score: 0 } }],
        schema: "threenative.scene",
        ui: { nodes: [{ id: "score-label" }] },
      },
      file: "content/scenes/arena.scene.json",
      kind: "scene",
      projectRelativePath: "content/scenes/arena.scene.json",
    },
    {
      data: {
        actions: [{ id: "Jump" }],
        axes: [{ id: "MoveX" }],
        id: "arena-input",
        schema: "threenative.input",
      },
      file: "content/input/arena.input.json",
      kind: "input",
      projectRelativePath: "content/input/arena.input.json",
    },
    {
      data: {
        id: "component-schemas",
        kind: "component",
        schema: "threenative.schema",
        schemas: [{ id: "Health", fields: { value: { kind: "number", required: true } } }],
      },
      file: "content/schemas/components.schema.json",
      kind: "schema",
      projectRelativePath: "content/schemas/components.schema.json",
    },
    {
      data: {
        id: "resource-schemas",
        kind: "resource",
        schema: "threenative.schema",
        schemas: [{ id: "GameState", fields: { score: { kind: "number" }, status: { kind: "string" } } }],
      },
      file: "content/schemas/resources.schema.json",
      kind: "schema",
      projectRelativePath: "content/schemas/resources.schema.json",
    },
  ]);

  assert.match(output, /export type ProjectEntityId = "coin\.1" \| "hero";/);
  assert.match(output, /export type ProjectInputId = "Jump" \| "MoveX";/);
  assert.match(output, /export type ProjectPrefabId = "coin";/);
  assert.match(output, /export type ProjectResourceId = "GameState";/);
  assert.match(output, /export type ProjectSceneId = "arena";/);
  assert.match(output, /export type ProjectUiId = "score-label";/);
  assert.match(output, /"Health": \{ "value": number \};/);
  assert.match(output, /"ChessPiece": \{ \[key: string\]: unknown \};/);
  assert.doesNotMatch(output, /"Health": \{ \[key: string\]: unknown \};/);
  assert.match(output, /"GameState": \{ "score": number; "status": string \};/);
  assert.match(output, /export interface ProjectContext extends ScriptContext/);
});
