import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  World,
  action,
  animationClip,
  audioAsset,
  axis,
  boxCollider,
  capsuleCollider,
  characterController,
  commands,
  defineAudio,
  defineComponent,
  defineEvent,
  defineInputMap,
  defineQuery,
  defineResource,
  defineRuntimeConfig,
  keyboard,
  loopingMusic,
  modelAsset,
  oneShotSound,
  physics,
  pointerButton,
  rigidBody,
  startup,
  touchControl,
  update,
} from "@threenative/sdk";
import { Bar, Button, Column, Text, TouchControl, Ui } from "@threenative/ui";

const Health = defineComponent("Health", { current: "number", max: "number" });
const Player = defineComponent("Player");
const GameState = defineResource("GameState", { phase: "string", score: "number" });
const DamageEvent = defineEvent("DamageEvent", { amount: "number", target: "entity" });

const heroModel = modelAsset("model.hero", "assets/hero.glb", {
  animations: [
    animationClip("idle", { loop: true }),
    animationClip("dash", { loop: false, sourceClip: "Armature|Dash", speed: 1.25 }),
  ],
});

const input = defineInputMap({
  actions: [
    action("Attack", [pointerButton(0), touchControl("attack")]),
    action("Pause", [keyboard("Escape"), touchControl("pause")]),
  ],
  axes: [
    axis("MoveX", { negative: [keyboard("KeyA"), touchControl("move.left")], positive: [keyboard("KeyD"), touchControl("move.right")] }),
    axis("MoveZ", { negative: [keyboard("KeyW"), touchControl("move.up")], positive: [keyboard("KeyS"), touchControl("move.down")] }),
  ],
});

const scene = new Scene({ id: "v7.functional.scene" });

const floor = new Mesh({
  geometry: new BoxGeometry({ size: [9, 0.2, 9] }),
  id: "arena.floor",
  material: new MeshStandardMaterial({ color: "#243b53", roughness: 0.9 }),
  physics: physics({ collider: boxCollider([9, 0.2, 9]) }),
});
floor.position.set(0, -0.1, 0);
scene.add(floor);

const player = new Mesh({
  assetRefs: [heroModel],
  geometry: new CapsuleGeometry({ height: 1.45, radius: 0.35 }),
  id: "player",
  material: new MeshStandardMaterial({ color: "#f4d35e", roughness: 0.55 }),
  physics: physics({ body: rigidBody("kinematic", { velocity: [0, 0, 0] }), collider: capsuleCollider(0.35, 1.45) }),
});
player.position.set(0, 0.9, 0);
scene.add(player);

const pickup = new Mesh({
  geometry: new BoxGeometry({ size: [0.55, 0.55, 0.55] }),
  id: "pickup.v7",
  material: new MeshStandardMaterial({ color: "#34a853", roughness: 0.45 }),
  physics: physics({ collider: boxCollider([0.55, 0.55, 0.55], { trigger: true }) }),
});
pickup.position.set(2.2, 0.28, -1.4);
scene.add(pickup);

const camera = new PerspectiveCamera({ far: 100, fovY: 58, id: "camera.main", near: 0.1 });
camera.position.set(0, 3, 6);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#9fb3c8", id: "light.ambient", intensity: 0.4 }));
const keyLight = new DirectionalLight({ color: "#fff1bf", id: "light.key", intensity: 2.2 });
keyLight.position.set(3, 5, 4);
scene.add(keyLight);

const world = new World()
  .spawn("player", Player(), Health({ current: 100, max: 100 }), characterController({ interactAction: "Attack", speed: 5 }))
  .addResource(GameState({ phase: "playing", score: 0 }))
  .addEvent(DamageEvent)
  .setInputMap(input)
  .setRuntimeConfig(defineRuntimeConfig({ fixedDelta: 1 / 60, window: { height: 720, title: "ThreeNative V7 Functional", width: 1280 } }))
  .addSystem(
    startup("seedV7DamageEvent", {
      commands: [commands.emitEvent(DamageEvent)],
      eventWrites: [DamageEvent],
      run(context) {
        context.events.emit(DamageEvent, { amount: 1, target: "player" });
      },
    }),
  )
  .addSystem(
    update("v7ProofLoop", {
      commands: [commands.emitEvent(DamageEvent)],
      eventWrites: [DamageEvent],
      queries: [defineQuery({ with: [Player, Health] })],
      reads: [Player, Health],
      services: ["animation.play"],
      run(context) {
        const attacking = context.input.action("Attack");
        context.animation.play("player", attacking ? "dash" : "idle", { loop: !attacking });
        if (attacking) {
          context.events.emit(DamageEvent, { amount: 1, target: "player" });
        }
      },
    }),
  );

const ui = Ui({
  id: "hud",
  children: Column({
    id: "hud.stack",
    children: [
      Text({ id: "hud.title", text: "V7 Functional" }),
      Bar({ id: "hud.health", binding: { kind: "component", component: "Health", entity: "player", field: "current" }, max: 100 }),
      Button({ action: "Pause", focusable: true, id: "hud.pause", label: "Pause" }),
      TouchControl({ action: "Attack", id: "hud.attack", label: "Attack" }),
    ],
  }),
});

const audio = defineAudio({
  music: [loopingMusic("music.v7.loop", { asset: audioAsset("arena.music", "assets/arena.ogg") })],
  oneShots: [oneShotSound("sound.hit", { asset: audioAsset("hit.sound", "assets/hit.wav"), event: "DamageEvent" })],
});

export default {
  audio,
  input,
  scene,
  ui,
  world,
};
