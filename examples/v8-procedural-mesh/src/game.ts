import {
  AmbientLight,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  pineTree,
} from "@threenative/sdk";

const scene = new Scene({ id: "v8.procedural.mesh.scene" });

const pine = new Mesh({
  geometry: pineTree({ id: "prop.tree.pine", seed: 12 }),
  id: "prop.tree.pine",
  material: new MeshStandardMaterial({ color: "#ffffff", roughness: 0.82 }),
});
scene.add(pine);

const camera = new OrthographicCamera({ far: 20, id: "camera.procedural", near: 0.1, size: 2.8 });
camera.position.set(0, 1.15, 5);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#ffffff", id: "light.ambient", intensity: 0.65 }));
const key = new DirectionalLight({ color: "#ffffff", id: "light.key", intensity: 1.35 });
key.position.set(2, 4, 3);
scene.add(key);

export default scene;
