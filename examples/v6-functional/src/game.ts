import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
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
  pointerAxis,
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
    animationClip("run", { loop: true, sourceClip: "Armature|Run", speed: 1.1 }),
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
    axis("LookX", { value: pointerAxis("deltaX") }),
    axis("LookY", { value: pointerAxis("deltaY") }),
  ],
});

const scene = new Scene({ id: "v6.functional.scene" });

const floor = new Mesh({
  id: "arena.floor",
  geometry: new BoxGeometry({ size: [8, 0.2, 8] }),
  material: new MeshStandardMaterial({ color: "#2b6f5a", roughness: 0.9 }),
  physics: physics({ collider: boxCollider([8, 0.2, 8]) }),
});
floor.position.set(0, -0.1, 0);
scene.add(floor);

const player = new Mesh({
  assetRefs: [heroModel],
  geometry: new CapsuleGeometry({ height: 1.4, radius: 0.35 }),
  id: "player",
  material: new MeshStandardMaterial({ color: "#f4d35e", roughness: 0.65 }),
  physics: physics({ body: rigidBody("kinematic", { velocity: [0, 0, 0] }), collider: capsuleCollider(0.35, 1.4) }),
});
player.position.set(0, 0.9, 0);
scene.add(player);

const pickup = new Mesh({
  geometry: new BoxGeometry({ size: [0.5, 0.5, 0.5] }),
  id: "pickup.health",
  material: new MeshStandardMaterial({ color: "#5fd4ff", roughness: 0.45 }),
  physics: physics({ collider: boxCollider([0.5, 0.5, 0.5], { trigger: true }) }),
});
pickup.position.set(2.25, 0.25, -1.5);
scene.add(pickup);

const obstacle = new Mesh({
  geometry: new BoxGeometry({ size: [1, 1, 1] }),
  id: "arena.obstacle",
  material: new MeshStandardMaterial({ color: "#ee6055", roughness: 0.7 }),
  physics: physics({ body: rigidBody("static"), collider: boxCollider([1, 1, 1]) }),
});
obstacle.position.set(-2.1, 0.5, -1.2);
scene.add(obstacle);

const camera = new PerspectiveCamera({ far: 100, fovY: 60, id: "camera.main", near: 0.1 });
camera.position.set(0, 3.2, 6.5);
scene.add(camera);
scene.setActiveCamera(camera);

const keyLight = new DirectionalLight({ color: "#fff1bf", id: "light.key", intensity: 2.4 });
keyLight.position.set(3, 5, 4);
scene.add(new AmbientLight({ color: "#8fb2a5", id: "light.ambient", intensity: 0.45 }));
scene.add(keyLight);
scene.add(new Object3D({ id: "proof.anchor", assetRefs: [heroModel] }));

const world = new World()
  .spawn("player", Player(), Health({ current: 100, max: 100 }), characterController({ interactAction: "Attack", speed: 5 }))
  .addResource(GameState({ phase: "playing", score: 0 }))
  .addEvent(DamageEvent)
  .setInputMap(input)
  .setRuntimeConfig(defineRuntimeConfig({ fixedDelta: 1 / 60, window: { height: 720, title: "ThreeNative V6 Functional", width: 1280 } }))
  .addSystem(
    startup("seedDamageEvent", {
      commands: [commands.emitEvent(DamageEvent)],
      eventWrites: [DamageEvent],
      run(context) {
        context.events.emit(DamageEvent, { amount: 1, target: "player" });
      },
    }),
  )
  .addSystem(
    update("v6ProofLoop", {
      commands: [commands.emitEvent(DamageEvent)],
      eventWrites: [DamageEvent],
      queries: [defineQuery({ with: [Player, Health] })],
      reads: [Player, Health],
      services: ["animation.play", "physics.raycast"],
      run(context) {
        const moving = context.input.axis("MoveX") !== 0 || context.input.axis("MoveZ") !== 0;
        context.animation.play("player", moving ? "run" : "idle", { loop: true });
        const hit = context.physics.raycast({ direction: [0, -1, 0], maxDistance: 2, origin: [0, 1, 0] });
        if (context.input.action("Attack") || hit.hit) {
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
      Text({ id: "hud.health.label", text: "Health" }),
      Bar({ id: "hud.health", binding: { kind: "component", component: "Health", entity: "player", field: "current" }, max: 100 }),
      Button({ action: "Pause", focusable: true, id: "hud.pause", label: "Pause" }),
      TouchControl({ action: "Attack", id: "hud.attack", label: "Attack" }),
    ],
  }),
});

const audio = defineAudio({
  music: [loopingMusic("music.v6.loop", { asset: audioAsset("arena.music", "assets/arena.ogg") })],
  oneShots: [oneShotSound("sound.hit", { asset: audioAsset("hit.sound", "assets/hit.wav"), event: "DamageEvent" })],
});

export default {
  audio,
  input,
  scene,
  ui,
  world,
};
