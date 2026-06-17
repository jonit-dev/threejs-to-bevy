import {
  AmbientLight,
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
} from "@threenative/sdk";

const scene = new Scene({ id: "v10.visual.calibration.dense.scene" });
const palette = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7"] as const;

function calibrationMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, metalness: 0, roughness: 1 });
}

for (let row = 0; row < 5; row += 1) {
  for (let column = 0; column < 8; column += 1) {
    const mesh = new Mesh({
      geometry: new BoxGeometry({ size: [0.25, 0.25, 0.08] }),
      id: `instance.grid.${row}.${column}`,
      material: calibrationMaterial(palette[(row + column) % palette.length]),
    });
    mesh.position.set(-2.45 + column * 0.7, 1.15 - row * 0.38, 0);
    scene.add(mesh);
  }
}

const hlodFade = new Mesh({
  geometry: new PlaneGeometry({ size: [2.1, 0.72] }),
  id: "hlod.fade",
  material: new MeshStandardMaterial({ alphaMode: "blend", color: "#a7f3d0", emissive: "#a7f3d0", emissiveIntensity: 1, metalness: 0, opacity: 0.72, roughness: 1 }),
});
hlodFade.position.set(-1.25, -1.15, 0.04);
scene.add(hlodFade);

const visibilityRange = new Mesh({
  geometry: new PlaneGeometry({ size: [2.1, 0.72] }),
  id: "visibility.range",
  material: calibrationMaterial("#fef3c7"),
});
visibilityRange.position.set(1.35, -1.15, 0.02);
scene.add(visibilityRange);

scene.add(new AmbientLight({ color: "#ffffff", id: "light.ambient", intensity: 0.82 }));

const camera = new OrthographicCamera({ far: 25, id: "camera.calibration", near: 0.1, size: 4.2 });
camera.position.set(0, 0, 5);
scene.add(camera);
scene.setActiveCamera(camera);

export default scene;
