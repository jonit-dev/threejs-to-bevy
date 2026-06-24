import {
  AmbientLight,
  DirectionalLight,
  environmentMap,
  modelAsset,
  PerspectiveCamera,
  Scene,
  defineEntity,
  defineGame,
  defineScene,
  defineWorldModule,
  skybox,
  stylizedNature,
  textureAsset,
} from "@threenative/sdk";

const sourceSky = textureAsset("tex.stylizedScene.sky", "assets/skybox/sky_88_2k.png");
const sourceGrassColor = textureAsset("tex.stylizedScene.grass.color", "assets/grass_texture/grass_05_basecolor_1k.webp");
const sourceGrassNormal = textureAsset("tex.stylizedScene.grass.normal", "assets/grass_texture/grass_05_normal_gl_1k.webp");
const sourceGrassRoughness = textureAsset("tex.stylizedScene.grass.roughness", "assets/grass_texture/grass_05_roughness_1k.webp");
const sourceDirtColor = textureAsset("tex.stylizedScene.dirt.color", "assets/ground_texture/ground_07_4k/ground_07__basecolor_1k.webp");
const sourceDirtNormal = textureAsset("tex.stylizedScene.dirt.normal", "assets/ground_texture/ground_07_4k/ground_07__normal_gl_1k.webp");
const sourceDirtRoughness = textureAsset("tex.stylizedScene.dirt.roughness", "assets/ground_texture/ground_07_4k/ground_07__roughness_1k.webp");
const sourceDirtAo = textureAsset("tex.stylizedScene.dirt.ao", "assets/ground_texture/ground_07_4k/ground_07__ambientocclusion_1k.webp");
const sourceDirtHeight = textureAsset("tex.stylizedScene.dirt.height", "assets/ground_texture/ground_07_4k/ground_07__height_1k.webp");
const sourceDirtMetallic = textureAsset("tex.stylizedScene.dirt.metallic", "assets/ground_texture/ground_07_4k/ground_07__metallic_1k.webp");
const sourcePathMask = textureAsset("tex.stylizedScene.path.mask", "assets/path.webp");
const sourceNoise = textureAsset("tex.stylizedScene.noise", "assets/perlin.webp");
const sourceGrassModel = modelAsset("model.stylizedScene.grass.blades", "assets/grass-blades-up.glb");
const sourceTreeLeavesModel = modelAsset("model.stylizedScene.tree.leaves", "assets/tree-leaves-mesh.glb");
const sourceTreeTrunkModel = modelAsset("model.stylizedScene.tree.trunk", "assets/tree-tronk-transformed.glb");
const sourceLeavesAlpha = textureAsset("tex.stylizedScene.tree.leaves.alpha", "assets/leaves-alpha-map.png");
const sourceAssets = [
  sourceSky,
  sourceGrassColor,
  sourceGrassNormal,
  sourceGrassRoughness,
  sourceDirtColor,
  sourceDirtNormal,
  sourceDirtRoughness,
  sourceDirtAo,
  sourceDirtHeight,
  sourceDirtMetallic,
  sourcePathMask,
  sourceNoise,
  sourceGrassModel,
  sourceTreeLeavesModel,
  sourceTreeTrunkModel,
  sourceLeavesAlpha,
];

const visual = new Scene({ assetRefs: sourceAssets, id: "stylized.nature.component.visual" });
const camera = new PerspectiveCamera({ id: "camera.main", fovY: 50, near: 0.05, far: 100 });
camera.position.set(1.98, 4.46, 22.31);
camera.rotation.set(-0.18, 0.08, 0);
visual.add(camera);
visual.setActiveCamera(camera);

const sun = new DirectionalLight({ id: "light.sun", color: "#fff1cf", intensity: 3.0 });
sun.position.set(18, 16, 10);
visual.add(sun);
visual.add(new AmbientLight({ id: "light.ambient", color: "#fff1cf", intensity: 0.35 }));

const world = defineWorldModule({
  entities: [
    defineEntity({
      id: "stylized-nature-patch",
      components: [
        stylizedNature({
          density: "high",
          size: 40,
          grassCount: 5000,
          treeCount: 4,
          pathWidth: 3.0,
          windStrength: 0.25,
          groundColor: "#6aa14f",
          grassRootColor: "#6aa14f",
          grassTipColor: "#a1cc33",
          pathColor: "#9b6543",
          leafColor: "#4a6b27",
          grassColorMap: sourceGrassColor.id,
          grassNormalMap: sourceGrassNormal.id,
          grassRoughnessMap: sourceGrassRoughness.id,
          dirtColorMap: sourceDirtColor.id,
          dirtNormalMap: sourceDirtNormal.id,
          dirtRoughnessMap: sourceDirtRoughness.id,
          dirtAoMap: sourceDirtAo.id,
          dirtHeightMap: sourceDirtHeight.id,
          dirtMetallicMap: sourceDirtMetallic.id,
          pathMaskMap: sourcePathMask.id,
          noiseMap: sourceNoise.id,
          grassModel: sourceGrassModel.id,
          treeLeavesModel: sourceTreeLeavesModel.id,
          treeTrunkModel: sourceTreeTrunkModel.id,
          leavesAlphaMap: sourceLeavesAlpha.id,
        }),
      ],
    }),
  ],
});

export default defineGame({
  environment: {
    assetNames: [],
    environmentMap: environmentMap({ asset: sourceSky, mode: "equirect" }, { intensity: 0.6, intent: "reflection-and-irradiance" }),
    instances: [],
    lightProbes: [],
    path: { id: "path.source", points: [[0, 0, 18], [0, 0, -18]], width: 3 },
    skybox: skybox({ asset: sourceSky, mode: "equirect" }, { intensity: 0.6 }),
    sourceDir: "src",
  },
  initialScene: "stylized.nature.component.scene",
  scenes: [
    defineScene({
      id: "stylized.nature.component.scene",
      kind: "level",
      visual,
      world,
    }),
  ],
});
