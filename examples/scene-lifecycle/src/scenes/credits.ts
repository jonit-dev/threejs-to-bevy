import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  defineScene,
  sceneTransition,
} from "@threenative/sdk";

const visual = new Scene({ id: "credits.visual" });
visual.add(new Mesh({
  geometry: new BoxGeometry({ size: [2, 0.5, 0.2] }),
  id: "credits.banner",
  material: new MeshStandardMaterial({ color: "#c084fc" }),
}));
const camera = new PerspectiveCamera({ far: 100, fovY: 55, id: "credits.camera", near: 0.1 });
camera.position.set(0, 1, 4);
visual.add(camera);
visual.setActiveCamera(camera);

export const creditsScene = defineScene({
  id: "credits",
  kind: "credits",
  transitions: {
    enter: sceneTransition.fade({ color: "#000000", durationMs: 150 }),
  },
  visual,
});
