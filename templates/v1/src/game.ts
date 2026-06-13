import {
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from "@threenative/sdk";

const scene = new Scene({ id: "scene.main" });

const cube = new Mesh({
  id: "cube.main",
  geometry: new BoxGeometry({ size: [1, 1, 1] }),
  material: new MeshStandardMaterial({ color: "#2f80ed" }),
});
cube.position.set(0, 0, 0);
scene.add(cube);

const camera = new PerspectiveCamera({
  id: "camera.main",
  fovY: 60,
  near: 0.1,
  far: 100,
});
camera.position.set(0, 1.5, 4);
scene.add(camera);
scene.setActiveCamera(camera);

const light = new DirectionalLight({
  id: "light.key",
  color: "#ffffff",
  intensity: 2,
});
light.position.set(3, 4, 2);
scene.add(light);

export default scene;
