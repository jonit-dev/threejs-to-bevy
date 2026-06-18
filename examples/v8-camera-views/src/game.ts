import {
  AmbientLight,
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  renderTargetAsset,
} from "@threenative/sdk";

function markerMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1 });
}

const scene = new Scene({
  assetRefs: [renderTargetAsset("rt.monitor", { height: 256, usage: "color", width: 256 })],
  id: "v8.camera.views.scene",
});

const player = new Mesh({
  geometry: new BoxGeometry({ size: [0.8, 0.8, 0.8] }),
  id: "player.main",
  material: markerMaterial("#55ccff"),
});
player.position.set(0, 0.4, 0);
scene.add(player);

const minimapMarker = new Mesh({
  geometry: new BoxGeometry({ size: [2.4, 0.35, 2.4] }),
  id: "mesh.minimap-marker",
  layers: ["minimap"],
  material: markerMaterial("#22cc55"),
});
minimapMarker.position.set(0, 0.175, 0);
scene.add(minimapMarker);

const splitMarker = new Mesh({
  geometry: new BoxGeometry({ size: [1.2, 1.2, 1.2] }),
  id: "mesh.split-marker",
  layers: ["split"],
  material: markerMaterial("#ff8844"),
});
splitMarker.position.set(0, 0.6, 0);
scene.add(splitMarker);

const monitorSubject = new Mesh({
  geometry: new BoxGeometry({ size: [1.5, 1.5, 1.5] }),
  id: "mesh.monitor-subject",
  layers: ["monitor"],
  material: markerMaterial("#ff55aa"),
});
monitorSubject.position.set(0, 0.75, 0);
scene.add(monitorSubject);

const monitorScreen = new Mesh({
  geometry: new BoxGeometry({ size: [1.6, 1.2, 0.08] }),
  id: "mesh.monitor-screen",
  material: new MeshStandardMaterial({
    baseColorTexture: "rt.monitor",
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 0.25,
  }),
});
monitorScreen.position.set(-1.55, 1.2, 0);
scene.add(monitorScreen);

const cameraMain = new PerspectiveCamera({
  clear: { color: "#111318", mode: "color" },
  far: 50,
  follow: { offset: [0, 2.5, 5], smoothing: 10, target: "player.main" },
  fovY: 60,
  id: "camera.main",
  near: 0.1,
  order: 1,
  output: { format: "png", mode: "writeback", path: "examples/v8-camera-views/artifacts/camera-views/export-main.png" },
  viewport: [0, 0, 0.7, 1],
});
cameraMain.position.set(0, 2.5, 5);
scene.add(cameraMain);

const cameraMinimap = new OrthographicCamera({
  clear: { color: "#0a2010", mode: "color" },
  far: 50,
  id: "camera.minimap",
  layers: ["minimap"],
  near: 0.1,
  order: 2,
  size: 6,
  viewport: [0.7, 0, 0.3, 0.35],
});
cameraMinimap.position.set(0, 8, 0);
cameraMinimap.rotation.set(-Math.PI / 2, 0, 0);
scene.add(cameraMinimap);

const cameraSplit = new PerspectiveCamera({
  clear: { color: "#331111", mode: "color" },
  far: 50,
  follow: { offset: [0, 1.6, 4], smoothing: 12, target: "mesh.split-marker" },
  fovY: 55,
  id: "camera.split",
  layers: ["split"],
  near: 0.1,
  order: 3,
  viewport: [0.7, 0.35, 0.3, 0.65],
});
cameraSplit.position.set(0, 1.6, 4);
scene.add(cameraSplit);

const cameraMonitor = new PerspectiveCamera({
  clear: { color: "#220022", mode: "color" },
  far: 30,
  follow: { offset: [0, 0.75, 3], smoothing: 12, target: "mesh.monitor-subject" },
  fovY: 50,
  id: "camera.monitor",
  layers: ["monitor"],
  near: 0.1,
  order: 0,
  target: { asset: "rt.monitor", kind: "texture" },
});
cameraMonitor.position.set(0, 1.5, 3);
scene.add(cameraMonitor);

const cameraCustom = new PerspectiveCamera({
  far: 50,
  fovY: 60,
  id: "camera.custom",
  near: 0.1,
  order: 4,
  projection: {
    handedness: "right",
    kind: "matrix",
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.002, -0.2002, 0, 0, -1, 0],
  },
  viewport: [0, 0, 0.01, 0.01],
});
scene.add(cameraCustom);

scene.add(new AmbientLight({ color: "#ffffff", id: "light.ambient", intensity: 0.2 }));

scene.setActiveCameras([cameraMonitor, cameraMain, cameraMinimap, cameraSplit, cameraCustom]);

export default scene;
