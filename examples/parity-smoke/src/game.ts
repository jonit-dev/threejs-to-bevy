import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
} from "@threenative/sdk";

const scene = new Scene({ id: "parity-smoke.scene" });

const floorMaterial = new MeshStandardMaterial({ color: "#2a2f3a", roughness: 1 });
const playerMaterial = new MeshStandardMaterial({ color: "#2f80ed", roughness: 0.85 });
const markerMaterial = new MeshStandardMaterial({ color: "#ffb020", roughness: 0.7 });

const floor = new Mesh({
  geometry: new PlaneGeometry({ size: [6, 6] }),
  id: "floor",
  material: floorMaterial,
});
floor.position.set(0, -0.5, 0);
floor.rotation.set(-Math.PI / 2, 0, 0);
scene.add(floor);

const player = new Mesh({
  geometry: new BoxGeometry({ size: [1, 1.4, 1] }),
  id: "player",
  material: playerMaterial,
});
player.position.set(0, 0.2, 0);
scene.add(player);

const marker = new Mesh({
  geometry: new SphereGeometry({ radius: 0.35 }),
  id: "marker",
  material: markerMaterial,
});
marker.position.set(1.4, -0.05, -0.7);
scene.add(marker);

const probeColors = ["#e6194b", "#4363d8", "#ffffff"] as const;
for (const [index, color] of probeColors.entries()) {
  const probe = new Mesh({
    geometry: new BoxGeometry({ size: [0.45, 0.45, 0.45] }),
    id: `probe.${index}`,
    material: new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1,
      metalness: 0,
      roughness: 1,
    }),
  });
  probe.position.set(-2 + index * 0.9, 0.8, 1.2);
  scene.add(probe);
}

const track = new Mesh({
  geometry: new BoxGeometry({ size: [2.5, 0.08, 1.8] }),
  id: "track.strip",
  material: new MeshStandardMaterial({ color: "#273447", roughness: 0.92 }),
});
track.position.set(-1.6, -0.48, -0.4);
scene.add(track);

const camera = new PerspectiveCamera({ far: 100, fovY: 55, id: "camera.main", near: 0.1 });
camera.position.set(0, 1.4, 4.5);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#b8c4d6", id: "light.ambient", intensity: 0.58 }));
const keyLight = new DirectionalLight({ color: "#fff4c2", id: "light.key", intensity: 2.6 });
keyLight.position.set(3, 7, 5);
scene.add(keyLight);

export default scene;
