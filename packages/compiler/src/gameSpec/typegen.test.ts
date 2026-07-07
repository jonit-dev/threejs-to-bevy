import assert from "node:assert/strict";
import test from "node:test";

import { generateTypedGameSpecIdTypes } from "./typegen.js";

test("should generate id unions from project source", () => {
  const output = generateTypedGameSpecIdTypes([
    {
      data: {
        entities: [{ id: "player" }],
        id: "arena",
        resources: [{ id: "score" }],
        schema: "threenative.scene",
        ui: { nodes: [{ id: "score-label" }] },
      },
      file: "content/scenes/arena.scene.json",
      kind: "scene",
      projectRelativePath: "content/scenes/arena.scene.json",
    },
    {
      data: {
        actions: [{ id: "move-z" }],
        axes: [{ id: "move-x" }],
        id: "arena",
        schema: "threenative.input",
      },
      file: "content/input/arena.input.json",
      kind: "input",
      projectRelativePath: "content/input/arena.input.json",
    },
    {
      data: {
        id: "materials",
        materials: [{ id: "player-material" }],
        schema: "threenative.materials",
      },
      file: "content/materials/materials.materials.json",
      kind: "material",
      projectRelativePath: "content/materials/materials.materials.json",
    },
  ]);

  assert.match(output, /entity: "player";/);
  assert.match(output, /input: "move-x" \| "move-z";/);
  assert.match(output, /material: "player-material";/);
  assert.match(output, /resource: "score";/);
  assert.match(output, /scene: "arena";/);
  assert.match(output, /ui: "score-label";/);
});
