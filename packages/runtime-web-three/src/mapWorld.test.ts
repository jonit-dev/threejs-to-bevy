import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import * as THREE from "three";

import { loadBundle } from "./loadBundle.js";
import { mapWorld } from "./mapWorld.js";

test("mapWorld should map cube fixture to three scene", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle"));
  const mapped = mapWorld(bundle);

  const objects = [...mapped.objectsById.values()];
  assert.equal(objects.some((object) => object instanceof THREE.Mesh), true);
  assert.equal(objects.some((object) => object instanceof THREE.PerspectiveCamera), true);
  assert.equal(objects.some((object) => object instanceof THREE.DirectionalLight), true);
  assert.equal(mapped.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0);
});

test("mapWorld should map v2 render fixture", () => {
  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { id: "mesh.capsule", kind: "mesh", format: "generated", primitive: "capsule", size: [0.4, 1.2] },
        { id: "mesh.cylinder", kind: "mesh", format: "generated", primitive: "cylinder", size: [0.5, 1] },
      ],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "rendering",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.main", kind: "standard", color: "#ffffff" }],
    },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "camera.ui",
          components: { Camera: { kind: "orthographic", near: 0.1, far: 100, size: 4 } },
        },
        {
          id: "light.point",
          components: { Light: { kind: "point", color: "#ffffff", intensity: 2, range: 12 } },
        },
        {
          id: "light.spot",
          components: { Light: { kind: "spot", color: "#ffffff", intensity: 3, range: 16, angle: 0.65 } },
        },
        {
          id: "capsule.hidden",
          components: {
            MeshRenderer: { mesh: "mesh.capsule", material: "mat.main", visible: false },
            Transform: { position: [0, 0, 0] },
          },
        },
        {
          id: "cylinder.main",
          components: {
            MeshRenderer: { mesh: "mesh.cylinder", material: "mat.main" },
            Transform: { position: [1, 0, 0] },
          },
        },
      ],
      resources: { ActiveCamera: { entity: "camera.ui" } },
    },
  });

  assert.equal(mapped.camera instanceof THREE.OrthographicCamera, true);
  assert.equal(mapped.objectsById.get("light.point") instanceof THREE.PointLight, true);
  assert.equal(mapped.objectsById.get("light.spot") instanceof THREE.SpotLight, true);
  assert.equal((mapped.objectsById.get("light.point") as THREE.PointLight).distance, 12);
  assert.equal((mapped.objectsById.get("light.spot") as THREE.SpotLight).distance, 16);
  assert.equal((mapped.objectsById.get("light.spot") as THREE.SpotLight).angle, 0.65);
  assert.equal(mapped.objectsById.get("capsule.hidden")?.visible, false);
  assert.equal(mapped.objectsById.get("cylinder.main") instanceof THREE.Mesh, true);
});

test("mapWorld should map expanded generated primitive catalog", () => {
  const assets = [
    { id: "mesh.cone", kind: "mesh" as const, format: "generated" as const, primitive: "cone" as const, size: [0.5, 1] },
    {
      id: "mesh.frustum",
      kind: "mesh" as const,
      format: "generated" as const,
      primitive: "conicalFrustum" as const,
      size: [0.25, 0.5, 1],
    },
    { id: "mesh.torus", kind: "mesh" as const, format: "generated" as const, primitive: "torus" as const, size: [0.25, 0.75] },
    { id: "mesh.circle", kind: "mesh" as const, format: "generated" as const, primitive: "circle" as const, size: [0.5] },
    { id: "mesh.annulus", kind: "mesh" as const, format: "generated" as const, primitive: "annulus" as const, size: [0.25, 0.75] },
    {
      id: "mesh.polygon",
      kind: "mesh" as const,
      format: "generated" as const,
      primitive: "regularPolygon" as const,
      size: [0.5, 6],
    },
    {
      id: "mesh.extruded",
      kind: "mesh" as const,
      format: "generated" as const,
      primitive: "extrudedRectangle" as const,
      size: [1, 2, 0.5],
    },
  ];
  const mapped = mapWorld({
    assets: { schema: "threenative.assets", version: "0.1.0", assets },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "primitive-catalog",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: { schema: "threenative.materials", version: "0.1.0", materials: [{ id: "mat.main", kind: "standard", color: "#ffffff" }] },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: assets.map((asset) => ({
        id: asset.id.replace("mesh.", "entity."),
        components: { MeshRenderer: { mesh: asset.id, material: "mat.main" }, Transform: { position: [0, 0, 0] } },
      })),
    },
  });

  const geometryTypes = assets.map((asset) => {
    const object = mapped.objectsById.get(asset.id.replace("mesh.", "entity."));
    assert.ok(object instanceof THREE.Mesh);
    return object.geometry.type;
  });
  assert.deepEqual(geometryTypes, [
    "ConeGeometry",
    "CylinderGeometry",
    "TorusGeometry",
    "CircleGeometry",
    "RingGeometry",
    "CircleGeometry",
    "ExtrudeGeometry",
  ]);
  assert.equal(mapped.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0);
});

test("mapWorld should map custom generated mesh attributes", () => {
  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        {
          id: "mesh.custom",
          kind: "mesh",
          format: "generated",
          primitive: "custom",
          attributes: [
            { itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
            { itemSize: 4, name: "color", values: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] },
            { itemSize: 1, name: "custom:weight", values: [0, 0.5, 1] },
          ],
          indices: [0, 1, 2],
        },
      ],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "custom-mesh",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: { schema: "threenative.materials", version: "0.1.0", materials: [{ id: "mat.main", kind: "standard", color: "#ffffff" }] },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "entity.custom",
          components: { MeshRenderer: { mesh: "mesh.custom", material: "mat.main" }, Transform: { position: [0, 0, 0] } },
        },
      ],
    },
  });

  const object = mapped.objectsById.get("entity.custom");
  assert.ok(object instanceof THREE.Mesh);
  assert.equal(object.geometry.getAttribute("position").itemSize, 3);
  assert.equal(object.geometry.getAttribute("color").itemSize, 4);
  assert.equal(object.geometry.getAttribute("weight").itemSize, 1);
  assert.deepEqual(Array.from(object.geometry.index?.array ?? []), [0, 1, 2]);
});

test("mapWorld should apply supported material texture slots", () => {
  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { id: "mesh.cube", kind: "mesh", format: "generated", primitive: "box", size: [1, 1, 1] },
        { id: "tex.albedo", kind: "texture", format: "png", path: "assets/albedo.png" },
        { id: "tex.normal", kind: "texture", format: "png", path: "assets/normal.png" },
        { id: "tex.mr", kind: "texture", format: "png", path: "assets/metallic-roughness.png" },
        { id: "tex.emissive", kind: "texture", format: "png", path: "assets/emissive.png" },
        { id: "tex.occlusion", kind: "texture", format: "png", path: "assets/occlusion.png" },
      ],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "textured",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        {
          id: "mat.textured",
          kind: "standard",
          color: "#ffffff",
          baseColorTexture: "tex.albedo",
          emissiveTexture: "tex.emissive",
          metallicRoughnessTexture: "tex.mr",
          normalTexture: "tex.normal",
          occlusionTexture: "tex.occlusion",
        },
      ],
    },
    source: "http://example.test/bundle",
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "cube.textured",
          components: { MeshRenderer: { mesh: "mesh.cube", material: "mat.textured" } },
        },
      ],
    },
  });

  const cube = mapped.objectsById.get("cube.textured");
  assert.ok(cube instanceof THREE.Mesh);
  assert.ok(cube.material instanceof THREE.MeshStandardMaterial);
  assert.equal(cube.material.map?.userData.threenativeAssetId, "tex.albedo");
  assert.equal(cube.material.normalMap?.userData.threenativeAssetId, "tex.normal");
  assert.equal(cube.material.metalnessMap?.userData.threenativeAssetId, "tex.mr");
  assert.equal(cube.material.roughnessMap?.userData.threenativeAssetId, "tex.mr");
  assert.equal(cube.material.emissiveMap?.userData.threenativeAssetId, "tex.emissive");
  assert.equal(cube.material.aoMap?.userData.threenativeAssetId, "tex.occlusion");
  assert.equal(cube.material.map?.userData.threenativeUrl, "http://example.test/bundle/assets/albedo.png");
  assert.equal(mapped.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length, 0);
});

test("mapWorld should reject material texture slots that do not reference texture assets", () => {
  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { id: "mesh.cube", kind: "mesh", format: "generated", primitive: "box", size: [1, 1, 1] },
        { id: "model.not-texture", kind: "model", format: "gltf", path: "assets/model.gltf" },
      ],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "invalid-texture",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        { id: "mat.invalid", kind: "standard", color: "#ffffff", baseColorTexture: "model.not-texture" },
      ],
    },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        {
          id: "cube.invalid",
          components: { MeshRenderer: { mesh: "mesh.cube", material: "mat.invalid" } },
        },
      ],
    },
  });

  const cube = mapped.objectsById.get("cube.invalid");
  assert.ok(cube instanceof THREE.Mesh);
  assert.ok(cube.material instanceof THREE.MeshStandardMaterial);
  assert.equal(cube.material.map, null);
  assert.equal(mapped.diagnostics[0]?.code, "TN-WEB-MATERIAL-TEXTURE-REFERENCE-INVALID");
  assert.equal(mapped.diagnostics[0]?.path, "materials.ir.json/materials/mat.invalid/baseColorTexture");
});
