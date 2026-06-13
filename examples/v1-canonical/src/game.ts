import {
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
} from "@threenative/sdk";

const scene = new Scene({ id: "scene.v1-canonical" });

const playerMaterial = new MeshStandardMaterial({ color: "#2f80ed", roughness: 0.85 });
const floorMaterial = new MeshStandardMaterial({ color: "#2a2f3a", roughness: 1 });
const markerMaterial = new MeshStandardMaterial({ color: "#ffb020", roughness: 0.7 });

const player = new Mesh({
  id: "player.box",
  geometry: new BoxGeometry({ size: [1, 1.4, 1] }),
  material: playerMaterial,
});
player.position.set(0, 0.2, 0);
scene.add(player);

const floor = new Mesh({
  id: "world.floor",
  geometry: new PlaneGeometry({ size: [6, 6] }),
  material: floorMaterial,
});
floor.position.set(0, -0.5, 0);
floor.rotation.set(-Math.PI / 2, 0, 0);
scene.add(floor);

const marker = new Mesh({
  id: "marker.sphere",
  geometry: new SphereGeometry({ radius: 0.35 }),
  material: markerMaterial,
});
marker.position.set(1.4, -0.05, -0.7);
scene.add(marker);

const camera = new PerspectiveCamera({
  id: "camera.main",
  fovY: 55,
  near: 0.1,
  far: 100,
});
camera.position.set(0, 1.4, 4.5);
scene.add(camera);
scene.setActiveCamera(camera);

const light = new DirectionalLight({
  id: "light.key",
  color: "#ffffff",
  intensity: 2,
});
light.position.set(3, 4, 2);
scene.add(light);

export default scene;
