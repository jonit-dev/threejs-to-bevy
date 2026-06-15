import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import * as THREE from "three";

import { loadBundle } from "./loadBundle.js";
import type { IWebBundle } from "./loadBundle.js";
import { advanceAnimationPlayback, hasAnimationPlayback, loadWorldModelAssets, mapWorld } from "./mapWorld.js";

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
            { itemSize: 2, name: "uv1", values: [0, 0, 1, 0, 0, 1] },
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
  assert.equal(object.geometry.getAttribute("uv1").itemSize, 2);
  assert.equal(object.geometry.getAttribute("color").itemSize, 4);
  assert.equal(object.geometry.getAttribute("weight").itemSize, 1);
  assert.ok(object.material instanceof THREE.MeshStandardMaterial);
  assert.equal(object.material.vertexColors, true);
  assert.deepEqual(Array.from(object.geometry.index?.array ?? []), [0, 1, 2]);
});

test("mapWorld should attach animation playback state to model renderers", () => {
  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        {
          id: "model.hero",
          kind: "model",
          format: "glb",
          path: "assets/hero.glb",
          animations: [
            { id: "idle", loop: true, speed: 1 },
            { id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.25 },
          ],
          animationGraph: {
            initialState: "idle",
            parameters: [{ id: "moving", kind: "boolean", default: false }],
            states: [
              { id: "idle", clip: "idle" },
              { id: "run", clip: "run" },
            ],
          },
        },
      ],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "animated-model",
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
          id: "hero",
          components: { MeshRenderer: { mesh: "model.hero", material: "mat.main" }, Transform: { position: [0, 0, 0] } },
        },
      ],
    },
  });

  assert.deepEqual(mapped.objectsById.get("hero")?.userData.threeNativeAnimation, {
    activeState: "idle",
    asset: "model.hero",
    clip: "idle",
    loop: true,
    sourceClip: "idle",
    speed: 1,
    timeSeconds: 0,
  });

  advanceAnimationPlayback(mapped, 0.5);
  assert.equal(mapped.objectsById.get("hero")?.userData.threeNativeAnimation.timeSeconds, 0.5);
});

test("loadWorldModelAssets should attach loaded glTF scenes and bind animation mixers", async () => {
  const bundle: IWebBundle = {
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        {
          id: "model.hero",
          kind: "model",
          format: "glb",
          path: "assets/hero.glb",
          animations: [{ id: "run", loop: false, sourceClip: "Armature|Run", speed: 2 }],
        },
      ],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "animated-model",
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
          id: "hero",
          components: { MeshRenderer: { mesh: "model.hero", material: "mat.main" }, Transform: { position: [0, 0, 0] } },
        },
      ],
    },
  };
  const mapped = mapWorld(bundle);
  const loadedModel = new THREE.Group();
  loadedModel.add(new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  const clip = new THREE.AnimationClip("Armature|Run", 1, [
    new THREE.NumberKeyframeTrack(".position[x]", [0, 1], [0, 2]),
  ]);
  let requestedUrl = "";

  await loadWorldModelAssets(mapped, bundle, "/game.bundle/", {
    loader: {
      async loadAsync(url: string) {
        requestedUrl = url;
        return { animations: [clip], scene: loadedModel };
      },
    },
  });

  const object = mapped.objectsById.get("hero");
  assert.ok(object instanceof THREE.Mesh);
  assert.equal(requestedUrl, "/game.bundle/assets/hero.glb");
  assert.equal(object.children[0], loadedModel);
  assert.equal(object.geometry.getAttribute("position"), undefined);
  assert.equal(object.userData.threeNativeAnimationClip, "Armature|Run");
  assert.equal(object.userData.threeNativeAnimationMixer instanceof THREE.AnimationMixer, true);
  assert.equal(hasAnimationPlayback(mapped), true);

  advanceAnimationPlayback(mapped, 0.25);
  assert.equal(object.userData.threeNativeAnimation.timeSeconds, 0.5);
  assert.equal(loadedModel.position.x, 1);
});

test("mapWorld should apply supported material texture slots", () => {
  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { id: "mesh.cube", kind: "mesh", format: "generated", primitive: "box", size: [1, 1, 1] },
        {
          id: "tex.albedo",
          kind: "texture",
          format: "png",
          path: "assets/albedo.png",
          center: [0.5, 0.5],
          magFilter: "nearest",
          minFilter: "nearestMipmapLinear",
          offset: [0.25, 0.5],
          repeat: [4, 2],
          rotation: 0.5,
          wrapS: "repeat",
          wrapT: "mirroredRepeat",
        },
        { id: "tex.normal", kind: "texture", format: "png", path: "assets/normal.png" },
        { id: "tex.mr", kind: "texture", format: "png", path: "assets/metallic-roughness.png" },
        { id: "tex.emissive", kind: "texture", format: "png", path: "assets/emissive.png" },
        { id: "tex.occlusion", kind: "texture", format: "png", path: "assets/occlusion.png" },
        { id: "tex.clearcoat", kind: "texture", format: "png", path: "assets/clearcoat.png" },
        { id: "tex.clearcoatRoughness", kind: "texture", format: "png", path: "assets/clearcoat-roughness.png" },
        { id: "tex.transmission", kind: "texture", format: "png", path: "assets/transmission.png" },
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
          clearcoatTexture: "tex.clearcoat",
          clearcoatRoughnessTexture: "tex.clearcoatRoughness",
          transmissionTexture: "tex.transmission",
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
  assert.ok(cube.material instanceof THREE.MeshPhysicalMaterial);
  assert.equal(cube.material.map?.userData.threenativeAssetId, "tex.albedo");
  assert.equal(cube.material.normalMap?.userData.threenativeAssetId, "tex.normal");
  assert.equal(cube.material.metalnessMap?.userData.threenativeAssetId, "tex.mr");
  assert.equal(cube.material.roughnessMap?.userData.threenativeAssetId, "tex.mr");
  assert.equal(cube.material.emissiveMap?.userData.threenativeAssetId, "tex.emissive");
  assert.equal(cube.material.aoMap?.userData.threenativeAssetId, "tex.occlusion");
  assert.equal(cube.material.clearcoatMap?.userData.threenativeAssetId, "tex.clearcoat");
  assert.equal(cube.material.clearcoatRoughnessMap?.userData.threenativeAssetId, "tex.clearcoatRoughness");
  assert.equal(cube.material.transmissionMap?.userData.threenativeAssetId, "tex.transmission");
  assert.equal(cube.material.map?.userData.threenativeUrl, "http://example.test/bundle/assets/albedo.png");
  assert.equal(cube.material.map?.wrapS, THREE.RepeatWrapping);
  assert.equal(cube.material.map?.wrapT, THREE.MirroredRepeatWrapping);
  assert.equal(cube.material.map?.minFilter, THREE.NearestMipmapLinearFilter);
  assert.equal(cube.material.map?.magFilter, THREE.NearestFilter);
  assert.deepEqual(cube.material.map?.repeat.toArray(), [4, 2]);
  assert.deepEqual(cube.material.map?.offset.toArray(), [0.25, 0.5]);
  assert.deepEqual(cube.material.map?.center.toArray(), [0.5, 0.5]);
  assert.equal(cube.material.map?.rotation, 0.5);
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

test("mapWorld should apply material alpha mode and opacity", () => {
  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "mesh.cube", kind: "mesh", format: "generated", primitive: "box", size: [1, 1, 1] }],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "alpha-material",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        { id: "mat.glass", kind: "standard", alphaMode: "blend", color: "#ffffff", emissive: "#33ccff", emissiveIntensity: 2.5, opacity: 0.45 },
        { id: "mat.leaves", kind: "standard", alphaCutoff: 0.35, alphaMode: "mask", color: "#ffffff" },
      ],
    },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [
        { id: "glass", components: { MeshRenderer: { mesh: "mesh.cube", material: "mat.glass" } } },
        { id: "leaves", components: { MeshRenderer: { mesh: "mesh.cube", material: "mat.leaves" } } },
      ],
    },
  });

  const glass = mapped.objectsById.get("glass");
  const leaves = mapped.objectsById.get("leaves");
  assert.ok(glass instanceof THREE.Mesh);
  assert.ok(glass.material instanceof THREE.MeshStandardMaterial);
  assert.equal(glass.material.transparent, true);
  assert.equal(glass.material.opacity, 0.45);
  assert.equal(glass.material.emissive.getHexString(), "33ccff");
  assert.equal(glass.material.emissiveIntensity, 2.5);
  assert.equal(glass.material.userData.threeNativeAlphaMode, "blend");
  assert.ok(leaves instanceof THREE.Mesh);
  assert.ok(leaves.material instanceof THREE.MeshStandardMaterial);
  assert.equal(leaves.material.alphaTest, 0.35);
  assert.equal(leaves.material.userData.threeNativeAlphaMode, "mask");
});

test("mapWorld should apply physical material factors", () => {
  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "mesh.cube", kind: "mesh", format: "generated", primitive: "box", size: [1, 1, 1] }],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "physical-material",
      requiredCapabilities: {},
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    },
    materials: {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [
        { id: "mat.coat", kind: "standard", clearcoat: 0.8, clearcoatRoughness: 0.25, color: "#ffffff", specularIntensity: 0.7, transmission: 0.45 },
      ],
    },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world: {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [{ id: "coated", components: { MeshRenderer: { mesh: "mesh.cube", material: "mat.coat" } } }],
    },
  });

  const coated = mapped.objectsById.get("coated");
  assert.ok(coated instanceof THREE.Mesh);
  assert.ok(coated.material instanceof THREE.MeshPhysicalMaterial);
  assert.equal(coated.material.clearcoat, 0.8);
  assert.equal(coated.material.clearcoatRoughness, 0.25);
  assert.equal(coated.material.specularIntensity, 0.7);
  assert.equal(coated.material.transmission, 0.45);
});

test("mapWorld should apply mesh renderer shadow controls", () => {
  const mapped = mapWorld({
    assets: {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "mesh.cube", kind: "mesh", format: "generated", primitive: "box", size: [1, 1, 1] }],
    },
    manifest: {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "shadow-flags",
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
          id: "decor",
          components: { MeshRenderer: { castShadow: true, mesh: "mesh.cube", material: "mat.main", receiveShadow: false } },
        },
      ],
    },
  });

  const decor = mapped.objectsById.get("decor");
  assert.ok(decor instanceof THREE.Mesh);
  assert.equal(decor.castShadow, true);
  assert.equal(decor.receiveShadow, false);
});
