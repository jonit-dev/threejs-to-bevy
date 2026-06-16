import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from "@threenative/sdk";

const scene = new Scene({ id: "v8.rendering.quality.scene" });

const ground = new Mesh({
  geometry: new PlaneGeometry({ size: [18, 34] }),
  id: "mesh.fog.ground",
  material: new MeshStandardMaterial({ color: "#8a7356", roughness: 1 }),
  receiveShadow: true,
});
ground.position.set(0, -0.02, -14);
ground.rotation.set(-Math.PI / 2, 0, 0);
scene.add(ground);

const nearMarker = new Mesh({
  castShadow: true,
  geometry: new BoxGeometry({ size: [1.7, 1.7, 1.7] }),
  id: "mesh.fog.near",
  material: new MeshStandardMaterial({ color: "#2457d6", roughness: 0.85 }),
});
nearMarker.position.set(-2.2, 0.85, -5.5);
scene.add(nearMarker);

const midMarker = new Mesh({
  geometry: new BoxGeometry({ size: [1.8, 1.8, 1.8] }),
  id: "mesh.fog.mid",
  material: new MeshStandardMaterial({ color: "#d8742f", roughness: 0.9 }),
});
midMarker.position.set(0, 0.9, -11);
scene.add(midMarker);

const farMarker = new Mesh({
  geometry: new BoxGeometry({ size: [2.2, 2.2, 2.2] }),
  id: "mesh.fog.far",
  material: new MeshStandardMaterial({ color: "#223c95", roughness: 0.9 }),
});
farMarker.position.set(2.35, 1.1, -21);
scene.add(farMarker);

const camera = new PerspectiveCamera({
  far: 80,
  fovY: 48,
  id: "camera.main",
  near: 0.1,
});
camera.position.set(0, 2.2, 6);
camera.rotation.set(-0.07, 0, 0);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#ffffff", id: "light.ambient", intensity: 0.85 }));
const sun = new DirectionalLight({ color: "#fff1c7", id: "light.sun", intensity: 1.4 });
sun.position.set(3, 6, 4);
scene.add(sun);

export default {
  scene,
  environment: {
    assetNames: [],
    sourceDir: "src",
    atmosphere: {
      active: true,
      id: "atmosphere.v8.fog-sky",
      sun: {
        id: "sun.v8.fog-sky",
        direction: [-0.42, -0.78, -0.28],
        color: "#fff1c7",
        intensity: 1.4,
        castsShadow: false,
      },
      ambient: {
        mode: "constant",
        color: "#ffffff",
        intensity: 0.85,
      },
      fog: {
        enabled: true,
        mode: "exponential",
        color: "#c9d6c7",
        density: 0.085,
      },
      sky: {
        color: "#6aaed6",
        horizonColor: "#c9d6c7",
      },
      colorManagement: {
        outputColorSpace: "srgb",
        textureColorSpace: "srgb",
        toneMapping: "none",
        exposure: 1,
      },
      shadows: {
        enabled: false,
        mapSize: 512,
        maxDistance: 30,
        cascadeCount: 1,
        bias: -0.0005,
        normalBias: 0.02,
        receiverPolicy: "terrain-and-path",
      },
    },
    path: {
      id: "path.v8.fog-sky",
      points: [
        [0, 0, 2],
        [0, 0, -26],
      ],
      width: 2,
    },
    sourceAssets: [],
    instances: [],
  },
};
