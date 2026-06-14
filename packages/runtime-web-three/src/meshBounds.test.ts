import assert from "node:assert/strict";
import test from "node:test";

import { aabbIntersectsAabb, meshAabb, meshBoundingSphere, sampleMeshPoints, sphereIntersectsSphere } from "./meshBounds.js";

test("meshBounds should compute custom mesh samples aabb and sphere intersections", () => {
  const custom = {
    id: "mesh.custom",
    kind: "mesh" as const,
    format: "generated" as const,
    primitive: "custom" as const,
    attributes: [{ itemSize: 3 as const, name: "position" as const, values: [-1, -2, 0, 2, 0, 1, 0, 3, -1] }],
    indices: [0, 1, 2],
  };
  const box = { id: "mesh.box", kind: "mesh" as const, format: "generated" as const, primitive: "box" as const, size: [2, 2, 2] };

  assert.deepEqual(sampleMeshPoints(custom, { maxSamples: 2 }), [
    [-1, -2, 0],
    [2, 0, 1],
  ]);
  assert.deepEqual(meshAabb(custom), { min: [-1, -2, -1], max: [2, 3, 1] });
  assert.equal(aabbIntersectsAabb(meshAabb(custom)!, meshAabb(box)!), true);
  assert.equal(sphereIntersectsSphere(meshBoundingSphere(custom)!, meshBoundingSphere(box)!), true);
});
