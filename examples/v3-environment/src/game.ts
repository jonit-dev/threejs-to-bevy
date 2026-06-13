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
    sourceDir: "../../assets-source/environment/glTF",
    previewImage: "../../assets-source/environment/Preview_2.jpg",
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
    path: {
      id: "forest.path.main",
      width: 3.2,
      points: [
        [0, 0, 8],
        [-1.1, 0, 4],
        [0.6, 0, 0],
        [1.9, 0, -4],
        [0.2, 0, -9],
      ],
    },
    instances: [
      { id: "tree.left.foreground", sourceAsset: "env.CommonTree_1", position: [-3.8, 0, 3.2], scale: [1.4, 1.4, 1.4], tags: ["tree", "foreground"] },
      { id: "tree.right.foreground", sourceAsset: "env.CommonTree_3", position: [4.1, 0, 2.4], scale: [1.25, 1.25, 1.25], tags: ["tree", "foreground"] },
      { id: "pine.left.mid", sourceAsset: "env.Pine_1", position: [-5.8, 0, -3.2], scale: [1.65, 1.65, 1.65], tags: ["tree", "midground"] },
      { id: "tree.right.background", sourceAsset: "env.CommonTree_1", position: [5.2, 0, -6.5], scale: [1.6, 1.6, 1.6], tags: ["tree", "background"] },
      { id: "bush.left.path", sourceAsset: "env.Bush_Common", position: [-2.5, 0, 1.1], scale: [1.1, 1.1, 1.1], tags: ["vegetation"] },
      { id: "bush.right.path", sourceAsset: "env.Bush_Common", position: [2.8, 0, -1.3], scale: [1.2, 1.2, 1.2], tags: ["vegetation"] },
      { id: "grass.left.1", sourceAsset: "env.Grass_Common_Short", position: [-1.8, 0, 4.1], tags: ["grass", "path-edge"] },
      { id: "grass.left.2", sourceAsset: "env.Grass_Wispy_Tall", position: [-2.4, 0, 0.4], tags: ["grass", "path-edge"] },
      { id: "grass.right.1", sourceAsset: "env.Grass_Common_Short", position: [1.9, 0, 3.6], tags: ["grass", "path-edge"] },
      { id: "grass.right.2", sourceAsset: "env.Grass_Wispy_Tall", position: [2.6, 0, -3.4], tags: ["grass", "path-edge"] },
      { id: "rock.left.foreground", sourceAsset: "env.Rock_Medium_1", position: [-1.7, 0, 5.9], scale: [0.9, 0.9, 0.9], tags: ["rock"] },
      { id: "rock.right.mid", sourceAsset: "env.Rock_Medium_1", position: [2.5, 0, -0.8], scale: [0.75, 0.75, 0.75], tags: ["rock"] },
      { id: "pebble.path.1", sourceAsset: "env.Pebble_Round_1", position: [-0.5, 0, 3.4], scale: [0.45, 0.45, 0.45], tags: ["pebble", "path"] },
      { id: "pebble.path.2", sourceAsset: "env.Pebble_Round_1", position: [0.7, 0, -2.2], scale: [0.35, 0.35, 0.35], tags: ["pebble", "path"] },
      { id: "mushroom.left", sourceAsset: "env.Mushroom_Common", position: [-1.9, 0, -1.8], scale: [0.8, 0.8, 0.8], tags: ["mushroom"] },
      { id: "flowers.right", sourceAsset: "env.Flower_3_Group", position: [1.8, 0, 1.5], scale: [0.9, 0.9, 0.9], tags: ["flower"] },
    ],
  },
};
