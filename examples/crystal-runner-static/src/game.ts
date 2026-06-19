import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from "@threenative/sdk";

const scene = new Scene({ id: "crystal-runner-static.scene" });
const laneX = [-2.2, 0, 2.2];

const track = new Mesh({
  geometry: new BoxGeometry({ size: [8, 0.2, 46] }),
  id: "track",
  material: new MeshStandardMaterial({ color: "#273447", roughness: 0.92 }),
});
track.position.set(0, -0.1, -10);
scene.add(track);

for (const [index, x] of laneX.entries()) {
  const stripe = new Mesh({
    geometry: new BoxGeometry({ size: [0.08, 0.03, 46] }),
    id: `lane.${index}`,
    material: new MeshStandardMaterial({ color: index === 1 ? "#9fb3c8" : "#4d6480", roughness: 0.6 }),
  });
  stripe.position.set(x, 0.03, -10);
  scene.add(stripe);
}

const player = new Mesh({
  geometry: new CapsuleGeometry({ height: 1.35, radius: 0.34 }),
  id: "player",
  material: new MeshStandardMaterial({ color: "#67e8f9", roughness: 0.42 }),
});
player.position.set(-2.2, 0.82, 2.5);
scene.add(player);

const obstacles = [
  { id: "obstacle.1", lane: 0, z: -8 },
  { id: "obstacle.2", lane: 2, z: -15 },
  { id: "obstacle.3", lane: 1, z: -23 },
] as const;

for (const obstacle of obstacles) {
  const mesh = new Mesh({
    geometry: new BoxGeometry({ size: [1.05, 1.05, 1.05] }),
    id: obstacle.id,
    material: new MeshStandardMaterial({ color: "#ef476f", roughness: 0.7 }),
  });
  mesh.position.set(laneX[obstacle.lane] ?? 0, 0.52, obstacle.z);
  scene.add(mesh);
}

const pickups = [
  { id: "pickup.1", lane: 2, z: -11 },
  { id: "pickup.2", lane: 0, z: -19 },
] as const;

for (const pickup of pickups) {
  const mesh = new Mesh({
    geometry: new BoxGeometry({ size: [0.62, 0.62, 0.62] }),
    id: pickup.id,
    material: new MeshStandardMaterial({ color: "#ffd166", roughness: 0.35 }),
  });
  mesh.position.set(laneX[pickup.lane] ?? 0, 0.55, pickup.z);
  scene.add(mesh);
}

const camera = new PerspectiveCamera({ far: 90, fovY: 58, id: "camera.main", near: 0.1 });
camera.position.set(0, 4.2, 8.4);
camera.rotation.set(-0.42, 0, 0);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#b8c4d6", id: "light.ambient", intensity: 0.58 }));
const keyLight = new DirectionalLight({ color: "#fff4c2", id: "light.key", intensity: 2.6 });
keyLight.position.set(3, 7, 5);
scene.add(keyLight);

export default scene;
