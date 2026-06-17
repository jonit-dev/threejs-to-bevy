import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  SpotLight,
} from "@threenative/sdk";

const scene = new Scene({ id: "v10.visual.calibration.lighting.scene" });

function calibrationMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, metalness: 0, roughness: 1 });
}

function card(id: string, color: string, x: number, y: number): Mesh {
  const mesh = new Mesh({
    geometry: new PlaneGeometry({ size: [1.15, 0.9] }),
    id,
    material: calibrationMaterial(color),
    receiveShadow: true,
  });
  mesh.position.set(x, y, 0);
  return mesh;
}

scene.add(card("ambient.card", "#6b7f95", -2.4, 1.1));
scene.add(card("directional.card", "#d6a45d", -0.8, 1.1));
scene.add(card("point.card", "#7897df", 0.8, 1.1));
scene.add(card("spot.card", "#c789d8", 2.4, 1.1));

const shadowReceiver = new Mesh({
  geometry: new PlaneGeometry({ size: [2.0, 0.75] }),
  id: "shadow.receiver",
  material: new MeshStandardMaterial({ color: "#71816f", metalness: 0, roughness: 0.96 }),
  receiveShadow: true,
});
shadowReceiver.position.set(-1.2, -0.65, 0);
scene.add(shadowReceiver);

const caster = new Mesh({
  castShadow: true,
  geometry: new BoxGeometry({ size: [0.45, 0.45, 0.45] }),
  id: "shadow.caster",
  material: calibrationMaterial("#2f3a40"),
});
caster.position.set(-1.55, -0.45, 0.18);
scene.add(caster);

const probeReflection = new Mesh({
  geometry: new SphereGeometry({ radius: 0.48 }),
  id: "probe.reflection",
  material: calibrationMaterial("#cbd5e1"),
});
probeReflection.position.set(1.65, -0.62, 0.18);
scene.add(probeReflection);

scene.add(new AmbientLight({ color: "#d9e8ff", id: "light.ambient", intensity: 0.45 }));
const key = new DirectionalLight({ color: "#ffe4b5", id: "light.directional", intensity: 1.55, shadowBias: -0.0004 });
key.position.set(2.5, 4, 3);
scene.add(key);
const point = new PointLight({ color: "#9bb8ff", id: "light.point", intensity: 1.25, range: 8 });
point.position.set(0.85, 1.8, 1.5);
scene.add(point);
const spot = new SpotLight({ angle: 0.75, color: "#f0c2ff", id: "light.spot", intensity: 1.4, range: 9 });
spot.position.set(2.2, 2.4, 2.0);
scene.add(spot);

const camera = new OrthographicCamera({ far: 25, id: "camera.calibration", near: 0.1, size: 4.0 });
camera.position.set(0, 0, 5.5);
scene.add(camera);
scene.setActiveCamera(camera);

export default scene;
