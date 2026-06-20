import { AmbientLight, BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene } from "@threenative/sdk";

export const arenaVisualScene = new Scene({ id: "scene.v5-game-starter" });

const floorMaterial = new MeshStandardMaterial({ color: "#34373d", roughness: 0.85 });
const playerMaterial = new MeshStandardMaterial({ color: "#2f80ed", roughness: 0.55 });
const goalMaterial = new MeshStandardMaterial({ color: "#f2c94c", roughness: 0.5 });

const floor = new Mesh({
  geometry: new PlaneGeometry({ size: [6, 5] }),
  id: "arena.floor",
  material: floorMaterial,
});
floor.position.set(0, -0.05, 0);
floor.rotation.set(-Math.PI / 2, 0, 0);
arenaVisualScene.add(floor);

const player = new Mesh({
  geometry: new BoxGeometry({ size: [0.55, 0.55, 0.55] }),
  id: "player",
  material: playerMaterial,
});
player.position.set(0, 0.35, 0);
player.scale.set(0.55, 0.55, 0.55);
arenaVisualScene.add(player);

const goal = new Mesh({
  geometry: new BoxGeometry({ size: [0.45, 0.45, 0.45] }),
  id: "goal",
  material: goalMaterial,
});
goal.position.set(1.8, 0.3, -1.6);
goal.scale.set(0.45, 0.45, 0.45);
arenaVisualScene.add(goal);

const camera = new PerspectiveCamera({ far: 80, fovY: 52, id: "camera.main", near: 0.1 });
camera.position.set(0, 3.2, 5.8);
camera.rotation.set(-0.48, 0, 0);
arenaVisualScene.add(camera);
arenaVisualScene.setActiveCamera(camera);

const keyLight = new DirectionalLight({ color: "#ffffff", id: "light.key", intensity: 2.3 });
keyLight.position.set(3, 5, 4);
arenaVisualScene.add(keyLight);
arenaVisualScene.add(new AmbientLight({ color: "#dce8ff", id: "light.ambient", intensity: 0.55 }));
