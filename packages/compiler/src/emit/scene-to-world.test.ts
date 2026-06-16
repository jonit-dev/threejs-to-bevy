import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AnnulusGeometry,
  ConicalFrustumGeometry,
  CustomMeshGeometry,
  DirectionalLight,
  ExtrudedRectangleGeometry,
  Mesh,
  MeshStandardMaterial,
  MeshBuilder,
  Object3D,
  RegularPolygonGeometry,
  Scene,
  TorusGeometry,
} from "@threenative/sdk";

import { emitBundle } from "./bundle.js";
import { sceneToWorld } from "./scene-to-world.js";

test("should preserve parent child hierarchy", () => {
  const scene = new Scene({ id: "scene" });
  const parent = new Object3D({ id: "parent" });
  const child = new Object3D({ id: "child" });
  parent.add(child);
  scene.add(parent);

  const result = sceneToWorld(scene);
  const childEntity = result.world.entities.find((entity) => entity.id === "child");

  assert.deepEqual(childEntity?.components.Hierarchy, { parent: "parent" });
});

test("should emit deterministic size tuples for expanded primitive catalog", () => {
  const scene = new Scene({ id: "scene" });
  const material = new MeshStandardMaterial({ color: "#ffffff" });
  scene.add(new Mesh({ geometry: new ConicalFrustumGeometry({ radiusTop: 0.2, radiusBottom: 0.7, height: 1.5 }), id: "frustum", material }));
  scene.add(new Mesh({ geometry: new TorusGeometry({ innerRadius: 0.25, outerRadius: 0.75 }), id: "torus", material }));
  scene.add(new Mesh({ geometry: new AnnulusGeometry({ innerRadius: 0.3, outerRadius: 0.8 }), id: "annulus", material }));
  scene.add(new Mesh({ geometry: new RegularPolygonGeometry({ radius: 0.9, sides: 5 }), id: "polygon", material }));
  scene.add(new Mesh({ geometry: new ExtrudedRectangleGeometry({ depth: 0.4, size: [2, 3] }), id: "extruded", material }));

  const result = sceneToWorld(scene);

  assert.deepEqual(
    result.assets.map((asset) => [asset.id, asset.primitive, asset.size]),
    [
      ["mesh.annulus", "annulus", [0.3, 0.8]],
      ["mesh.extruded", "extrudedRectangle", [2, 3, 0.4]],
      ["mesh.frustum", "conicalFrustum", [0.2, 0.7, 1.5]],
      ["mesh.polygon", "regularPolygon", [0.9, 5]],
      ["mesh.torus", "torus", [0.25, 0.75]],
    ],
  );
});

test("should emit custom mesh attributes and indices", () => {
  const scene = new Scene({ id: "scene" });
  const material = new MeshStandardMaterial({ color: "#ffffff" });
  scene.add(
    new Mesh({
      geometry: new CustomMeshGeometry({
        attributes: [
          { itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
          { itemSize: 2, name: "uv1", values: [0, 0, 1, 0, 0, 1] },
          { itemSize: 4, name: "color", values: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] },
          { itemSize: 1, name: "custom:weight", values: [0, 0.5, 1] },
        ],
        indices: [0, 1, 2],
      }),
      id: "custom",
      material,
    }),
  );

  const result = sceneToWorld(scene);

  assert.deepEqual(result.assets[0], {
    attributes: [
      { itemSize: 4, name: "color", values: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] },
      { itemSize: 1, name: "custom:weight", values: [0, 0.5, 1] },
      { itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
      { itemSize: 2, name: "uv1", values: [0, 0, 1, 0, 0, 1] },
    ],
    id: "mesh.custom",
    indices: [0, 1, 2],
    kind: "mesh",
    format: "generated",
    primitive: "custom",
  });
});

test("should emit procedural mesh binaries deterministically", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-procedural-mesh-emit-"));
  try {
    const scene = new Scene({ id: "scene" });
    scene.add(
      new Mesh({
        geometry: MeshBuilder.create("prop.mushroom.red")
          .position([0, 0.35, 0])
          .cylinder({ height: 0.7, radius: 0.16, segments: 12 })
          .position([0, 0.8, 0])
          .scale([1.05, 0.42, 1.05])
          .sphere({ radius: 0.55, rings: 8, segments: 18 })
          .build({ helper: "mushroom", seed: 7 }),
        id: "mushroom",
        material: new MeshStandardMaterial({ color: "#d94b4b" }),
      }),
    );
    const config = {
      entry: "src/game.ts",
      outDir: "dist/first.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const first = await emitBundle(config, scene);
    const firstManifest = JSON.parse(await readFile(join(first, "assets.manifest.json"), "utf8"));
    const firstAsset = firstManifest.assets.find((asset: { id: string }) => asset.id === "mesh.mushroom");
    const firstHashes = await hashPayloads(first, firstAsset);
    const second = await emitBundle({ ...config, outDir: "dist/second.bundle" }, scene);
    const secondManifest = JSON.parse(await readFile(join(second, "assets.manifest.json"), "utf8"));
    const secondAsset = secondManifest.assets.find((asset: { id: string }) => asset.id === "mesh.mushroom");
    const secondHashes = await hashPayloads(second, secondAsset);

    assert.deepEqual(firstAsset.binaryAttributes, secondAsset.binaryAttributes);
    assert.deepEqual(firstAsset.binaryIndices, secondAsset.binaryIndices);
    assert.deepEqual(firstHashes, secondHashes);
    assert.equal(firstAsset.topology, "triangle-list");
    assert.equal(firstAsset.usage, "static");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit material alpha and physical metadata", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      geometry: new CustomMeshGeometry({
        attributes: [{ itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] }],
        indices: [0, 1, 2],
      }),
      id: "transparent",
      material: new MeshStandardMaterial({
        alphaCutoff: 0.4,
        alphaMode: "mask",
        clearcoat: 0.8,
        clearcoatRoughness: 0.25,
        clearcoatRoughnessTexture: "tex.clearcoatRoughness",
        clearcoatTexture: "tex.clearcoat",
        color: "#ffffff",
        emissive: "#33ccff",
        emissiveIntensity: 2.5,
        opacity: 0.65,
        specularIntensity: 0.7,
        transmission: 0.45,
        transmissionTexture: "tex.transmission",
      }),
    }),
  );

  const result = sceneToWorld(scene);

  assert.equal(result.materials[0]?.alphaMode, "mask");
  assert.equal(result.materials[0]?.alphaCutoff, 0.4);
  assert.equal(result.materials[0]?.emissive, "#33ccff");
  assert.equal(result.materials[0]?.emissiveIntensity, 2.5);
  assert.equal(result.materials[0]?.opacity, 0.65);
  assert.equal(result.materials[0]?.clearcoat, 0.8);
  assert.equal(result.materials[0]?.clearcoatRoughness, 0.25);
  assert.equal(result.materials[0]?.clearcoatRoughnessTexture, "tex.clearcoatRoughness");
  assert.equal(result.materials[0]?.clearcoatTexture, "tex.clearcoat");
  assert.equal(result.materials[0]?.specularIntensity, 0.7);
  assert.equal(result.materials[0]?.transmission, 0.45);
  assert.equal(result.materials[0]?.transmissionTexture, "tex.transmission");
});

test("should emit mesh shadow controls", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      castShadow: false,
      geometry: new CustomMeshGeometry({
        attributes: [{ itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] }],
        indices: [0, 1, 2],
      }),
      id: "decor",
      material: new MeshStandardMaterial({ color: "#ffffff" }),
      receiveShadow: true,
    }),
  );

  const result = sceneToWorld(scene);
  const entity = result.world.entities.find((item) => item.id === "decor");

  assert.deepEqual(entity?.components.MeshRenderer, {
    castShadow: false,
    material: "mat.decor",
    mesh: "mesh.decor",
    receiveShadow: true,
  });
});

test("should emit light shadow bias controls", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(new DirectionalLight({ id: "sun", shadowBias: -0.0005, shadowNormalBias: 0.02 }));

  const result = sceneToWorld(scene);
  const entity = result.world.entities.find((item) => item.id === "sun");

  assert.deepEqual(entity?.components.Light, {
    color: "#ffffff",
    intensity: 1,
    kind: "directional",
    shadowBias: -0.0005,
    shadowNormalBias: 0.02,
  });
});

async function hashPayloads(root: string, asset: {
  binaryAttributes: Array<{ name: string; path: string }>;
  binaryIndices?: { path: string };
}): Promise<Record<string, string>> {
  const binaryIndices = asset.binaryIndices;
  const entries = await Promise.all([
    ...asset.binaryAttributes.map(async (attribute) => [
      attribute.name,
      createHash("sha256").update(await readFile(join(root, attribute.path))).digest("hex"),
    ] as const),
    ...(binaryIndices === undefined
      ? []
      : [
          (async () => [
            "indices",
            createHash("sha256").update(await readFile(join(root, binaryIndices.path))).digest("hex"),
          ] as const)(),
        ]),
  ]);
  return Object.fromEntries(entries);
}
