import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  PointLight,
  Scene,
  SpotLight,
  action,
  axis,
  defineInputMap,
  keyboard,
  pointerAxis,
} from "@threenative/sdk";

const scene = new Scene({ id: "v5.functional.scene" });

const camera = new PerspectiveCamera({
  far: 120,
  fovY: 60,
  id: "camera.v5.main",
  near: 0.05,
});
camera.position.set(0, 1.7, 7);

const sun = new DirectionalLight({ color: "#ffd39a", id: "light.v5.sun", intensity: 3.1 });
sun.position.set(-5, 8, 4);
const lantern = new PointLight({ color: "#9fd7ff", id: "light.v5.point", intensity: 1.4, range: 7 });
lantern.position.set(2.2, 2.1, 0.6);
const canopySpot = new SpotLight({ angle: 0.55, color: "#fff1bf", id: "light.v5.spot", intensity: 1.8, range: 10 });
canopySpot.position.set(-3.2, 4.5, 2.2);

scene.add(camera);
scene.add(new AmbientLight({ color: "#8fb2a5", id: "light.v5.ambient", intensity: 0.75 }));
scene.add(lantern);
scene.add(canopySpot);
scene.add(sun);
scene.setActiveCamera(camera);

const input = defineInputMap({
  actions: [
    action("MoveBackward", [keyboard("KeyS")]),
    action("MoveForward", [keyboard("KeyW")]),
    action("MoveLeft", [keyboard("KeyA")]),
    action("MoveRight", [keyboard("KeyD")]),
    action("Sprint", [keyboard("ShiftLeft")]),
  ],
  axes: [
    axis("LookX", { value: pointerAxis("deltaX") }),
    axis("LookY", { value: pointerAxis("deltaY") }),
  ],
});

export default {
  input,
  scene,
  environment: {
    sourceDir: "../v3-environment/assets-source/environment/glTF",
    previewImage: "../v3-environment/assets-source/environment/Preview_2.jpg",
    assetNames: ["CommonTree_1.gltf", "Grass_Common_Short.gltf", "Rock_Medium_1.gltf"],
    lod: {
      "env.CommonTree_1": [{ assetName: "CommonTree_3.gltf", minDistance: 18, maxDistance: 70 }],
      "env.Rock_Medium_1": [{ assetName: "Pebble_Round_1.gltf", minDistance: 14, maxDistance: 55 }],
    },
    budgets: {
      maxAssetBytes: 5000000,
      maxBundleBytes: 14000000,
      supportedModelFormats: ["gltf"],
      supportedTextureFormats: ["jpeg", "png"],
    },
    performance: {
      requiredTarget: "web",
      drawCalls: { warn: 80, max: 120 },
      instancedGroups: { warn: 20, max: 32 },
      instances: { warn: 1000, max: 1600 },
      triangles: { warn: 300000, max: 450000 },
      textureBytes: { warn: 13000000, max: 18000000 },
      loadMs: { warn: 1200, max: 2200 },
      averageFrameMs: { warn: 14, max: 18 },
      p95FrameMs: { warn: 18, max: 24 },
      worstFrameMs: { warn: 28, max: 36 },
      uninstancedRepeatedProps: { max: 0 },
    },
    atmosphere: {
      active: true,
      id: "atmosphere.v5.functional",
      sun: {
        id: "sun.v5.functional",
        direction: [-0.46, -0.82, -0.22],
        color: "#ffd39a",
        intensity: 3.1,
        castsShadow: true,
      },
      ambient: {
        mode: "constant",
        color: "#8fb2a5",
        intensity: 0.75,
      },
      fog: {
        enabled: true,
        mode: "exponential",
        color: "#9eb6aa",
        density: 0.02,
      },
      sky: {
        color: "#9eb6aa",
        horizonColor: "#d6c39d",
      },
      colorManagement: {
        outputColorSpace: "srgb",
        textureColorSpace: "srgb",
        toneMapping: "aces",
        exposure: 1.03,
      },
      shadows: {
        enabled: true,
        mapSize: 1024,
        maxDistance: 40,
        cascadeCount: 1,
        bias: -0.0005,
        normalBias: 0.02,
        receiverPolicy: "terrain-and-path",
      },
    },
    path: {
      id: "v5.path.main",
      width: 3,
      edgeFalloff: 0.5,
      clearingRadius: 2,
      material: "v5.path.soil",
      points: [
        [0, 0, 8],
        [-0.8, 0, 3],
        [0.7, 0, -2],
        [0, 0, -7],
      ],
    },
    terrain: {
      id: "terrain.v5.floor",
      heightMode: "controlPoints",
      controlPoints: [
        [-8, 0.6, -8],
        [-4, 0.2, 2],
        [0, 0, 8],
        [0.7, 0, -2],
        [6, 0.55, -7],
        [8, 0.8, 6],
      ],
      material: "v5.floor.moss",
      bounds: {
        min: [-8, 0, -8],
        max: [8, 0, 9],
      },
    },
    instances: [
      {
        id: "tree.v5.left",
        kind: "hero",
        sourceAsset: "env.CommonTree_1",
        position: [-3.4, 0, 2.8],
        scale: [1.3, 1.3, 1.3],
        tags: ["tree", "textured", "foreground"],
      },
      {
        id: "grass.v5.path",
        kind: "hero",
        sourceAsset: "env.Grass_Common_Short",
        position: [2.2, 0, 0.6],
        scale: [1.1, 1.1, 1.1],
        tags: ["grass", "textured"],
      },
      {
        id: "rock.v5.right",
        kind: "hero",
        sourceAsset: "env.Rock_Medium_1",
        position: [2.8, 0, -2.6],
        scale: [0.85, 0.85, 0.85],
        tags: ["rock", "textured"],
      },
    ],
    scatter: [
      {
        id: "scatter.v5.grass",
        assetIds: ["env.Grass_Common_Short"],
        bounds: { min: [-7, 0, -6], max: [7, 0, 7] },
        count: 10,
        exclusionZoneIds: ["zone.v5.path"],
        minScale: 0.7,
        maxScale: 1.25,
        seed: 508,
        tags: ["grass", "dense", "textured"],
      },
    ],
    exclusionZones: [
      {
        id: "zone.v5.path",
        bounds: { min: [-2.8, 0, -7.8], max: [2.8, 0, 8.6] },
        tags: ["walkable"],
      },
    ],
    bookmarks: [
      {
        id: "bookmark.v5.textures",
        position: [0, 1.7, 7],
        yaw: 180,
        pitch: -5,
        expectedTags: ["textured", "tree", "grass", "rock"],
      },
    ],
  },
};
