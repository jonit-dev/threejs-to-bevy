import assert from "node:assert/strict";
import test from "node:test";

import { applyGltfSceneHandleOperations } from "./gltfSceneHandles.js";

test("gltfSceneHandles should update spawned gltf node transform and visibility", () => {
  const observations = applyGltfSceneHandleOperations(
    {
      assets: [
        {
          assetId: "model.level",
          customAttributes: [],
          materials: [],
          morphTargets: [],
          nodes: [
            {
              name: "Door",
              path: "/Root/Door",
              spawnedHandleEligible: true,
              transform: { translation: [0, 0, 0] },
            },
          ],
        },
      ],
      schema: "threenative.gltf-scene",
      version: "0.1.0",
    },
    {
      handles: [{ assetId: "model.level", id: "handle.door", instanceId: "level.instance", nodePath: "/Root/Door" }],
      operations: [
        { handle: "handle.door", kind: "transform", transform: { position: [1, 2, 3] } },
        { handle: "handle.door", kind: "visibility", visible: false },
      ],
      schema: "threenative.gltf-scene-handles",
      version: "0.1.0",
    },
  );

  assert.deepEqual(observations, [
    {
      after: { transform: { position: [1, 2, 3] } },
      before: { transform: { position: [0, 0, 0] } },
      handle: "handle.door",
      nodePath: "/Root/Door",
      operation: "transform",
      status: "applied",
    },
    {
      after: { visible: false },
      before: { visible: true },
      handle: "handle.door",
      nodePath: "/Root/Door",
      operation: "visibility",
      status: "applied",
    },
  ]);
});
