import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
} from "@threenative/sdk";

const scene = new Scene({ id: "v10.visual.calibration.scene.scene" });

function calibrationMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, metalness: 0, roughness: 1 });
}

const skyBand = new Mesh({
  geometry: new PlaneGeometry({ size: [6.0, 1.0] }),
  id: "sky.band",
  material: calibrationMaterial("#87b8d9"),
});
skyBand.position.set(0, 1.55, -0.2);
scene.add(skyBand);

const ground = new Mesh({
  geometry: new PlaneGeometry({ size: [6.0, 1.35] }),
  id: "ground.shadow",
  material: calibrationMaterial("#66785f"),
  receiveShadow: true,
});
ground.position.set(0, -1.18, -0.05);
scene.add(ground);

const heroSubject = new Mesh({
  castShadow: true,
  geometry: new SphereGeometry({ radius: 0.58 }),
  id: "hero.subject",
  material: calibrationMaterial("#f6b75c"),
});
heroSubject.position.set(0, 0.1, 0.2);
scene.add(heroSubject);

const heroBase = new Mesh({
  castShadow: true,
  geometry: new BoxGeometry({ size: [1.3, 0.2, 0.3] }),
  id: "hero.base",
  material: calibrationMaterial("#334155"),
});
heroBase.position.set(0, -0.52, 0.08);
scene.add(heroBase);

const uiOverlay = new Mesh({
  geometry: new PlaneGeometry({ size: [1.55, 0.42] }),
  id: "ui.overlay",
  material: new MeshStandardMaterial({
    alphaMode: "blend",
    color: "#172033",
    emissive: "#172033",
    emissiveIntensity: 1,
    metalness: 0,
    opacity: 0.82,
    roughness: 1,
  }),
});
uiOverlay.position.set(1.75, 1.45, 0.35);
scene.add(uiOverlay);

const uiAccent = new Mesh({
  geometry: new PlaneGeometry({ size: [0.86, 0.08] }),
  id: "ui.overlay.accent",
  material: calibrationMaterial("#38bdf8"),
});
uiAccent.position.set(1.72, 1.45, 0.4);
scene.add(uiAccent);

scene.add(new AmbientLight({ color: "#dbeafe", id: "light.ambient", intensity: 0.55 }));
const sun = new DirectionalLight({ color: "#ffe7b6", id: "light.sun", intensity: 1.45, shadowBias: -0.0004 });
sun.position.set(2, 4, 3);
scene.add(sun);

const camera = new OrthographicCamera({ far: 25, id: "camera.calibration", near: 0.1, size: 4.2 });
camera.position.set(0, 0, 5.2);
scene.add(camera);
scene.setActiveCamera(camera);

export default scene;
