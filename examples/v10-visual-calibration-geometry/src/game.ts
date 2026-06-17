import {
  AmbientLight,
  BoxGeometry,
  CustomMeshGeometry,
  Mesh,
  MeshBuilder,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  modelAsset,
} from "@threenative/sdk";

const markerModel = modelAsset("model.geometry.marker", "assets/marker.gltf");
const scene = new Scene({ assetRefs: [markerModel], id: "v10.visual.calibration.geometry.scene" });

function calibrationMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, metalness: 0, roughness: 1 });
}

const primitiveGrid = new Mesh({
  geometry: new BoxGeometry({ size: [0.8, 0.8, 0.18] }),
  id: "primitive.grid",
  material: calibrationMaterial("#d97706"),
});
primitiveGrid.position.set(-2.1, 0.85, 0);
scene.add(primitiveGrid);

const generatedMesh = new Mesh({
  geometry: MeshBuilder.create("geometry.generated").sphere({ radius: 0.46, rings: 5, segments: 12 }).build({
    budget: "standard-prop",
    helper: "calibration-sphere",
    seed: 10,
  }),
  id: "generated.mesh",
  material: calibrationMaterial("#4f8edb"),
});
generatedMesh.position.set(-0.65, 0.85, 0);
scene.add(generatedMesh);

const gltfInstance = new Mesh({
  geometry: new PlaneGeometry({ size: [1.0, 0.9] }),
  id: "gltf.instance.card",
  material: calibrationMaterial("#f8fafc"),
});
gltfInstance.position.set(0.85, 0.85, 0.05);
scene.add(gltfInstance);

const uvMarker = new Mesh({
  geometry: new CustomMeshGeometry({
    attributes: [
      { itemSize: 3, name: "position", values: [-0.6, -0.45, 0, 0.6, -0.45, 0, 0.6, 0.45, 0, -0.6, 0.45, 0] },
      { itemSize: 2, name: "uv", values: [0, 0, 1, 0, 1, 1, 0, 1] },
      { itemSize: 4, name: "color", values: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1] },
    ],
    bounds: { max: [0.6, 0.45, 0], min: [-0.6, -0.45, 0] },
    generation: { helper: "manual-uv-card", id: "geometry.uv-marker", source: "BufferGeometrySnapshot" },
    indices: [0, 1, 2, 0, 2, 3],
    storage: "inline",
    topology: "triangle-list",
    usage: "static",
  }),
  id: "uv.marker",
  material: calibrationMaterial("#ffffff"),
});
uvMarker.position.set(2.05, 0.85, 0);
scene.add(uvMarker);

const ground = new Mesh({
  geometry: new PlaneGeometry({ size: [5.6, 0.9] }),
  id: "geometry.ground",
  material: calibrationMaterial("#475569"),
});
ground.position.set(0, -0.85, -0.05);
scene.add(ground);

const anchor = new Mesh({
  geometry: new SphereGeometry({ radius: 0.25 }),
  id: "geometry.anchor",
  material: calibrationMaterial("#e2e8f0"),
});
anchor.position.set(0, -0.85, 0.1);
scene.add(anchor);

scene.add(new AmbientLight({ color: "#f8fafc", id: "light.ambient", intensity: 0.75 }));

const camera = new OrthographicCamera({ far: 25, id: "camera.calibration", near: 0.1, size: 3.9 });
camera.position.set(0, 0, 5);
scene.add(camera);
scene.setActiveCamera(camera);

export default scene;
