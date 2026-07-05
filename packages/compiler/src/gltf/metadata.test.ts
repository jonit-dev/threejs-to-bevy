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
    assert.deepEqual(first?.assets[0]?.materials, []);
    assert.deepEqual(first?.assets[0]?.morphTargets, []);
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

test("should preserve portable gltf material metadata in manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-gltf-materials-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/hero.gltf"), JSON.stringify(materialGltf()));

    const metadata = await extractGltfSceneMetadata(root, [
      { format: "gltf", id: "model.hero", kind: "model", path: "assets/hero.gltf", sourceMode: "bundle" },
    ]);

    assert.deepEqual(metadata?.assets[0]?.materials, [
      {
        extensions: [
          {
            extension: "KHR_materials_clearcoat",
            path: "/materials/0/extensions/KHR_materials_clearcoat",
            properties: ["clearcoatFactor", "clearcoatTexture"],
            status: "promoted",
          },
          {
            extension: "VENDOR_custom_shader",
            path: "/materials/0/extensions/VENDOR_custom_shader",
            properties: ["processor"],
            status: "unsupported",
          },
        ],
        extras: { gameplayMaterial: "visor" },
        material: "material:HeroVisor",
        name: "HeroVisor",
        textureTransforms: [
          {
            extension: "KHR_texture_transform",
            offset: [0.25, 0.5],
            path: "/materials/0/KHR_materials_clearcoat.clearcoatTexture/extensions/KHR_texture_transform",
            rotation: 0.1,
            scale: [2, 2],
            texCoord: 1,
            textureSlot: "KHR_materials_clearcoat.clearcoatTexture",
          },
        ],
      },
    ]);
    assert.deepEqual(metadata?.assets[0]?.morphTargets, [
      {
        defaultWeight: 0.2,
        mesh: "mesh:Face",
        path: "/meshes/0/extras/targetNames/0",
        source: "mesh.extras.targetNames",
        target: "Smile",
      },
    ]);
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

function materialGltf(): unknown {
  return {
    accessors: [{ componentType: 5126, normalized: false, type: "VEC3" }],
    asset: { version: "2.0" },
    materials: [
      {
        extensions: {
          KHR_materials_clearcoat: {
            clearcoatFactor: 0.7,
            clearcoatTexture: {
              index: 0,
              extensions: {
                KHR_texture_transform: {
                  offset: [0.25, 0.5],
                  rotation: 0.1,
                  scale: [2, 2],
                  texCoord: 1,
                },
              },
            },
          },
          VENDOR_custom_shader: {
            processor: "executable",
          },
        },
        extras: { gameplayMaterial: "visor" },
        name: "HeroVisor",
      },
    ],
    meshes: [
      {
        extras: { targetNames: ["Smile"] },
        name: "Face",
        primitives: [
          {
            attributes: { POSITION: 0 },
            material: 0,
            targets: [{ POSITION: 0 }],
          },
        ],
        weights: [0.2],
      },
    ],
    nodes: [{ mesh: 0, name: "Hero" }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
}
