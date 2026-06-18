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
  sceneTransition,
  update,
} from "@threenative/sdk";

const visual = new Scene({ id: "menu.visual" });
const logo = new Mesh({
  geometry: new BoxGeometry({ size: [2.4, 0.4, 0.2] }),
  id: "menu.logo",
  material: new MeshStandardMaterial({ color: "#44aa88" }),
});
visual.add(logo);
const camera = new PerspectiveCamera({ far: 100, fovY: 55, id: "menu.camera", near: 0.1 });
camera.position.set(0, 1.5, 5);
visual.add(camera);
visual.setActiveCamera(camera);

const input = defineInputMap({
  actions: [action("Start", [keyboard("Enter")])],
  axes: [],
});

const world = new World()
  .setInputMap(input)
  .addSystem(
    update("menuActions", {
      services: ["scene.change"],
      run(context) {
        if (context.input.action("Start")) {
          context.scenes.change("level");
        }
      },
    }),
  );

export const menuScene = defineScene({
  id: "menu",
  input,
  kind: "menu",
  transitions: {
    exit: sceneTransition.fade({ color: "#000000", durationMs: 150 }),
  },
  visual,
  world,
});
