import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshExtendedMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  textureAsset,
} from "@threenative/sdk";

const scene = new Scene({ id: "v8.material.parity.scene" });

const checker = textureAsset("tex.checker", "assets/checker.png", {
  repeat: [4, 4],
  wrapS: "repeat",
  wrapT: "repeat",
});

const specular = textureAsset("tex.specular", "assets/specular.png");

const opaque = new Mesh({
  geometry: new BoxGeometry({ size: [0.8, 0.8, 0.8] }),
  id: "cube.opaque",
  material: new MeshStandardMaterial({ color: "#4f83ff", roughness: 0.45 }),
});
opaque.position.set(-1.4, 0, 0);
scene.add(opaque);

const foliage = new Mesh({
  geometry: new PlaneGeometry({ size: [1.2, 1.2] }),
  id: "plane.foliage",
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

const glass = new Mesh({
  geometry: new PlaneGeometry({ size: [1.1, 1.1] }),
  id: "plane.glass",
  material: new MeshStandardMaterial({
    alphaMode: "blend",
    blendMode: "normal",
    color: "#9ed7ff",
    depthWrite: false,
    opacity: 0.35,
    renderOrder: 2,
    roughness: 0.08,
    transmission: 0.65,
  }),
});
glass.position.set(1.2, 0, 0.2);
scene.add(glass);

const decal = new Mesh({
  geometry: new PlaneGeometry({ size: [0.5, 0.5] }),
  id: "plane.decal",
  material: new MeshStandardMaterial({
    alphaMode: "blend",
    blendMode: "additive",
    color: "#ff8844",
    depthWrite: false,
    opacity: 0.8,
    renderOrder: 3,
    roughness: 1,
  }),
});
decal.position.set(0.2, 0.6, 0.35);
scene.add(decal);

const tiled = new Mesh({
  geometry: new PlaneGeometry({ size: [1.4, 1.4] }),
  id: "plane.tiled",
  material: new MeshStandardMaterial({
    baseColorTexture: textureAsset("tex.tiled", "assets/checker.png", {
      offset: [0.15, 0.1],
      repeat: [3, 2],
      wrapS: "repeat",
      wrapT: "repeat",
    }),
    color: "#ffffff",
    roughness: 0.9,
    specularIntensity: 0.85,
    specularTexture: specular,
  }),
});
tiled.position.set(0, -1.15, 0);
scene.add(tiled);

const camera = new OrthographicCamera({ far: 20, id: "camera.material", near: 0.1, size: 4.2 });
camera.position.set(0, 0.2, 5);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#ffffff", id: "light.ambient", intensity: 0.55 }));
const key = new DirectionalLight({ color: "#ffffff", id: "light.key", intensity: 1.2 });
key.position.set(2, 4, 3);
scene.add(key);

export default scene;
