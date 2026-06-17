import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
} from "@threenative/sdk";

const scene = new Scene({ id: "v10.visual.calibration.atmosphere.scene" });

function calibrationMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, metalness: 0, roughness: 1 });
}

function band(id: string, color: string, y: number, z: number): Mesh {
  const mesh = new Mesh({
    geometry: new PlaneGeometry({ size: [5.0, 0.72] }),
    id,
    material: calibrationMaterial(color),
  });
  mesh.position.set(0, y, z);
  return mesh;
}

scene.add(band("fog.near", "#8fb3d9", 1.05, 0));
scene.add(band("fog.mid", "#a8bdc8", 0.1, -0.4));
scene.add(band("fog.far", "#c0c5bf", -0.85, -0.8));
scene.add(band("sky.horizon", "#d8c99d", -1.72, -1.2));

const skyboxAnchor = new Mesh({
  geometry: new PlaneGeometry({ size: [1.0, 0.8] }),
  id: "skybox.anchor",
  material: calibrationMaterial("#7aa5c8"),
});
skyboxAnchor.position.set(2.35, 1.5, 0.1);
scene.add(skyboxAnchor);

scene.add(new AmbientLight({ color: "#d8e8f8", id: "light.ambient", intensity: 0.65 }));
const sun = new DirectionalLight({ color: "#fff0c8", id: "light.sun", intensity: 1.2 });
sun.position.set(-2, 3, 4);
scene.add(sun);

const camera = new OrthographicCamera({ far: 25, id: "camera.calibration", near: 0.1, size: 4.4 });
camera.position.set(0, 0, 5.2);
scene.add(camera);
scene.setActiveCamera(camera);

export default {
  environment: {
    assetNames: [],
    atmosphere: {
      active: true,
      ambient: { color: "#d8e8f8", intensity: 0.65, mode: "constant" },
      colorManagement: { exposure: 1, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" },
      fog: { color: "#b7c8c4", density: 0.025, enabled: true, mode: "exponential" },
      id: "atmosphere.v10.calibration",
      shadows: { bias: -0.0005, cascadeCount: 1, enabled: true, mapSize: 1024, maxDistance: 30, normalBias: 0.02, receiverPolicy: "terrain-and-path" },
      sky: { color: "#8fb3d9", horizonColor: "#d8c99d" },
      sun: { castsShadow: true, color: "#fff0c8", direction: [-0.4, -0.8, -0.2], id: "sun.v10.calibration", intensity: 1.2 },
    },
    instances: [],
    path: { id: "path.v10.calibration", points: [[0, 0, 2], [0, 0, -4]], width: 2 },
    sourceDir: "src",
  },
  scene,
};
