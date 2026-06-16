import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  World,
  action,
  commands,
  defineComponent,
  defineEvent,
  defineInputMap,
  defineResource,
  defineRuntimeConfig,
  keyboard,
  overlay,
  pointerButton,
  startup,
  update,
} from "@threenative/sdk";
import { Bar, Button, Column, Text, Ui } from "@threenative/ui";

const Player = defineComponent("Player");
const Health = defineComponent("Health", { current: "number", max: "number" });
const Inventory = defineResource("Inventory", { gold: "integer", selected: "string" });
const UseItemEvent = defineEvent("UseItemEvent", { itemId: "string" });

const input = defineInputMap({
  actions: [
    action("Use", [pointerButton(0)]),
    action("Inventory", [keyboard("KeyI")]),
  ],
  axes: [],
});

const scene = new Scene({ id: "v8.overlay.scene" });

const floor = new Mesh({
  geometry: new BoxGeometry({ size: [8, 0.2, 8] }),
  id: "arena.floor",
  material: new MeshStandardMaterial({ color: "#263238", roughness: 0.9 }),
});
floor.position.set(0, -0.1, 0);
scene.add(floor);

const player = new Mesh({
  geometry: new BoxGeometry({ size: [0.8, 1.4, 0.8] }),
  id: "player",
  material: new MeshStandardMaterial({ color: "#4fc3f7", roughness: 0.55 }),
});
player.position.set(0, 0.7, 0);
scene.add(player);

const chest = new Mesh({
  geometry: new BoxGeometry({ size: [0.8, 0.6, 0.6] }),
  id: "loot.chest",
  material: new MeshStandardMaterial({ color: "#ffca28", roughness: 0.45 }),
});
chest.position.set(1.8, 0.3, -1.2);
scene.add(chest);

const camera = new PerspectiveCamera({ far: 80, fovY: 54, id: "camera.main", near: 0.1 });
camera.position.set(0, 3.2, 6);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#b0bec5", id: "light.ambient", intensity: 0.55 }));
const keyLight = new DirectionalLight({ color: "#fff8e1", id: "light.key", intensity: 2.4 });
keyLight.position.set(3, 5, 4);
scene.add(keyLight);

const world = new World()
  .spawn("player", Player(), Health({ current: 72, max: 100 }))
  .addResource(Inventory({ gold: 42, selected: "potion" }))
  .addEvent(UseItemEvent)
  .setInputMap(input)
  .setRuntimeConfig(defineRuntimeConfig({ fixedDelta: 1 / 60, window: { height: 720, title: "ThreeNative V8 Overlay Webview", width: 1280 } }))
  .addSystem(
    startup("seedInventory", {
      commands: [commands.emitEvent(UseItemEvent)],
      eventWrites: [UseItemEvent],
      run(context) {
        context.events.emit(UseItemEvent, { itemId: "potion" });
      },
    }),
  )
  .addSystem(
    update("inventoryProofLoop", {
      commands: [commands.emitEvent(UseItemEvent)],
      eventWrites: [UseItemEvent],
      resourceReads: [Inventory],
      run(context) {
        if (context.input.action("Use")) {
          context.events.emit(UseItemEvent, { itemId: "potion" });
        }
      },
    }),
  );

const ui = Ui({
  id: "hud",
  children: Column({
    id: "hud.stack",
    layout: { inset: { left: 24, top: 24 }, padding: 0, position: "absolute", rowGap: 8, width: 520 },
    children: [
      Text({ id: "hud.title", style: { color: "#eef7f2", fontSize: 18, fontWeight: "bold" }, text: "V8 Overlay Inventory" }),
      Bar({
        id: "hud.health",
        accessibilityLabel: "Health",
        binding: { kind: "component", component: "Health", entity: "player", field: "current" },
        layout: { height: 12, width: 160 },
        max: 100,
        style: { backgroundColor: "#10161b", borderColor: "#2f3a44", borderWidth: 1, color: "#38bd69" },
        value: 72,
      }),
      Text({ id: "hud.tip", style: { color: "#eef7f2", fontSize: 18, fontWeight: "bold" }, text: "Retained HUD + optional web overlay" }),
      Button({
        action: "Inventory",
        focusable: true,
        id: "hud.inventory",
        label: "Inventory",
        layout: { height: 42, width: 320 },
        style: { backgroundColor: "#2a2f38", borderColor: "#2f3a44", borderRadius: 0, borderWidth: 0, color: "#eef7f2", fontSize: 18, fontWeight: "bold", textAlign: "left" },
      }),
    ],
  }),
});

const inventoryOverlay = overlay.mount({
  assets: [
    "overlay/dist/assets/inventory-react.js",
    "overlay/dist/assets/inventory.css",
    "overlay/dist/key.svg",
    "overlay/dist/potion.svg",
    "overlay/dist/shield.svg",
  ],
  entry: "overlay/dist/index.html",
  id: "inventory",
  input: "pointer",
  messages: {
    gameToOverlay: [
      { name: "inventory:snapshot", schema: { kind: "object", fields: { gold: "integer", selected: "string" }, required: ["gold", "selected"] } },
    ],
    overlayToGame: [
      { name: "inventory:use-item", schema: { kind: "object", fields: { itemId: "string" }, required: ["itemId"] } },
    ],
  },
  targetProfiles: ["web", "desktop"],
  transparent: true,
  zIndex: 40,
});

export default {
  input,
  overlay: inventoryOverlay,
  scene,
  ui,
  world,
};
