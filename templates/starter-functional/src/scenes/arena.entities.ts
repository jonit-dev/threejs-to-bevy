import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  boxCollider,
  capsuleCollider,
  physics,
  rigidBody,
} from "@threenative/sdk";
import { heroModel } from "../assets/catalog.js";

export const arenaVisualScene = new Scene({ id: "v7.functional.scene" });

const floor = new Mesh({
  geometry: new BoxGeometry({ size: [9, 0.2, 9] }),
  id: "arena.floor",
  material: new MeshStandardMaterial({ color: "#243b53", roughness: 0.9 }),
  physics: physics({ collider: boxCollider([9, 0.2, 9]) }),
});
floor.position.set(0, -0.1, 0);
arenaVisualScene.add(floor);

const player = new Mesh({
  assetRefs: [heroModel.asset],
  geometry: new CapsuleGeometry({ height: 1.45, radius: 0.35 }),
  id: "player",
  material: new MeshStandardMaterial({ color: "#f4d35e", roughness: 0.55 }),
  physics: physics({ body: rigidBody("kinematic", { velocity: [0, 0, 0] }), collider: capsuleCollider(0.35, 1.45) }),
});
player.position.set(0, 0.9, 0);
arenaVisualScene.add(player);

const pickup = new Mesh({
  geometry: new BoxGeometry({ size: [0.55, 0.55, 0.55] }),
  id: "pickup.v7",
  material: new MeshStandardMaterial({ color: "#34a853", roughness: 0.45 }),
  physics: physics({ collider: boxCollider([0.55, 0.55, 0.55], { trigger: true }) }),
});
pickup.position.set(2.2, 0.28, -1.4);
arenaVisualScene.add(pickup);

const camera = new PerspectiveCamera({ far: 100, fovY: 58, id: "camera.main", near: 0.1 });
camera.position.set(0, 3, 6);
arenaVisualScene.add(camera);
arenaVisualScene.setActiveCamera(camera);

arenaVisualScene.add(new AmbientLight({ color: "#9fb3c8", id: "light.ambient", intensity: 0.4 }));
const keyLight = new DirectionalLight({ color: "#fff1bf", id: "light.key", intensity: 2.2 });
keyLight.position.set(3, 5, 4);
arenaVisualScene.add(keyLight);
