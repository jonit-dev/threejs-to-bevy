import {
  BoxGeometry,
  Mesh,
  MeshBuilder,
  MeshExtendedMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  textureAsset,
} from "@threenative/sdk";

const scene = new Scene({ id: "v10.visual.calibration.materials.scene" });

const checker = textureAsset("tex.checker", "assets/checker.png", {
  repeat: [4, 4],
  wrapS: "repeat",
  wrapT: "repeat",
});

const tiledChecker = textureAsset("tex.tiled", "assets/checker.png", {
  offset: [0.15, 0.1],
  repeat: [3, 2],
  wrapS: "repeat",
  wrapT: "repeat",
});

const unlit = new Mesh({
  geometry: new BoxGeometry({ size: [0.8, 0.8, 0.8] }),
  id: "card.unlit",
  material: new MeshStandardMaterial({
    color: "#4f83ff",
    emissive: "#4f83ff",
    emissiveIntensity: 1,
    metalness: 0,
    roughness: 1,
  }),
});
unlit.position.set(-1.4, 0, 0);
scene.add(unlit);

const pbrBase = new Mesh({
  geometry: new PlaneGeometry({ size: [1.0, 1.0] }),
  id: "card.pbr-base",
  material: new MeshStandardMaterial({
    color: "#b0c4de",
    metalness: 0.1,
    roughness: 0.65,
  }),
});
pbrBase.position.set(-0.2, 0.55, 0);
scene.add(pbrBase);

const metalRough = new Mesh({
  geometry: new PlaneGeometry({ size: [1.0, 1.0] }),
  id: "card.metal-rough",
  material: new MeshStandardMaterial({
    color: "#d4d7dc",
    metalness: 0.95,
    roughness: 0.25,
  }),
});
metalRough.position.set(1.0, 0.55, 0);
scene.add(metalRough);

const emissive = new Mesh({
  geometry: new PlaneGeometry({ size: [0.8, 0.8] }),
  id: "card.emissive",
  material: new MeshStandardMaterial({
    color: "#111111",
    emissive: "#ff8844",
    emissiveIntensity: 1.4,
    metalness: 0,
    roughness: 1,
  }),
});
emissive.position.set(1.35, -0.15, 0.05);
scene.add(emissive);

const foliage = new Mesh({
  geometry: new PlaneGeometry({ size: [1.2, 1.2] }),
  id: "card.alpha-mask",
  material: new MeshExtendedMaterial({
    alphaCutoff: 0.45,
    alphaMode: "mask",
    baseColorTexture: checker,
    color: "#3fbf6b",
    preset: "foliage",
    renderOrder: 1,
  }),
});
foliage.position.set(0, 0, 0.1);
scene.add(foliage);

const tiled = new Mesh({
  geometry: new PlaneGeometry({ size: [1.4, 1.4] }),
  id: "card.texture-slot",
  material: new MeshExtendedMaterial({
    baseColorTexture: checker,
    color: "#ffffff",
    preset: "unlitMasked",
  }),
});
tiled.position.set(0, -1.15, 0);
scene.add(tiled);

const uvCard = new Mesh({
  geometry: new PlaneGeometry({ size: [1.0, 1.0] }),
  id: "card.uv-transform",
  material: new MeshExtendedMaterial({
    baseColorTexture: tiledChecker,
    color: "#ffffff",
    preset: "unlitMasked",
  }),
});
uvCard.position.set(-1.35, -0.55, 0);
scene.add(uvCard);

const vertexColorGeometry = MeshBuilder.create("mesh.vertex-colors")
  .box({ size: [0.8, 0.8, 0.2] })
  .color("#ff3366")
  .build();
const vertexCard = new Mesh({
  geometry: vertexColorGeometry,
  id: "card.vertex-color",
  material: new MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 0.2,
    metalness: 0,
    roughness: 1,
  }),
});
vertexCard.position.set(1.35, -0.95, 0);
scene.add(vertexCard);

const camera = new OrthographicCamera({ far: 20, id: "camera.calibration", near: 0.1, size: 4.2 });
camera.position.set(0, 0.2, 5);
scene.add(camera);
scene.setActiveCamera(camera);

export default scene;
