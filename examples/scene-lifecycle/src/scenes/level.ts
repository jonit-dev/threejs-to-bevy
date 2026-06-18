import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  World,
  action,
  defineInputMap,
  defineResource,
  defineScene,
  keyboard,
  sceneTransition,
  update,
} from "@threenative/sdk";

const LevelProgress = defineResource("LevelProgress", { finished: "boolean" });

const visual = new Scene({ id: "level.visual" });
const floor = new Mesh({
  geometry: new BoxGeometry({ size: [6, 0.2, 6] }),
  id: "level.floor",
  material: new MeshStandardMaterial({ color: "#243b53" }),
});
floor.position.set(0, -0.1, 0);
visual.add(floor);
const player = new Mesh({
  geometry: new BoxGeometry({ size: [0.7, 1.4, 0.7] }),
  id: "level.player",
  material: new MeshStandardMaterial({ color: "#f4d35e" }),
});
player.position.set(0, 0.7, 0);
visual.add(player);
const camera = new PerspectiveCamera({ far: 100, fovY: 60, id: "level.camera", near: 0.1 });
camera.position.set(0, 3, 6);
visual.add(camera);
visual.setActiveCamera(camera);

const input = defineInputMap({
  actions: [
    action("Pause", [keyboard("Escape")]),
    action("Finish", [keyboard("KeyF")]),
  ],
  axes: [],
});

const world = new World()
  .addResource(LevelProgress({ finished: false }))
  .setInputMap(input)
  .addSystem(
    update("levelActions", {
      services: ["scene.change", "scene.push"],
      run(context) {
        if (context.input.action("Pause")) {
          context.scenes.push("pause");
        }
        if (context.input.action("Finish")) {
          context.scenes.change("credits");
        }
      },
    }),
  );

export const levelScene = defineScene({
  id: "level",
  input,
  kind: "level",
  persistence: {
    keepResources: ["LevelProgress"],
  },
  transitions: {
    enter: sceneTransition.loadingScreen({ scene: "loading" }),
    exit: sceneTransition.fade({ color: "#000000", durationMs: 150 }),
  },
  visual,
  world,
});
