import assert from "node:assert/strict";
import test from "node:test";

import type { IGltfSceneMetadataIr } from "./gltfScene.js";
import { normalizeGltfSceneHandlesIr, validateGltfSceneHandlesIr, type IGltfSceneHandlesIr } from "./gltfSceneHandles.js";
import type { IMaterialsIr } from "./types.js";

test("gltfSceneHandles should validate transform visibility and material update operations", () => {
  const handles: IGltfSceneHandlesIr = {
    handles: [
      { assetId: "model.level", id: "handle.window", instanceId: "level.instance", nodePath: "/Root/Window" },
      { assetId: "model.level", id: "handle.door", instanceId: "level.instance", nodePath: "/Root/Door" },
    ],
    operations: [
      { handle: "handle.door", kind: "visibility", visible: false },
      { handle: "handle.window", kind: "material", material: "mat.highlight" },
      { handle: "handle.door", kind: "transform", transform: { position: [1, 2, 3] } },
    ],
    schema: "threenative.gltf-scene-handles",
    version: "0.1.0",
  };

  const normalized = normalizeGltfSceneHandlesIr(handles);
  const diagnostics = validateGltfSceneHandlesIr(normalized, metadata(), materials());

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(normalized.handles.map((handle) => handle.id), ["handle.door", "handle.window"]);
  assert.deepEqual(normalized.operations.map((operation) => `${operation.handle}:${operation.kind}`), [
    "handle.door:transform",
    "handle.door:visibility",
    "handle.window:material",
  ]);
});

test("gltfSceneHandles should reject ambiguous gltf node handle refs", () => {
  const handles: IGltfSceneHandlesIr = {
    handles: [{ assetId: "model.level", id: "handle.door", instanceId: "level.instance", nodeName: "Door" }],
    operations: [],
    schema: "threenative.gltf-scene-handles",
    version: "0.1.0",
  };

  const diagnostics = validateGltfSceneHandlesIr(handles, {
    ...metadata(),
    assets: [
      {
        assetId: "model.level",
        customAttributes: [],
        materials: [],
        morphTargets: [],
        nodes: [
          { name: "Door", path: "/Root/Door", spawnedHandleEligible: true },
          { name: "Door", path: "/Root/Group/Door", spawnedHandleEligible: true },
        ],
      },
    ],
  }, materials());

  assert.equal(diagnostics[0]?.code, "TN_IR_GLTF_HANDLE_AMBIGUOUS");
  assert.equal(diagnostics[0]?.path, "gltf.handles.json/handles/0/nodeName");
  assert.match(diagnostics[0]?.suggestion ?? "", /full glTF node path/);
});

function metadata(): IGltfSceneMetadataIr {
  return {
    assets: [
      {
        assetId: "model.level",
        customAttributes: [],
        materials: [],
        morphTargets: [],
        nodes: [
          { name: "Door", path: "/Root/Door", spawnedHandleEligible: true },
          { name: "Window", path: "/Root/Window", spawnedHandleEligible: true },
        ],
      },
    ],
    schema: "threenative.gltf-scene",
    version: "0.1.0",
  };
}

function materials(): IMaterialsIr {
  return {
    materials: [{ color: "#ffffff", id: "mat.highlight", kind: "standard" }],
    schema: "threenative.materials",
    version: "0.1.0",
  };
}
