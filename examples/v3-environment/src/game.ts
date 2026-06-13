import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
} from "@threenative/sdk";

const scene = new Scene({ id: "v3.environment.scene" });

const camera = new PerspectiveCamera({
  far: 180,
  fovY: 62,
  id: "camera.firstPerson",
  near: 0.05,
});
camera.position.set(0, 1.7, 7);

const sun = new DirectionalLight({ color: "#ffd39a", id: "light.sun", intensity: 3.2 });
sun.position.set(-6, 9, 4);

scene.add(camera);
scene.add(new AmbientLight({ color: "#8fb2a5", id: "light.ambient", intensity: 0.8 }));
scene.add(sun);
scene.setActiveCamera(camera);

export default {
  scene,
  environment: {
    sourceDir: "assets-source/environment/glTF",
    previewImage: "assets-source/environment/Preview_2.jpg",
    assetNames: [
      "Bush_Common.gltf",
      "CommonTree_1.gltf",
      "CommonTree_3.gltf",
      "Flower_3_Group.gltf",
      "Grass_Common_Short.gltf",
      "Grass_Wispy_Tall.gltf",
      "Mushroom_Common.gltf",
      "Pebble_Round_1.gltf",
      "Pine_1.gltf",
      "Rock_Medium_1.gltf",
    ],
    budgets: {
      maxAssetBytes: 5000000,
      maxBundleBytes: 30000000,
      supportedModelFormats: ["gltf"],
      supportedTextureFormats: ["jpeg", "png"],
    },
    performance: {
      requiredTarget: "web",
      drawCalls: { warn: 80, max: 120 },
      instancedGroups: { warn: 20, max: 32 },
      instances: { warn: 1000, max: 1600 },
      triangles: { warn: 300000, max: 450000 },
      textureBytes: { warn: 12000000, max: 18000000 },
      loadMs: { warn: 1200, max: 2200 },
      averageFrameMs: { warn: 14, max: 18 },
      p95FrameMs: { warn: 18, max: 24 },
      worstFrameMs: { warn: 28, max: 36 },
      uninstancedRepeatedProps: { max: 0 },
    },
    atmosphere: {
      active: true,
      id: "atmosphere.forest",
      sun: {
        id: "sun.forest",
        direction: [-0.46, -0.82, -0.22],
        color: "#ffd39a",
        intensity: 3.2,
        castsShadow: true,
      },
      ambient: {
        mode: "constant",
        color: "#8fb2a5",
        intensity: 0.8,
      },
      fog: {
        enabled: true,
        mode: "exponential",
        color: "#9eb6aa",
        density: 0.028,
      },
      sky: {
        color: "#9eb6aa",
        horizonColor: "#d6c39d",
      },
      colorManagement: {
        outputColorSpace: "srgb",
        textureColorSpace: "srgb",
        toneMapping: "aces",
        exposure: 1.05,
      },
      shadows: {
        enabled: true,
        mapSize: 1024,
        maxDistance: 45,
        cascadeCount: 1,
        bias: -0.0005,
        normalBias: 0.02,
        receiverPolicy: "terrain-and-path",
      },
    },
    path: {
      id: "forest.path.main",
      width: 3.2,
      edgeFalloff: 0.55,
      clearingRadius: 2.2,
      material: "forest.path.soil",
      points: [
        [0, 0, 8],
        [-1.1, 0, 4],
        [0.6, 0, 0],
        [1.9, 0, -4],
        [0.2, 0, -9],
      ],
    },
    terrain: {
      id: "terrain.forest.floor",
      heightMode: "controlPoints",
      controlPoints: [
        [-12, 0.35, -14],
        [-8, 0.18, -4],
        [-5, 0.42, 7],
        [0, 0, 8],
        [0.6, 0, 0],
        [0.2, 0, -9],
        [5, 0.28, -6],
        [8, 0.52, 5],
        [12, 0.25, -14],
      ],
      material: "forest.floor.moss",
      bounds: {
        min: [-12, 0, -14],
        max: [12, 0, 10],
      },
    },
    exclusionZones: [
      { id: "camera.start.clearance", bounds: { min: [-2.4, 0, 5.2], max: [2.4, 0, 9] }, tags: ["camera", "walkable"] },
      { id: "camera.midPath.clearance", bounds: { min: [-2.2, 0, -0.2], max: [1.4, 0, 2.8] }, tags: ["camera", "walkable"] },
      { id: "camera.bend.clearance", bounds: { min: [-4.2, 0, -5.4], max: [4.8, 0, -1] }, tags: ["camera", "walkable"] },
      { id: "hero.foreground.clearance", bounds: { min: [-5, 0, 1], max: [5, 0, 4.5] }, tags: ["hero"] },
    ],
    scatter: [
      {
        id: "scatter.grass.pathEdges",
        seed: 301,
        assetIds: ["env.Grass_Common_Short", "env.Grass_Wispy_Tall"],
        bounds: { min: [-8, 0, -10], max: [8, 0, 7] },
        count: 28,
        minScale: 0.75,
        maxScale: 1.35,
        rotation: { minYaw: 0, maxYaw: 6.283185307179586 },
        tags: ["grass", "path-edge"],
        collisionMode: "none",
        exclusionZoneIds: ["camera.start.clearance", "camera.midPath.clearance", "camera.bend.clearance", "hero.foreground.clearance"],
      },
      {
        id: "scatter.rocksAndPebbles",
        seed: 509,
        assetIds: ["env.Rock_Medium_1", "env.Pebble_Round_1"],
        bounds: { min: [-9, 0, -11], max: [9, 0, 7] },
        count: 14,
        minScale: 0.35,
        maxScale: 0.95,
        tags: ["rock", "pebble"],
        collisionMode: "blocking",
        exclusionZoneIds: ["camera.start.clearance", "camera.midPath.clearance", "camera.bend.clearance"],
      },
      {
        id: "scatter.flowersAndMushrooms",
        seed: 733,
        assetIds: ["env.Flower_3_Group", "env.Mushroom_Common"],
        bounds: { min: [-7, 0, -8], max: [7, 0, 5] },
        count: 9,
        minScale: 0.32,
        maxScale: 0.68,
        tags: ["flower", "mushroom"],
        collisionMode: "none",
        exclusionZoneIds: ["camera.start.clearance", "camera.midPath.clearance", "camera.bend.clearance"],
      },
    ],
    bookmarks: [
      {
        id: "bookmark.entry",
        position: [0, 1.7, 7],
        yaw: 180,
        pitch: -4,
        expectedTags: ["tree", "grass", "rock"],
        notes: "Entry path view matching the Preview_2 foreground framing.",
      },
      {
        id: "bookmark.midPath",
        position: [-0.7, 1.7, 1.5],
        yaw: 170,
        pitch: -3,
        expectedTags: ["grass", "flower", "mushroom"],
      },
      {
        id: "bookmark.bend",
        position: [0.6, 1.7, -3.7],
        yaw: 8,
        pitch: -4,
        expectedTags: ["tree", "pebble", "rock"],
      },
    ],
    controller: {
      camera: "camera.firstPerson",
      height: 1.7,
      maxSpeed: 4.5,
      acceleration: 18,
      sensitivity: 0.0025,
      pointerLock: "required",
      pitch: { min: -75, max: 75 },
      collisionProfile: "forest.path.walkable",
      input: {
        forward: "MoveForward",
        backward: "MoveBackward",
        left: "MoveLeft",
        right: "MoveRight",
        sprint: "Sprint",
        lookX: "LookX",
        lookY: "LookY",
      },
    },
    walkability: {
      terrain: { surface: "terrain.forest.floor", height: 0 },
      movementProfile: {
        radius: 0.35,
        height: 1.8,
        eyeHeight: 1.7,
        maxStep: 0.35,
        boundary: "block",
      },
      regions: [
        {
          id: "forest.path.walkable",
          points: [
            [-2.4, 8.8],
            [1.7, 8.4],
            [1.7, -9.7],
            [-2.2, -9.6],
          ],
        },
      ],
      blockers: [
        { id: "blocker.tree.left.foreground", instance: "tree.left.foreground", collider: { type: "cylinder", radius: 0.7 } },
        { id: "blocker.tree.right.foreground", instance: "tree.right.foreground", collider: { type: "cylinder", radius: 0.7 } },
        { id: "blocker.rock.left.foreground", instance: "rock.left.foreground", collider: { type: "cylinder", radius: 0.6 } },
        { id: "blocker.rock.right.mid", instance: "rock.right.mid", collider: { type: "cylinder", radius: 0.5 } },
      ],
    },
    instances: [
      { id: "tree.left.foreground", kind: "hero", sourceAsset: "env.CommonTree_1", position: [-3.8, 0, 3.2], scale: [1.4, 1.4, 1.4], tags: ["tree", "foreground"], collisionMode: "blocking", scatterExclusionRadius: 1.6 },
      { id: "tree.right.foreground", kind: "hero", sourceAsset: "env.CommonTree_3", position: [4.1, 0, 2.4], scale: [1.25, 1.25, 1.25], tags: ["tree", "foreground"], collisionMode: "blocking", scatterExclusionRadius: 1.4 },
      { id: "pine.left.mid", kind: "hero", sourceAsset: "env.Pine_1", position: [-5.8, 0, -3.2], scale: [1.65, 1.65, 1.65], tags: ["tree", "midground"], collisionMode: "blocking" },
      { id: "tree.right.background", kind: "hero", sourceAsset: "env.CommonTree_1", position: [5.2, 0, -6.5], scale: [1.6, 1.6, 1.6], tags: ["tree", "background"], collisionMode: "blocking" },
      { id: "bush.left.path", kind: "hero", sourceAsset: "env.Bush_Common", position: [-2.5, 0, 1.1], scale: [1.1, 1.1, 1.1], tags: ["vegetation"] },
      { id: "bush.right.path", kind: "hero", sourceAsset: "env.Bush_Common", position: [2.8, 0, -1.3], scale: [1.2, 1.2, 1.2], tags: ["vegetation"] },
      { id: "rock.left.foreground", kind: "hero", sourceAsset: "env.Rock_Medium_1", position: [-1.7, 0, 5.9], scale: [0.9, 0.9, 0.9], tags: ["rock"], collisionMode: "blocking" },
      { id: "rock.right.mid", kind: "hero", sourceAsset: "env.Rock_Medium_1", position: [2.5, 0, -0.8], scale: [0.75, 0.75, 0.75], tags: ["rock"], collisionMode: "blocking" },
    ],
  },
};
