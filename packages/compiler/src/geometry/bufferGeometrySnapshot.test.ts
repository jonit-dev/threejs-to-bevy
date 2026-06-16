import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBufferGeometrySnapshot } from "./bufferGeometrySnapshot.js";

test("should normalize a BufferGeometry snapshot into portable mesh data", () => {
  const geometry = normalizeBufferGeometrySnapshot("snapshot.triangle", {
    attributes: {
      position: { itemSize: 3, array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
      normal: { itemSize: 3, array: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) },
      uv: { itemSize: 2, array: new Float32Array([0, 0, 1, 0, 0, 1]) },
      weight: { itemSize: 1, array: new Float32Array([0, 0.5, 1]) },
    },
    index: new Uint16Array([0, 1, 2]),
  });

  assert.deepEqual(geometry.bounds, { min: [0, 0, 0], max: [1, 1, 0] });
  assert.equal(geometry.generation?.source, "BufferGeometrySnapshot");
  assert.equal(geometry.storage, "binary");
  assert.deepEqual(geometry.indices, [0, 1, 2]);
  assert.deepEqual(
    geometry.attributes.map((attribute) => attribute.name),
    ["custom:weight", "normal", "position", "uv"],
  );
});
