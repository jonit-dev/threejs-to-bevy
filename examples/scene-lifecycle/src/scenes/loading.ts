import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  defineScene,
  sceneTransition,
} from "@threenative/sdk";

const visual = new Scene({ id: "loading.visual" });
visual.add(new Mesh({
  geometry: new BoxGeometry({ size: [1.2, 1.2, 0.2] }),
  id: "loading.spinner",
  material: new MeshStandardMaterial({ color: "#5fd4ff" }),
}));
const camera = new PerspectiveCamera({ far: 100, fovY: 55, id: "loading.camera", near: 0.1 });
camera.position.set(0, 0, 4);
visual.add(camera);
visual.setActiveCamera(camera);

export const loadingScene = defineScene({
  id: "loading",
  kind: "loading",
  transitions: {
    enter: sceneTransition.instant(),
  },
  visual,
});
