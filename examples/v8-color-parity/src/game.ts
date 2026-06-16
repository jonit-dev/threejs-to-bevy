import {
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
} from "@threenative/sdk";

const scene = new Scene({ id: "v8.color.parity.scene" });

function swatchMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, metalness: 0, roughness: 1 });
}

const swatches = [
  { color: "#e6194b", id: "swatch.red", x: -2.0, y: 1.2 },
  { color: "#3cb44b", id: "swatch.green", x: 0, y: 1.2 },
  { color: "#4363d8", id: "swatch.blue", x: 2.0, y: 1.2 },
  { color: "#ffe119", id: "swatch.yellow", x: -2.0, y: 0 },
  { color: "#42d4f4", id: "swatch.cyan", x: 0, y: 0 },
  { color: "#f032e6", id: "swatch.magenta", x: 2.0, y: 0 },
  { color: "#ffffff", id: "swatch.white", x: -2.0, y: -1.2 },
  { color: "#808080", id: "swatch.gray", x: 0, y: -1.2 },
  { color: "#f58231", id: "swatch.orange", x: 2.0, y: -1.2 },
] as const;

for (const swatch of swatches) {
  const plane = new Mesh({
    geometry: new PlaneGeometry({ size: [1.2, 1.2] }),
    id: swatch.id,
    material: swatchMaterial(swatch.color),
  });
  plane.position.set(swatch.x, swatch.y, 0);
  scene.add(plane);
}

const camera = new OrthographicCamera({ far: 20, id: "camera.color", near: 0.1, size: 4.5 });
camera.position.set(0, 0, 5);
scene.add(camera);
scene.setActiveCamera(camera);

export default scene;
