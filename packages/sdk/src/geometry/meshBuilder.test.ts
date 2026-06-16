import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { MeshBuilder } from "./meshBuilder.js";

test("should build a deterministic mushroom mesh from primitives", () => {
  const build = () =>
    MeshBuilder.create("prop.mushroom.red")
      .position([0, 0.35, 0])
      .cylinder({ height: 0.7, radius: 0.16, segments: 12 })
      .position([0, 0.8, 0])
      .scale([1.05, 0.42, 1.05])
      .sphere({ radius: 0.55, rings: 8, segments: 18 })
      .build({ helper: "mushroom", seed: 7 });

  const first = build();
  const second = build();

  assert.deepEqual(second.attributes, first.attributes);
  assert.deepEqual(second.indices, first.indices);
  assert.deepEqual(second.bounds, first.bounds);
  assert.deepEqual(second.generation, first.generation);
});

test("should reject procedural meshes over the P1 prop budget", () => {
  assert.throws(
    () => MeshBuilder.create("prop.hero.too-large").sphere({ radius: 1, rings: 90, segments: 90 }).build(),
    (error) =>
      error instanceof SdkError &&
      error.code === "TN_SDK_MESH_BUILDER_BUDGET_EXCEEDED" &&
      /8281 vertices, exceeding standard-prop budget 8000/.test(error.message),
  );
});

test("should generate normals and uv0 for merged primitives", () => {
  const geometry = MeshBuilder.create("prop.tree")
    .position([0, 0.5, 0])
    .cylinder({ height: 1, radius: 0.15, segments: 8 })
    .position([0, 1.2, 0])
    .sphere({ radius: 0.55, rings: 6, segments: 10 })
    .build();

  const position = geometry.attributes.find((attribute) => attribute.name === "position");
  const normal = geometry.attributes.find((attribute) => attribute.name === "normal");
  const uv = geometry.attributes.find((attribute) => attribute.name === "uv");

  assert.ok(position);
  assert.ok(normal);
  assert.ok(uv);
  assert.equal(normal.values.length / normal.itemSize, position.values.length / position.itemSize);
  assert.equal(uv.values.length / uv.itemSize, position.values.length / position.itemSize);
  assert.ok((geometry.indices?.length ?? 0) > 0);
});
