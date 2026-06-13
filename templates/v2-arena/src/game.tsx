/** @jsxImportSource @threenative/r3f */
import {
  World,
  action,
  audioAsset,
  axis,
  boxCollider,
  capsuleCollider,
  commands,
  defineAudio,
  defineComponent,
  defineEvent,
  defineInputMap,
  defineResource,
  defineRuntimeConfig,
  fixedUpdate,
  keyboard,
  loopingMusic,
  oneShotSound,
  physics,
  pointerButton,
  rigidBody,
  touchControl,
} from "@threenative/sdk";
import { Bar, Button, Column, Text, TouchControl, Ui } from "@threenative/ui";

const Health = defineComponent("Health", { current: "number", max: "number" });
const Player = defineComponent("Player");
const Enemy = defineComponent("Enemy");
const GameState = defineResource("GameState", { phase: "string" });
const DamageEvent = defineEvent("DamageEvent", { amount: "number", target: "entity" });

const world = new World()
  .spawn("player", Player(), Health({ current: 100, max: 100 }))
  .spawn("enemy.0", Enemy(), Health({ current: 30, max: 30 }))
  .addResource(GameState({ phase: "playing" }))
  .addEvent(DamageEvent)
  .setInputMap(
    defineInputMap({
      actions: [action("Attack", [pointerButton(0), touchControl("attack")]), action("Pause", [keyboard("Escape"), touchControl("pause")])],
      axes: [
        axis("MoveX", { negative: [keyboard("KeyA"), touchControl("move.left")], positive: [keyboard("KeyD"), touchControl("move.right")] }),
        axis("MoveZ", { negative: [keyboard("KeyW"), touchControl("move.up")], positive: [keyboard("KeyS"), touchControl("move.down")] }),
      ],
    }),
  )
  .setRuntimeConfig(defineRuntimeConfig({ fixedDelta: 1 / 60, window: { width: 1280, height: 720, title: "ThreeNative V2 Arena" } }))
  .addSystem(
    fixedUpdate("applyDamage", {
      commands: [commands.setComponent("target", Health), commands.despawn("target")],
      eventReads: [DamageEvent],
      reads: [Health],
      writes: [Health],
      run(context: unknown) {
        return context;
      },
    }),
  );

const ui = Ui({
  id: "hud",
  children: Column({
    id: "hud.stack",
    children: [
      Text({ id: "hud.health.label", text: "Health" }),
      Bar({ id: "hud.health", max: 100, binding: { kind: "component", entity: "player", component: "Health", field: "current" } }),
      Button({ id: "hud.pause", label: "Pause", action: "Pause", focusable: true }),
      TouchControl({ id: "hud.attack", label: "Attack", action: "Attack" }),
    ],
  }),
});

const audio = defineAudio({
  music: [loopingMusic("music.arena", { asset: audioAsset("arena.music", "assets/arena.ogg") })],
  oneShots: [oneShotSound("sound.hit", { asset: audioAsset("hit.sound", "assets/hit.wav"), event: "DamageEvent" })],
});

export default {
  audio,
  ui,
  world,
  scene: (
    <scene id="arena.scene">
      <ambientLight id="light.ambient" intensity={0.35} />
      <directionalLight id="light.key" position={[3, 5, 4]} intensity={2} />
      <perspectiveCamera id="camera.follow" position={[0, 5, 7]} />
      <mesh id="arena.floor" physics={physics({ collider: boxCollider([8, 0.2, 8]) })} scale={[8, 0.2, 8]}>
        <boxGeometry size={[1, 1, 1]} />
        <meshStandardMaterial color="#2b6f5a" roughness={0.9} />
      </mesh>
      <mesh id="player" position={[0, 0.9, 0]} physics={physics({ body: rigidBody("kinematic", { velocity: [0, 0, 0] }), collider: capsuleCollider(0.35, 1.4) })}>
        <capsuleGeometry size={[0.7, 1.4, 0.7]} radius={0.35} />
        <meshStandardMaterial color="#f4d35e" roughness={0.65} />
      </mesh>
      <mesh id="enemy.0" position={[2.5, 0.7, -1.5]} physics={physics({ body: rigidBody("dynamic", { mass: 1 }), collider: capsuleCollider(0.3, 1.2) })}>
        <capsuleGeometry size={[0.6, 1.2, 0.6]} radius={0.3} />
        <meshStandardMaterial color="#ee6055" roughness={0.7} />
      </mesh>
    </scene>
  ),
};
