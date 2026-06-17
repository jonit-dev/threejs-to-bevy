import {
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  World,
  defineGame,
  defineRuntimeConfig,
} from "@threenative/sdk";

const scene = new Scene({ id: "v10.visual.calibration.post.scene" });

function calibrationMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, metalness: 0, roughness: 1 });
}

const bloomHighlight = new Mesh({
  geometry: new PlaneGeometry({ size: [1.2, 0.9] }),
  id: "bloom.highlight",
  material: new MeshStandardMaterial({
    color: "#fff4b8",
    emissive: "#ffe066",
    emissiveBloom: { enabled: true, intensity: 0, threshold: 1 },
    emissiveIntensity: 1,
    metalness: 0,
    roughness: 0.55,
  }),
});
bloomHighlight.position.set(-1.6, 0.7, 0);
scene.add(bloomHighlight);

const msaaEdge = new Mesh({
  geometry: new PlaneGeometry({ size: [1.5, 0.12] }),
  id: "msaa.edge",
  material: calibrationMaterial("#eef2ff"),
});
msaaEdge.position.set(0.2, -0.2, 0.05);
msaaEdge.rotation.z = 0.58;
scene.add(msaaEdge);

const dofReportOnly = new Mesh({
  geometry: new PlaneGeometry({ size: [1.0, 0.75] }),
  id: "dof.report.only",
  material: calibrationMaterial("#94a3b8"),
});
dofReportOnly.position.set(1.8, 0.8, -0.3);
scene.add(dofReportOnly);

const taaReportOnly = new Mesh({
  geometry: new PlaneGeometry({ size: [1.0, 0.75] }),
  id: "taa.report.only",
  material: calibrationMaterial("#8ecae6"),
});
taaReportOnly.position.set(1.8, -0.8, -0.2);
scene.add(taaReportOnly);

const camera = new OrthographicCamera({ far: 25, id: "camera.calibration", near: 0.1, size: 3.8 });
camera.position.set(0, 0, 5);
scene.add(camera);
scene.setActiveCamera(camera);

const world = new World();

export default defineGame({
  runtimeConfig: defineRuntimeConfig({
    renderer: {
      antialias: "msaa4",
      bloom: { enabled: true, intensity: 0, threshold: 1 },
      depthOfField: { enabled: true, focusDistance: 5, focalLength: 35, fStop: 5.6 },
      taa: { enabled: true, feedback: 0.85 },
    },
    window: { title: "V10 Visual Calibration Post" },
  }),
  scene,
  world,
});
