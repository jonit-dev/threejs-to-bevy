import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  animationClip,
  modelAsset,
} from "@threenative/sdk";

const heroModel = modelAsset("model.hero", "assets/hero.glb", {
  animations: [
    animationClip("idle", { loop: true, sourceClip: "Armature|Idle", speed: 1 }),
    animationClip("walk", { loop: true, sourceClip: "Armature|Walk", speed: 1 }),
    animationClip("run", { loop: true, sourceClip: "Armature|Run", speed: 1 }),
  ],
});

const scene = new Scene({ id: "v9.skeletal.animation.scene" });

const floor = new Mesh({
  geometry: new BoxGeometry({ size: [6, 0.1, 6] }),
  id: "arena.floor",
  material: new MeshStandardMaterial({ color: "#2f4f4f", roughness: 0.95 }),
});
floor.position.set(0, -0.05, 0);
scene.add(floor);

const hero = new Mesh({
  assetRefs: [heroModel],
  geometry: new BoxGeometry({ size: [0.1, 0.1, 0.1] }),
  id: "hero",
  material: new MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 }),
});
hero.position.set(0, 0, 0);
hero.scale.set(0.02, 0.02, 0.02);
scene.add(hero);

const camera = new PerspectiveCamera({ far: 50, fovY: 42, id: "camera.main", near: 0.1 });
camera.position.set(0, 0.35, 1.2);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#d9e8ff", id: "light.ambient", intensity: 0.6 }));
const key = new DirectionalLight({ color: "#fff4e8", id: "light.key", intensity: 2.4 });
key.position.set(2.5, 4.5, 3);
scene.add(key);

export default scene;
