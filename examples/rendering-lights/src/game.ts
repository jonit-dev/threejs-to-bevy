import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  environmentMap,
  lightProbe,
  skybox,
  textureAsset,
} from "@threenative/sdk";

const skyNx = textureAsset("tex.sky.nx", "assets/sky/nx.png");
const skyNy = textureAsset("tex.sky.ny", "assets/sky/ny.png");
const skyNz = textureAsset("tex.sky.nz", "assets/sky/nz.png");
const skyPx = textureAsset("tex.sky.px", "assets/sky/px.png");
const skyPy = textureAsset("tex.sky.py", "assets/sky/py.png");
const skyPz = textureAsset("tex.sky.pz", "assets/sky/pz.png");
const studio = textureAsset("tex.env.studio", "assets/studio.png");

const scene = new Scene({
  assetRefs: [skyNx, skyNy, skyNz, skyPx, skyPy, skyPz, studio],
  id: "v9.rendering.lights.scene",
});

const ground = new Mesh({
  geometry: new BoxGeometry({ size: [8, 0.1, 8] }),
  id: "arena.floor",
  material: new MeshStandardMaterial({ color: "#3f4f5f", roughness: 0.95 }),
});
ground.position.set(0, -0.05, 0);
scene.add(ground);

const marker = new Mesh({
  geometry: new BoxGeometry({ size: [1.2, 1.2, 1.2] }),
  id: "marker.main",
  material: new MeshStandardMaterial({ color: "#f59e0b", emissive: "#7c4a03", emissiveIntensity: 0.35, roughness: 0.6 }),
});
marker.position.set(0, 0.6, 0);
scene.add(marker);

const camera = new PerspectiveCamera({ far: 60, fovY: 50, id: "camera.main", near: 0.1 });
camera.position.set(0, 1.6, 4.5);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#dbeafe", id: "light.ambient", intensity: 0.35 }));
const sun = new DirectionalLight({ color: "#fff7ed", id: "light.sun", intensity: 2.4 });
sun.position.set(3, 5, 2);
scene.add(sun);
const fill = new PointLight({ color: "#93c5fd", id: "light.fill", intensity: 1.8, range: 12 });
fill.position.set(-2, 2, 1);
scene.add(fill);

export default {
  environment: {
    assetNames: [],
    environmentMap: environmentMap({ asset: studio, mode: "equirect" }, { intent: "reflection-and-irradiance" }),
    instances: [],
    lightProbes: [
      lightProbe("probe.center", {
        bounds: { max: [3, 4, 3], min: [-3, 0, -3] },
        influenceRadius: 5,
        intent: "irradiance",
        source: { asset: studio, mode: "equirect" },
      }),
    ],
    path: { id: "path.main", points: [[0, 0, 2], [0, 0, -4]], width: 2 },
    skybox: skybox(
      {
        faces: { negativeX: skyNx, negativeY: skyNy, negativeZ: skyNz, positiveX: skyPx, positiveY: skyPy, positiveZ: skyPz },
        mode: "cubemap",
      },
      { intensity: 0.85, rotationY: 0.2 },
    ),
    sourceDir: "src",
  },
  scene,
};
