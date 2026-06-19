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
  axis,
  boxCollider,
  capsuleCollider,
  commands,
  defineComponent,
  defineInputMap,
  defineQuery,
  defineResource,
  defineRuntimeConfig,
  fixedUpdate,
  keyboard,
  physics,
  rigidBody,
  touchControl,
} from "@threenative/sdk";
import { Bar, Button, Column, Text, TouchControl, Ui } from "@threenative/ui";

const RunnerBody = defineComponent("RunnerBody", {
  grounded: "boolean",
  lane: "integer",
  laneInputHeld: "boolean",
  yVelocity: "number",
  z: "number",
});
const Obstacle = defineComponent("Obstacle", {
  lane: "integer",
  z: "number",
});
const Pickup = defineComponent("Pickup", {
  lane: "integer",
  z: "number",
});
const RunnerState = defineResource("RunnerState", {
  distance: "number",
  health: "number",
  score: "integer",
  speed: "number",
});

const scene = new Scene({ id: "crystal-runner.scene" });

const laneX = [-2.2, 0, 2.2];
const obstacleSeeds = [
  { id: "obstacle.1", lane: 0, z: -8 },
  { id: "obstacle.2", lane: 2, z: -15 },
  { id: "obstacle.3", lane: 1, z: -23 },
];
const pickupSeeds = [
  { id: "pickup.1", lane: 2, z: -11 },
  { id: "pickup.2", lane: 0, z: -19 },
];

const track = new Mesh({
  geometry: new BoxGeometry({ size: [8, 0.2, 46] }),
  id: "track",
  material: new MeshStandardMaterial({ color: "#273447", roughness: 0.92 }),
  physics: physics({ collider: boxCollider([8, 0.2, 46]) }),
});
track.position.set(0, -0.1, -10);
scene.add(track);

for (const [index, x] of laneX.entries()) {
  const stripe = new Mesh({
    geometry: new BoxGeometry({ size: [0.08, 0.03, 46] }),
    id: `lane.${index}`,
    material: new MeshStandardMaterial({ color: index === 1 ? "#9fb3c8" : "#4d6480", roughness: 0.6 }),
  });
  stripe.position.set(x, 0.03, -10);
  scene.add(stripe);
}

const player = new Mesh({
  geometry: new CapsuleGeometry({ height: 1.35, radius: 0.34 }),
  id: "player",
  material: new MeshStandardMaterial({ color: "#67e8f9", roughness: 0.42 }),
  physics: physics({ body: rigidBody("kinematic", { velocity: [0, 0, 0] }), collider: capsuleCollider(0.34, 1.35) }),
});
player.position.set(0, 0.82, 2.5);
scene.add(player);

for (const seed of obstacleSeeds) {
  const obstacle = new Mesh({
    geometry: new BoxGeometry({ size: [1.05, 1.05, 1.05] }),
    id: seed.id,
    material: new MeshStandardMaterial({ color: "#ef476f", roughness: 0.7 }),
    physics: physics({ body: rigidBody("static"), collider: boxCollider([1.05, 1.05, 1.05]) }),
  });
  obstacle.position.set(laneX[seed.lane] ?? 0, 0.52, seed.z);
  scene.add(obstacle);
}

for (const seed of pickupSeeds) {
  const pickup = new Mesh({
    geometry: new BoxGeometry({ size: [0.62, 0.62, 0.62] }),
    id: seed.id,
    material: new MeshStandardMaterial({ color: "#ffd166", roughness: 0.35 }),
    physics: physics({ collider: boxCollider([0.62, 0.62, 0.62], { trigger: true }) }),
  });
  pickup.position.set(laneX[seed.lane] ?? 0, 0.55, seed.z);
  scene.add(pickup);
}

const camera = new PerspectiveCamera({ far: 90, fovY: 58, id: "camera.main", near: 0.1 });
camera.position.set(0, 4.2, 8.4);
camera.rotation.set(-0.42, 0, 0);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#b8c4d6", id: "light.ambient", intensity: 0.58 }));
const keyLight = new DirectionalLight({ color: "#fff4c2", id: "light.key", intensity: 2.6 });
keyLight.position.set(3, 7, 5);
scene.add(keyLight);

const input = defineInputMap({
  actions: [
    action("Jump", [keyboard("Space"), touchControl("jump")]),
    action("LaneLeft", [touchControl("lane.left")]),
    action("LaneRight", [touchControl("lane.right")]),
    action("Pause", [keyboard("Escape"), touchControl("pause")]),
  ],
  axes: [
    axis("MoveLane", {
      negative: [keyboard("KeyA"), keyboard("ArrowLeft")],
      positive: [keyboard("KeyD"), keyboard("ArrowRight")],
    }),
  ],
});

const world = new World()
  .spawn("player", RunnerBody({ grounded: true, lane: 1, laneInputHeld: false, yVelocity: 0, z: 2.5 }))
  .spawn("obstacle.1", Obstacle({ lane: 0, z: -8 }))
  .spawn("obstacle.2", Obstacle({ lane: 2, z: -15 }))
  .spawn("obstacle.3", Obstacle({ lane: 1, z: -23 }))
  .spawn("pickup.1", Pickup({ lane: 2, z: -11 }))
  .spawn("pickup.2", Pickup({ lane: 0, z: -19 }))
  .addResource(RunnerState({ distance: 0, health: 100, score: 0, speed: 7.5 }))
  .setInputMap(input)
  .setRuntimeConfig(defineRuntimeConfig({ fixedDelta: 1 / 60, window: { height: 720, title: "Crystal Runner", width: 1280 } }))
  .addSystem(
    fixedUpdate("runnerGameplay", {
      commands: [
        commands.setComponent("player", RunnerBody),
        commands.setComponent("obstacle.1", Obstacle),
        commands.setComponent("obstacle.2", Obstacle),
        commands.setComponent("obstacle.3", Obstacle),
        commands.setComponent("pickup.1", Pickup),
        commands.setComponent("pickup.2", Pickup),
      ],
      queries: [
        defineQuery({ with: [RunnerBody] }),
        defineQuery({ with: [Obstacle] }),
        defineQuery({ with: [Pickup] }),
      ],
      reads: [RunnerBody, Obstacle, Pickup, "Transform"],
      resourceReads: [RunnerState],
      resourceWrites: [RunnerState],
      writes: [RunnerBody, Obstacle, Pickup, "Transform"],
      run(context) {
        const lanes = [-2.2, 0, 2.2];
        const dt = context.time.fixedDelta;
        const gravity = -24;
        const jumpVelocity = 9.2;
        const playerEntity = context.query({ with: ["RunnerBody"], without: [] })[0];
        if (playerEntity === undefined) {
          return;
        }

        const state = context.resources.get("RunnerState") ?? { distance: 0, health: 100, score: 0, speed: 7.5 };
        const runner = playerEntity.get("RunnerBody");
        const laneInput = context.input.axis("MoveLane");
        const laneLeftPressed = laneInput < -0.5 || context.input.pressed("LaneLeft");
        const laneRightPressed = laneInput > 0.5 || context.input.pressed("LaneRight");
        const laneInputHeld = laneLeftPressed || laneRightPressed;
        let lane = runner.lane;
        if (!runner.laneInputHeld) {
          if (laneLeftPressed) {
            lane = Math.max(0, lane - 1);
          } else if (laneRightPressed) {
            lane = Math.min(2, lane + 1);
          }
        }

        let yVelocity = runner.yVelocity;
        let y = runner.grounded ? 0.82 : playerEntity.get("Transform").position[1];
        if (context.input.pressed("Jump") && runner.grounded) {
          yVelocity = jumpVelocity;
        }
        yVelocity += gravity * dt;
        y = Math.max(0.82, y + yVelocity * dt);
        const grounded = y <= 0.82;
        if (grounded) {
          yVelocity = 0;
        }

        playerEntity.patch("Transform", { position: [lanes[lane], y, runner.z] });
        playerEntity.patch("RunnerBody", { grounded, lane, laneInputHeld, yVelocity, z: runner.z });

        let score = state.score;
        let health = state.health;
        const speed = Math.min(14, state.speed + dt * 0.08);
        const distance = state.distance + speed * dt;

        const obstacleRows = context.query({ with: ["Obstacle"], without: [] });
        for (const obstacleEntity of obstacleRows) {
          const obstacle = obstacleEntity.get("Obstacle");
          let z = obstacle.z + speed * dt;
          let obstacleLane = obstacle.lane;
          if (z > 5) {
            z -= 26;
            obstacleLane = (obstacleLane + 1) % 3;
            score += 1;
          }
          if (Math.abs(z - runner.z) < 0.75 && obstacleLane === lane && y < 1.25) {
            health = Math.max(0, health - 1);
          }
          obstacleEntity.patch("Obstacle", { lane: obstacleLane, z });
          obstacleEntity.patch("Transform", { position: [lanes[obstacleLane], 0.52, z] });
        }

        const pickupRows = context.query({ with: ["Pickup"], without: [] });
        for (const pickupEntity of pickupRows) {
          const pickup = pickupEntity.get("Pickup");
          let z = pickup.z + speed * dt;
          let pickupLane = pickup.lane;
          if (Math.abs(z - runner.z) < 0.75 && pickupLane === lane) {
            score += 5;
            z -= 22;
            pickupLane = (pickupLane + 2) % 3;
          } else if (z > 5) {
            z -= 22;
            pickupLane = (pickupLane + 1) % 3;
          }
          pickupEntity.patch("Pickup", { lane: pickupLane, z });
          pickupEntity.patch("Transform", { position: [lanes[pickupLane], 0.55, z] });
        }

        context.resources.set("RunnerState", { distance, health, score, speed });
      },
    }),
  );

const ui = Ui({
  id: "hud",
  layout: { align: "start", padding: 16 },
  children: Column({
    id: "hud.stack",
    layout: { align: "stretch", rowGap: 8, width: 184 },
    children: [
      Text({ id: "hud.title", text: "Crystal Runner" }),
      Bar({ id: "hud.health", accessibilityLabel: "Health", binding: { kind: "resource", name: "RunnerState", field: "health" }, max: 100 }),
      Button({ action: "Pause", focusable: true, id: "hud.pause", label: "Pause", layout: { width: 184 } }),
      TouchControl({ action: "Jump", id: "hud.jump", label: "Jump", layout: { width: 184 } }),
      TouchControl({ action: "LaneLeft", id: "hud.left", label: "Left", layout: { width: 184 } }),
      TouchControl({ action: "LaneRight", id: "hud.right", label: "Right", layout: { width: 184 } }),
    ],
  }),
});

export default {
  input,
  scene,
  ui,
  world,
};
