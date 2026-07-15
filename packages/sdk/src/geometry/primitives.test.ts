import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { makePlane, makePrism, makeRoundedBox, makeTorus } from "./meshBuilderParts.js";
import { AnnulusGeometry, BoxGeometry, CustomMeshGeometry, RegularPolygonGeometry, TorusGeometry } from "./primitives.js";

test("should generate torus with expected vertex count when segments given", () => {
  const radialSegments = 8;
  const tubularSegments = 12;
  const part = makeTorus(1, 0.25, radialSegments, tubularSegments);

  assert.equal(part.positions.length / 3, (radialSegments + 1) * (tubularSegments + 1));
  assert.equal(part.indices.length, radialSegments * tubularSegments * 6);
  for (let index = 0; index < part.normals.length; index += 3) {
    assert.ok(Math.abs(Math.hypot(
      part.normals[index] ?? 0,
      part.normals[index + 1] ?? 0,
      part.normals[index + 2] ?? 0,
    ) - 1) < 1e-12);
  }
});

test("should generate a watertight manifold when building prism", () => {
  const part = makePrism(6, 1, 2);
  const vertexCount = part.positions.length / 3;
  assert.equal(part.indices.length % 3, 0);
  assert.ok(Math.max(...part.indices) < vertexCount);

  const positionKey = (vertex: number): string => [
    part.positions[vertex * 3],
    part.positions[vertex * 3 + 1],
    part.positions[vertex * 3 + 2],
  ].map((value) => (Math.abs(value ?? 0) < 1e-12 ? 0 : value ?? 0).toFixed(12)).join(",");
  const edgeCounts = new Map<string, number>();
  for (let index = 0; index < part.indices.length; index += 3) {
    const triangle = [part.indices[index]!, part.indices[index + 1]!, part.indices[index + 2]!];
    const edges: readonly (readonly [number, number])[] = [
      [triangle[0]!, triangle[1]!],
      [triangle[1]!, triangle[2]!],
      [triangle[2]!, triangle[0]!],
    ];
    for (const [a, b] of edges) {
      const edge = [positionKey(a), positionKey(b)].sort().join("|");
      edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
    }
  }
  assert.ok(edgeCounts.size > 0);
  assert.ok([...edgeCounts.values()].every((count) => count === 2));
  for (let side = 0; side < 6; side += 1) {
    const base = side * 4;
    const normal = part.normals.slice(base * 3, base * 3 + 3);
    for (let vertex = 1; vertex < 4; vertex += 1) {
      assert.deepEqual(part.normals.slice((base + vertex) * 3, (base + vertex) * 3 + 3), normal);
    }
    const edge = [
      (part.positions[(base + 2) * 3] ?? 0) - (part.positions[base * 3] ?? 0),
      (part.positions[(base + 2) * 3 + 1] ?? 0) - (part.positions[base * 3 + 1] ?? 0),
      (part.positions[(base + 2) * 3 + 2] ?? 0) - (part.positions[base * 3 + 2] ?? 0),
    ];
    assert.ok(Math.abs(edge.reduce((dot, value, axis) => dot + value * (normal[axis] ?? 0), 0)) < 1e-12);
  }
});

test("should generate a segmented plane and bounded rounded box", () => {
  const plane = makePlane(2, 3, 4, 2);
  assert.equal(plane.positions.length / 3, 15);
  assert.equal(plane.indices.length, 4 * 2 * 6);
  assert.ok(plane.normals.every((value, index) => value === (index % 3 === 1 ? 1 : 0)));

  const roundedBox = makeRoundedBox(2, 1, 1.5, 0.2, 2);
  const xValues = roundedBox.positions.filter((_, index) => index % 3 === 0);
  const yValues = roundedBox.positions.filter((_, index) => index % 3 === 1);
  const zValues = roundedBox.positions.filter((_, index) => index % 3 === 2);
  assert.ok(Math.abs(Math.min(...xValues) + 1) < 1e-12);
  assert.ok(Math.abs(Math.max(...xValues) - 1) < 1e-12);
  assert.ok(Math.abs(Math.min(...yValues) + 0.5) < 1e-12);
  assert.ok(Math.abs(Math.max(...yValues) - 0.5) < 1e-12);
  assert.ok(Math.abs(Math.min(...zValues) + 0.75) < 1e-12);
  assert.ok(Math.abs(Math.max(...zValues) - 0.75) < 1e-12);
});

test("should reject non-finite box size", () => {
  assert.throws(
    () => new BoxGeometry({ size: [1, Number.NaN, 1] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GEOMETRY_INVALID_SIZE",
  );
});

test("should reject invalid catalog primitive dimensions", () => {
  assert.throws(
    () => new TorusGeometry({ innerRadius: 1, outerRadius: 0.5 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GEOMETRY_INVALID_RADIUS",
  );
  assert.throws(
    () => new AnnulusGeometry({ innerRadius: 1, outerRadius: 1 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GEOMETRY_INVALID_RADIUS",
  );
  assert.throws(
    () => new RegularPolygonGeometry({ sides: 2 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GEOMETRY_INVALID_SIDES",
  );
});

test("should validate custom mesh attributes", () => {
  const geometry = new CustomMeshGeometry({
    attributes: [
      { itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
      { itemSize: 4, name: "color", values: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] },
      { itemSize: 1, name: "custom:weight", values: [0, 0.5, 1] },
    ],
    indices: [0, 1, 2],
  });

  assert.deepEqual(geometry.attributes.map((attribute) => attribute.name), ["color", "custom:weight", "position"]);
  assert.deepEqual(geometry.indices, [0, 1, 2]);
  assert.throws(
    () =>
      new CustomMeshGeometry({
        attributes: [
          { itemSize: 3, name: "position", values: [0, 0, 0] },
          { itemSize: 2, name: "normal", values: [0, 0] },
        ],
      }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GEOMETRY_MESH_ATTRIBUTE_ITEM_SIZE_INVALID",
  );
});
