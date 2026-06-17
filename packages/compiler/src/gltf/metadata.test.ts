import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { extractGltfSceneMetadata } from "./metadata.js";

test("should extract named gltf nodes and extras deterministically", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gltf-metadata-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/level.gltf"), JSON.stringify(levelGltf()));
    const assets = [{ format: "gltf", id: "model.level", kind: "model", path: "assets/level.gltf", sourceMode: "bundle" }];

    const first = await extractGltfSceneMetadata(root, assets);
    const second = await extractGltfSceneMetadata(root, assets);

    assert.deepEqual(first, second);
    assert.deepEqual(first?.assets[0]?.nodes.map((node) => node.path), ["/Root", "/Root/Door", "/Root/Window"]);
    assert.deepEqual(first?.assets[0]?.nodes.find((node) => node.path === "/Root/Door"), {
      extras: { gameplayTag: "door" },
      materials: ["material:Paint"],
      mesh: "mesh:DoorMesh",
      name: "Door",
      parentPath: "/Root",
      path: "/Root/Door",
      spawnedHandleEligible: true,
      transform: { translation: [1, 2, 3] },
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report custom gltf vertex attributes as inspection metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gltf-attributes-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/level.gltf"), JSON.stringify(levelGltf()));

    const metadata = await extractGltfSceneMetadata(root, [
      { format: "gltf", id: "model.level", kind: "model", path: "assets/level.gltf", sourceMode: "bundle" },
    ]);

    assert.deepEqual(metadata?.assets[0]?.customAttributes, [
      {
        componentType: "f32",
        itemSize: 3,
        name: "_WIND",
        normalized: false,
        shaderConsumption: "inspectionOnly",
        targetMesh: "mesh:DoorMesh",
      },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function levelGltf(): unknown {
  return {
    accessors: [{ componentType: 5126, normalized: false, type: "VEC3" }],
    asset: { version: "2.0" },
    materials: [{ name: "Paint" }],
    meshes: [
      {
        name: "DoorMesh",
        primitives: [
          {
            attributes: { POSITION: 0, _WIND: 0 },
            material: 0,
          },
        ],
      },
    ],
    nodes: [
      { children: [1, 2], name: "Root" },
      { extras: { gameplayTag: "door" }, mesh: 0, name: "Door", translation: [1, 2, 3] },
      { name: "Window" },
    ],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
}
