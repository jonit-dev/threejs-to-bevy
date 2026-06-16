import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  SphereGeometry,
} from "@threenative/sdk";

const scene = new Scene({ id: "v8.lighting.tone.scene" });

const probes = [
  { color: "#808080", id: "sphere.gray", x: -1.6 },
  { color: "#e07030", id: "sphere.orange", x: 0 },
  { color: "#3070e0", id: "sphere.blue", x: 1.6 },
] as const;

for (const probe of probes) {
  const sphere = new Mesh({
    geometry: new SphereGeometry({ radius: 0.75 }),
    id: probe.id,
    material: new MeshStandardMaterial({ color: probe.color, metalness: 0, roughness: 1 }),
  });
  sphere.position.set(probe.x, 0, 0);
  scene.add(sphere);
}

const camera = new OrthographicCamera({ far: 20, id: "camera.lighting", near: 0.1, size: 5.2 });
camera.position.set(0, 0.15, 6);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#ffffff", id: "light.ambient", intensity: 0.55 }));
const key = new DirectionalLight({ color: "#fff4e8", id: "light.key", intensity: 1.2 });
key.position.set(2.5, 4.5, 3.5);
scene.add(key);

export default scene;
