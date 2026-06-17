import {
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
} from "@threenative/sdk";

const scene = new Scene({ id: "v10.visual.calibration.color.scene" });

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
  { color: "#000000", id: "swatch.black", x: 2.0, y: -1.2 },
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

const backgroundOpaque = new Mesh({
  geometry: new PlaneGeometry({ size: [1.4, 1.0] }),
  id: "background.opaque",
  material: swatchMaterial("#1a2a4a"),
});
backgroundOpaque.position.set(2.8, 1.45, -0.01);
scene.add(backgroundOpaque);

const backgroundAlphaBase = new Mesh({
  geometry: new PlaneGeometry({ size: [1.4, 1.0] }),
  id: "background.alpha.base",
  material: swatchMaterial("#203050"),
});
backgroundAlphaBase.position.set(2.8, 0.1, -0.02);
scene.add(backgroundAlphaBase);

const backgroundAlphaOverlay = new Mesh({
  geometry: new PlaneGeometry({ size: [1.2, 0.85] }),
  id: "background.alpha.overlay",
  material: new MeshStandardMaterial({
    alphaMode: "blend",
    color: "#66cc88",
    emissive: "#224433",
    emissiveIntensity: 0.4,
    metalness: 0,
    opacity: 0.55,
    roughness: 1,
  }),
});
backgroundAlphaOverlay.position.set(2.8, 0.1, 0.02);
scene.add(backgroundAlphaOverlay);

const frameTop = new Mesh({
  geometry: new PlaneGeometry({ size: [1.0, 0.08] }),
  id: "frame.edge.top",
  material: swatchMaterial("#f0f0f0"),
});
frameTop.position.set(0, 2.18, 0.05);
scene.add(frameTop);

const frameLeft = new Mesh({
  geometry: new PlaneGeometry({ size: [0.08, 1.0] }),
  id: "frame.edge.left",
  material: swatchMaterial("#f0f0f0"),
});
frameLeft.position.set(-3.65, 0, 0.05);
scene.add(frameLeft);

const camera = new OrthographicCamera({ far: 20, id: "camera.calibration", near: 0.1, size: 4.5 });
camera.position.set(0, 0, 5);
scene.add(camera);
scene.setActiveCamera(camera);

export default scene;
