import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { AnnulusGeometry, BoxGeometry, CustomMeshGeometry, RegularPolygonGeometry, TorusGeometry } from "./primitives.js";

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
