import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  embeddedAsset,
  gltfNodeHandle,
  gltfSceneHandles,
  lookupGltfNodeExtras,
  modelAsset,
  setGltfNodeVisibility,
  textureAsset,
} from "@threenative/sdk";

const propModel = modelAsset("model.prop", "assets/prop.glb");
const heroModel = modelAsset("model.hero", "assets/hero.glb");
const biomeData = embeddedAsset("metadata.biome", {
  data: JSON.stringify({ biome: "forest", seed: 7 }),
  hash: "sha256-v9sample",
  mediaType: "application/json",
});
const albedo = textureAsset("texture.albedo", "assets/albedo.png");

const scene = new Scene({
  assetRefs: [propModel, heroModel, biomeData, albedo],
  id: "v9.assets.gltf.scene",
});

const floor = new Mesh({
  geometry: new BoxGeometry({ size: [6, 0.1, 6] }),
  id: "arena.floor",
  material: new MeshStandardMaterial({ color: "#334155", roughness: 0.95 }),
});
floor.position.set(0, -0.05, 0);
scene.add(floor);

const prop = new Mesh({
  assetRefs: [propModel],
  geometry: new BoxGeometry({ size: [0.1, 0.1, 0.1] }),
  id: "prop.main",
  material: new MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 }),
});
prop.position.set(-1.2, 0, -0.5);
prop.scale.set(0.5, 0.5, 0.5);
scene.add(prop);

const hero = new Mesh({
  assetRefs: [heroModel],
  geometry: new BoxGeometry({ size: [0.1, 0.1, 0.1] }),
  id: "hero.main",
  material: new MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 }),
});
hero.position.set(0.8, 0, 0.4);
hero.scale.set(0.02, 0.02, 0.02);
scene.add(hero);

const camera = new PerspectiveCamera({ far: 40, fovY: 45, id: "camera.main", near: 0.1 });
camera.position.set(0, 1.4, 3.2);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#dbeafe", id: "light.ambient", intensity: 0.6 }));
const key = new DirectionalLight({ color: "#fff7ed", id: "light.key", intensity: 2 });
key.position.set(2, 4, 3);
scene.add(key);

const propHandle = gltfNodeHandle("handle.prop", { assetId: "model.prop", instanceId: "prop.main", nodePath: "root" });
const heroHandle = gltfNodeHandle("handle.hero", { assetId: "model.hero", instanceId: "hero.main", nodeName: "Fox" });

export default {
  gltfScene: gltfSceneHandles({
    handles: [propHandle, heroHandle],
    operations: [setGltfNodeVisibility(propHandle, true), lookupGltfNodeExtras(heroHandle)],
  }),
  scene,
};
