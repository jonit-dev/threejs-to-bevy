import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  World,
  action,
  defineInputMap,
  defineScene,
  keyboard,
  update,
} from "@threenative/sdk";

const visual = new Scene({ id: "pause.visual" });
visual.add(new Mesh({
  geometry: new BoxGeometry({ size: [2, 1, 0.2] }),
  id: "pause.panel",
  material: new MeshStandardMaterial({ color: "#ee6055" }),
}));
const camera = new PerspectiveCamera({ far: 100, fovY: 55, id: "pause.camera", near: 0.1 });
camera.position.set(0, 0, 4);
visual.add(camera);
visual.setActiveCamera(camera);

const input = defineInputMap({
  actions: [action("Resume", [keyboard("Enter")])],
  axes: [],
});

const world = new World()
  .setInputMap(input)
  .addSystem(
    update("pauseActions", {
      services: ["scene.pop"],
      run(context) {
        if (context.input.action("Resume")) {
          context.scenes.pop();
        }
      },
    }),
  );

export const pauseScene = defineScene({
  id: "pause",
  input,
  kind: "overlay",
  visual,
  world,
});
