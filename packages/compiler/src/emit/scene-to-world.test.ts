import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AnnulusGeometry,
  ConicalFrustumGeometry,
  ContactShadows,
  CustomMeshGeometry,
  DirectionalLight,
  ExtrudedRectangleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshBuilder,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RegularPolygonGeometry,
  Scene,
  TorusGeometry,
  animationClip,
  boxCollider,
  modelAsset,
  physics,
} from "@threenative/sdk";

import { emitBundle } from "./bundle.js";
import { sceneToWorld } from "./scene-to-world.js";

test("should emit model-backed mesh renderer when mesh declares a model asset ref", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      assetRefs: [modelAsset("model.hero", "assets/hero.glb", { animations: [animationClip("run")] })],
      geometry: new CustomMeshGeometry({
        attributes: [{ itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] }],
        indices: [0, 1, 2],
      }),
      id: "hero",
      material: new MeshStandardMaterial({ color: "#ffffff" }),
    }),
  );

  const result = sceneToWorld(scene);
  const entity = result.world.entities.find((item) => item.id === "hero");

  assert.deepEqual(entity?.components.MeshRenderer, {
    material: "mat.hero",
    mesh: "model.hero",
  });
  assert.equal(result.assets.find((asset) => asset.id === "mesh.hero"), undefined);
  assert.equal(result.assets.find((asset) => asset.id === "model.hero")?.kind, "model");
});

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

test("should emit group as scene container without renderer camera or light", () => {
  const scene = new Scene({ id: "scene" });
  const room = new Group({ id: "room.entry", name: "Entry Room" });
  const spawn = new Object3D({ id: "spawn.enemy" });
  room.position.set(1, 2, 3);
  room.add(spawn);
  scene.add(room);

  const result = sceneToWorld(scene);
  const groupEntity = result.world.entities.find((entity) => entity.id === "room.entry");
  const childEntity = result.world.entities.find((entity) => entity.id === "spawn.enemy");

  assert.deepEqual(groupEntity?.components.SceneContainer, { kind: "group", name: "Entry Room" });
  assert.deepEqual(groupEntity?.components.Transform, {
    position: [1, 2, 3],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
  assert.equal(groupEntity?.components.MeshRenderer, undefined);
  assert.equal(groupEntity?.components.Camera, undefined);
  assert.equal(groupEntity?.components.Light, undefined);
  assert.deepEqual(childEntity?.components.Hierarchy, { parent: "room.entry" });
});

test("should emit deterministic size tuples for expanded primitive catalog", () => {
  const scene = new Scene({ id: "scene" });
  const material = new MeshStandardMaterial({ color: "#ffffff" });
  scene.add(new Mesh({ geometry: new ConicalFrustumGeometry({ radiusTop: 0.2, radiusBottom: 0.7, height: 1.5 }), id: "frustum", material }));
  scene.add(new Mesh({ geometry: new TorusGeometry({ innerRadius: 0.25, outerRadius: 0.75 }), id: "torus", material }));
  scene.add(new Mesh({ geometry: new AnnulusGeometry({ innerRadius: 0.3, outerRadius: 0.8 }), id: "annulus", material }));
  scene.add(new Mesh({ geometry: new RegularPolygonGeometry({ radius: 0.9, sides: 5 }), id: "polygon", material }));
  scene.add(new Mesh({ geometry: new ExtrudedRectangleGeometry({ depth: 0.4, size: [2, 3] }), id: "extruded", material }));
  scene.add(new Mesh({ geometry: new PlaneGeometry({ size: [4, 5] }), id: "plane", material }));

  const result = sceneToWorld(scene);

  assert.deepEqual(
    result.assets.map((asset) => [asset.id, asset.primitive, asset.size]),
    [
      ["mesh.annulus", "annulus", [0.3, 0.8]],
      ["mesh.extruded", "extrudedRectangle", [2, 3, 0.4]],
      ["mesh.frustum", "conicalFrustum", [0.2, 0.7, 1.5]],
      ["mesh.plane", "plane", [4, 5]],
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

test("should emit one generated asset per procedural LOD level with deterministic IDs and thresholds", () => {
  const build = () => {
    const scene = new Scene({ id: "scene" });
    scene.add(new Mesh({
      geometry: MeshBuilder.create("builder.lod").sphere({ radius: 2, rings: 12, segments: 20 }).build({ collider: "mesh", lodLevels: 2 }),
      id: "hero",
      material: new MeshStandardMaterial({ color: "#ffffff" }),
    }));
    return sceneToWorld(scene);
  };

  const first = build();
  const second = build();
  assert.deepEqual(first.assets.map((asset) => asset.id), ["mesh.hero", "mesh.hero.lod.1", "mesh.hero.lod.2"]);
  assert.deepEqual(first.world.entities[0]?.components.MeshRenderer, {
    lod: {
      levels: [
        { mesh: "mesh.hero.lod.1", minDistance: 40 },
        { mesh: "mesh.hero.lod.2", minDistance: 80 },
      ],
    },
    material: "mat.hero",
    mesh: "mesh.hero",
  });
  assert.deepEqual(second.assets, first.assets);
  assert.deepEqual(second.world, first.world);
  assert.equal(first.world.entities[0]?.components.Collider?.mesh?.source, "mesh.hero");
});

test("should derive deterministic LOD IDs and default thresholds", () => {
  const emit = () => {
    const scene = new Scene({ id: "scene" });
    scene.add(new Mesh({
      geometry: MeshBuilder.create("builder.default-policy").sphere({ radius: 1.5, rings: 12, segments: 20 }).build({
        lodLevels: [{}, {}],
      }),
      id: "default-policy",
      material: new MeshStandardMaterial({ color: "#ffffff" }),
    }));
    return sceneToWorld(scene);
  };
  const first = emit();
  const second = emit();
  assert.deepEqual(first.generatedLodAssetIds, ["mesh.default-policy.lod.1", "mesh.default-policy.lod.2"]);
  assert.deepEqual(first.world.entities[0]?.components.MeshRenderer?.lod, {
    levels: [
      { mesh: "mesh.default-policy.lod.1", minDistance: 30 },
      { mesh: "mesh.default-policy.lod.2", minDistance: 60 },
    ],
  });
  assert.deepEqual(second, first);
});

test("should reject procedural LOD asset ID collision", () => {
  const scene = new Scene({
    assetRefs: [modelAsset("mesh.hero.lod.1", "assets/conflict.glb")],
    id: "scene",
  });
  scene.add(new Mesh({
    geometry: MeshBuilder.create("builder.lod.collision").sphere({ rings: 12, segments: 20 }).build({ lodLevels: 1 }),
    id: "hero",
    material: new MeshStandardMaterial({ color: "#ffffff" }),
  }));

  assert.throws(
    () => sceneToWorld(scene),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "TN_COMPILER_GENERATED_MESH_LOD_ASSET_ID_COLLISION",
  );
});

test("should reject model assetRef combined with procedural LOD geometry", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(new Mesh({
    assetRefs: [modelAsset("model.hero", "assets/hero.glb")],
    geometry: MeshBuilder.create("builder.lod.asset-ref").sphere({ rings: 12, segments: 20 }).build({ lodLevels: 1 }),
    id: "hero",
    material: new MeshStandardMaterial({ color: "#ffffff" }),
  }));

  assert.throws(
    () => sceneToWorld(scene),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "TN_COMPILER_GENERATED_MESH_LOD_ASSET_REF_CONFLICT",
  );
});

test("should reject invalid generated procedural LOD data during compiler lowering", () => {
  const geometry = MeshBuilder.create("builder.lod.invalid").sphere({ rings: 12, segments: 20 }).build({ lodLevels: 1 });
  (geometry.lodLevels![0]!.indices as number[])[0] = 999_999;
  const scene = new Scene({ id: "scene" });
  scene.add(new Mesh({
    geometry,
    id: "invalid-lod",
    material: new MeshStandardMaterial({ color: "#ffffff" }),
  }));

  assert.throws(
    () => sceneToWorld(scene),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "TN_COMPILER_GENERATED_MESH_LOD_INVALID",
  );
});

test("should emit CSG arch mesh binaries deterministically and validate the bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-procedural-mesh-emit-"));
  try {
    const scene = new Scene({ id: "scene" });
    scene.add(
      new Mesh({
        geometry: MeshBuilder.create("prop.arch.csg")
          .box({ size: [2, 2, 0.5] })
          .subtract((operand) => {
            operand.rotate([Math.PI / 2, 0, 0]).position([0, -0.55, 0]).cylinder({ height: 1, radius: 0.58, segments: 24 });
          })
          .coherentNoise({ amplitude: 0.015, frequency: 2, octaves: 2, seed: 7 })
          .build({ budget: "hero-prop", collider: "mesh", helper: "arch", seed: 7 }),
        id: "arch",
        material: new MeshStandardMaterial({ color: "#8f775d" }),
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
    const firstAsset = firstManifest.assets.find((asset: { id: string }) => asset.id === "mesh.arch");
    const firstHashes = await hashPayloads(first, firstAsset);
    const second = await emitBundle({ ...config, outDir: "dist/second.bundle" }, scene);
    const secondManifest = JSON.parse(await readFile(join(second, "assets.manifest.json"), "utf8"));
    const secondAsset = secondManifest.assets.find((asset: { id: string }) => asset.id === "mesh.arch");
    const secondHashes = await hashPayloads(second, secondAsset);

    assert.deepEqual(firstAsset.binaryAttributes, secondAsset.binaryAttributes);
    assert.deepEqual(firstAsset.binaryIndices, secondAsset.binaryIndices);
    assert.deepEqual(firstHashes, secondHashes);
    assert.equal(firstAsset.topology, "triangle-list");
    assert.equal(firstAsset.usage, "static");
    const world = JSON.parse(await readFile(join(first, "world.ir.json"), "utf8"));
    assert.equal(world.entities.find((entity: { id: string }) => entity.id === "arch")?.components.Collider.mesh.source, "mesh.arch");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit mesh collider component when generated mesh has collider hint", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(new Mesh({
    geometry: MeshBuilder.create("builder.id.is.not.asset.id")
      .box({ size: [2, 1, 3] })
      .build({ collider: "mesh" }),
    id: "procedural-platform",
    material: new MeshStandardMaterial({ color: "#ffffff" }),
  }));

  const result = sceneToWorld(scene);
  const entity = result.world.entities.find((item) => item.id === "procedural-platform");

  assert.deepEqual(entity?.components.Collider, {
    kind: "mesh",
    mesh: {
      bounds: { center: [0, 0, 0], size: [2, 1, 3] },
      source: "mesh.procedural-platform",
      triangleCount: 12,
    },
  });
});

test("should emit box collider component when generated mesh has box hint", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(new Mesh({
    geometry: MeshBuilder.create("prop.offset-box")
      .position([1, 2, 3])
      .box({ size: [2, 4, 6] })
      .build({ collider: "box" }),
    id: "offset-box",
    material: new MeshStandardMaterial({ color: "#ffffff" }),
  }));

  const result = sceneToWorld(scene);
  const entity = result.world.entities.find((item) => item.id === "offset-box");

  assert.deepEqual(entity?.components.Collider, {
    center: [1, 2, 3],
    kind: "box",
    size: [2, 4, 6],
  });
});

test("should not override explicit collider when entity already defines one", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(new Mesh({
    geometry: MeshBuilder.create("prop.explicit-collider")
      .box({ size: [2, 1, 3] })
      .build({ collider: "mesh" }),
    id: "explicit-collider",
    material: new MeshStandardMaterial({ color: "#ffffff" }),
    physics: physics({ collider: boxCollider([5, 4, 3], { center: [1, 2, 3] }) }),
  }));

  const result = sceneToWorld(scene);
  const entity = result.world.entities.find((item) => item.id === "explicit-collider");

  assert.deepEqual(entity?.components.Collider, {
    center: [1, 2, 3],
    kind: "box",
    size: [5, 4, 3],
  });
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
        emissiveBloom: { intensity: 0.8, threshold: 1.2 },
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
  assert.deepEqual(result.materials[0]?.emissiveBloom, { enabled: true, intensity: 0.8, threshold: 1.2 });
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

test("should emit SDK ContactShadows as a portable component", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(new ContactShadows({
    height: 5,
    id: "arena.floor.shadows",
    opacity: 0.6,
    resolution: 512,
    size: [20, 20],
    softness: 1.5,
    updateMode: "static",
  }));

  const result = sceneToWorld(scene);
  assert.deepEqual(result.world.entities.find((entity) => entity.id === "arena.floor.shadows")?.components.ContactShadows, {
    height: 5,
    opacity: 0.6,
    resolution: 512,
    size: [20, 20],
    softness: 1.5,
    updateMode: "static",
  });
});

test("scene-to-world should emit camera helper metadata", () => {
  const scene = new Scene({ id: "scene" });
  const followTarget = new Object3D({ id: "player" });
  const camera = new PerspectiveCamera({
    far: 100,
    follow: { offset: [0, 2, -4], smoothing: 0.2, target: "player" },
    fovY: 60,
    id: "camera.main",
    near: 0.1,
    orbit: { distance: { max: 12, min: 4 }, smoothing: 0.15, target: "player" },
    order: 1,
    screenShake: { amplitude: 0.1, decay: 0.5, frequency: 12 },
    zoom: { max: 8, min: 2, smoothing: 0.1 },
  });
  scene.add(followTarget);
  scene.add(camera);
  scene.setActiveCamera(camera);

  const result = sceneToWorld(scene);
  const entity = result.world.entities.find((item) => item.id === "camera.main");

  assert.deepEqual(entity?.components.Camera, {
    far: 100,
    follow: { offset: [0, 2, -4], smoothing: 0.2, target: "player" },
    fovY: 60,
    kind: "perspective",
    near: 0.1,
    orbit: { maxDistance: 12, minDistance: 4, smoothing: 0.15, target: "player" },
    order: 1,
    screenShake: { amplitude: 0.1, decay: 0.5, frequency: 12 },
    zoom: { max: 8, min: 2, smoothing: 0.1 },
  });
});

test("scene-to-world should emit ActiveCameras and render layers for multi-view scenes", () => {
  const scene = new Scene({ id: "scene" });
  const left = new PerspectiveCamera({
    far: 100,
    fovY: 60,
    id: "camera.left",
    layers: ["main"],
    near: 0.1,
    order: 0,
    viewport: [0, 0, 0.5, 1],
  });
  const right = new PerspectiveCamera({
    far: 100,
    fovY: 60,
    id: "camera.right",
    layers: ["hud"],
    near: 0.1,
    order: 1,
    viewport: [0.5, 0, 0.5, 1],
  });
  const mesh = new Mesh({
    geometry: new CustomMeshGeometry({
      attributes: [{ itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] }],
      indices: [0, 1, 2],
    }),
    id: "mesh.main",
    layers: ["main"],
    material: new MeshStandardMaterial({ color: "#ffffff" }),
  });
  scene.add(left);
  scene.add(right);
  scene.add(mesh);
  scene.setActiveCameras([left, right]);

  const result = sceneToWorld(scene);

  assert.deepEqual(result.world.resources?.ActiveCameras, {
    cameras: [
      { entity: "camera.left", order: 0 },
      { entity: "camera.right", order: 1 },
    ],
  });
  assert.deepEqual(result.world.entities.find((entity) => entity.id === "mesh.main")?.components.RenderLayers, {
    layers: ["main"],
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
