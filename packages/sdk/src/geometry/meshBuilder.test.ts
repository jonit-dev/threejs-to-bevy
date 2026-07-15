import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { assertMeshBuilderCsgBudget } from "./meshBuilderCsg.js";
import { MeshBuilder } from "./meshBuilder.js";
import { CustomMeshGeometry } from "./primitives.js";

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

test("should normalize deterministic procedural LOD shorthand and descriptors", () => {
  const shorthand = MeshBuilder.create("prop.lod.defaults")
    .sphere({ radius: 2, rings: 12, segments: 20 })
    .build({ lodLevels: 2 });

  assert.deepEqual(shorthand.lodLevels?.map((level) => ({ minDistance: level.minDistance, targetRatio: level.targetRatio })), [
    { minDistance: 40, targetRatio: 0.5 },
    { minDistance: 80, targetRatio: 0.25 },
  ]);
  assert.ok((shorthand.lodLevels?.[0]?.indices.length ?? Infinity) < (shorthand.indices?.length ?? 0));
  assert.ok((shorthand.lodLevels?.[1]?.indices.length ?? Infinity) < (shorthand.indices?.length ?? 0));

  const explicit = MeshBuilder.create("prop.lod.explicit")
    .sphere({ rings: 12, segments: 20 })
    .build({ lodLevels: [{ minDistance: 12, ratio: 0.6 }, { minDistance: 30, ratio: 0.3 }] });
  assert.deepEqual(explicit.lodLevels?.map((level) => ({ minDistance: level.minDistance, targetRatio: level.targetRatio })), [
    { minDistance: 12, targetRatio: 0.6 },
    { minDistance: 30, targetRatio: 0.3 },
  ]);
});

test("should reject invalid procedural LOD count ratio and distance ordering", () => {
  assert.throws(
    () => MeshBuilder.create("prop.lod.count").sphere().build({ lodLevels: 5 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_LOD_COUNT_INVALID",
  );
  assert.throws(
    () => MeshBuilder.create("prop.lod.ratios").sphere().build({ lodLevels: [{ ratio: 0.4 }, { ratio: 0.5 }] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_LOD_RATIO_ORDER_INVALID",
  );
  assert.throws(
    () => MeshBuilder.create("prop.lod.distances").sphere().build({ lodLevels: [{ minDistance: 20 }, { minDistance: 10 }] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_LOD_DISTANCE_ORDER_INVALID",
  );
});

test("should retain the legacy geometry shape when procedural LOD is absent", () => {
  const geometry = MeshBuilder.create("prop.no-lod").box().build();
  assert.equal("lodLevels" in geometry, true);
  assert.equal(geometry.lodLevels, undefined);
  assert.equal(JSON.stringify(geometry).includes('"lodLevels"'), false);
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

test("should throw TN_SDK_MESH_BUILDER_* when torus radius is not positive", () => {
  assert.throws(
    () => MeshBuilder.create("prop.invalid-torus").torus({ minorRadius: 0 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_VALUE_INVALID",
  );
});

test("should validate expanded primitive dimensions and segments", () => {
  assert.throws(
    () => MeshBuilder.create("prop.invalid-plane").plane({ size: [0, 1] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_VALUE_INVALID",
  );
  assert.throws(
    () => MeshBuilder.create("prop.invalid-prism").prism({ sides: 2 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_SEGMENTS_INVALID",
  );
  assert.throws(
    () => MeshBuilder.create("prop.invalid-rounded-box").roundedBox({ cornerRadius: 0.6, size: [1, 1, 1] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_VALUE_INVALID",
  );
});

test("should produce identical geometry when built twice with same primitive options", () => {
  const build = () => MeshBuilder.create("prop.phase-one")
    .torus({ majorRadius: 0.8, minorRadius: 0.16, radialSegments: 9, tubularSegments: 14 })
    .position([0, -0.4, 0])
    .roundedBox({ cornerRadius: 0.12, cornerSegments: 3, size: [1.4, 0.5, 0.7] })
    .position([0, 0.5, 0])
    .prism({ height: 0.8, radius: 0.3, sides: 7 })
    .position([0, -0.7, 0])
    .plane({ depthSegments: 3, size: [2, 1.5], widthSegments: 4 })
    .build();

  const first = build();
  const second = build();
  assert.deepEqual(second.attributes, first.attributes);
  assert.deepEqual(second.indices, first.indices);
});

test("should apply deterministic coherent noise within the authored amplitude", () => {
  const base = MeshBuilder.create("noise.base").plane({ size: [2, 2], widthSegments: 8, depthSegments: 8 }).build();
  const build = () => MeshBuilder.create("noise.displaced")
    .plane({ size: [2, 2], widthSegments: 8, depthSegments: 8 })
    .coherentNoise({ amplitude: 0.2, frequency: 1.4, octaves: 4, seed: 23 })
    .build();
  const first = build();
  const second = build();
  assert.deepEqual(second.attributes, first.attributes);
  const basePosition = base.attributes.find((attribute) => attribute.name === "position")!;
  const displacedPosition = first.attributes.find((attribute) => attribute.name === "position")!;
  displacedPosition.values.forEach((value, index) => {
    assert.ok(Math.abs(value - (basePosition.values[index] ?? 0)) <= 0.2 + 1e-8);
  });
});

test("should bound coherent displacement for merged non-unit normals", () => {
  const merged = new CustomMeshGeometry({
    attributes: [
      { itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 0, 1] },
      { itemSize: 3, name: "normal", values: [0, 10, 0, 0, 10, 0, 0, 10, 0] },
      { itemSize: 2, name: "uv", values: [0, 0, 1, 0, 0, 1] },
    ],
    indices: [0, 1, 2],
  });
  const geometry = MeshBuilder.create("noise.merged")
    .merge(merged)
    .coherentNoise({ amplitude: 0.1, seed: 5 })
    .build();
  const positions = geometry.attributes.find((attribute) => attribute.name === "position")!.values;
  assert.ok(Math.abs(positions[1] ?? 0) <= 0.1);
  assert.ok(Math.abs(positions[4] ?? 0) <= 0.1);
  assert.ok(Math.abs(positions[7] ?? 0) <= 0.1);
});

test("should expose weld subdivide and mirror as chainable topology operations", () => {
  const geometry = MeshBuilder.create("topology.chain")
    .box()
    .weld()
    .subdivide({ iterations: 1 })
    .mirror({ axis: "z" })
    .build();
  const position = geometry.attributes.find((attribute) => attribute.name === "position")!;
  assert.ok(position.values.length / 3 > 8);
  assert.equal((geometry.indices?.length ?? 0) / 3, 48);
});

test("should throw budget error when subdivide exceeds prop budget", () => {
  assert.throws(
    () => MeshBuilder.create("topology.too-large")
      .sphere({ radius: 1, rings: 60, segments: 100 })
      .subdivide({ iterations: 2 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_BUDGET_EXCEEDED",
  );
});

test("should compose deterministic CSG operands through nested builders", () => {
  const build = () => MeshBuilder.create("prop.arch")
    .box({ size: [2, 2, 0.5] })
    .subtract((operand) => {
      operand.position([0, -0.5, 0]).cylinder({ height: 1, radius: 0.55, segments: 24 }).rotate([Math.PI / 2, 0, 0]);
    })
    .build({ budget: "hero-prop" });
  const first = build();
  const second = build();
  assert.deepEqual(second.attributes, first.attributes);
  assert.deepEqual(second.indices, first.indices);
});

test("should reject an empty CSG operand", () => {
  assert.throws(
    () => MeshBuilder.create("invalid.csg").box().subtract(() => undefined),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_CSG_INVALID",
  );
});

test("should throw budget error when CSG result exceeds hero-prop budget", () => {
  assert.throws(
    () => assertMeshBuilderCsgBudget({
      colors: [],
      indices: [],
      normals: [],
      positions: Array.from({ length: 25_001 * 3 }, () => 0),
      uvs: [],
    }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_BUDGET_EXCEEDED",
  );
});

test("should attach box collider metadata matching bounds when build collider box", () => {
  const geometry = MeshBuilder.create("prop.collider.box")
    .position([2, 3, 4])
    .box({ size: [4, 2, 6] })
    .build({ collider: "box" });

  assert.deepEqual(geometry.collider, {
    center: [2, 3, 4],
    kind: "box",
    size: [4, 2, 6],
  });
});

test("should reject derived collider metadata when bounds have zero extent", () => {
  assert.throws(
    () => MeshBuilder.create("prop.collider.flat")
      .raw({ indices: [0, 1, 2], positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] })
      .build({ collider: "box" }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_COLLIDER_BOUNDS_INVALID",
  );
});

test("should reject derived mesh collider metadata over the triangle limit", () => {
  const indices = Array.from({ length: 10_001 }, () => [0, 1, 2]).flat();
  assert.throws(
    () => MeshBuilder.create("prop.collider.too-many-triangles")
      .raw({ indices, positions: [0, 0, 0, 1, 0, 0, 0, 1, 1] })
      .build({ collider: "mesh" }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_MESH_BUILDER_COLLIDER_TRIANGLE_COUNT_EXCEEDED",
  );
});
