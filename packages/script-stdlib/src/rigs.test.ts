import assert from "node:assert/strict";
import test from "node:test";

import { CameraRig, CharacterRig, RespawnEx } from "./rigs.js";
import { Quat } from "./rotation.js";
import type { QuatTuple, Vec3Tuple } from "./types.js";
import { Vec3 } from "./vectors.js";

interface IFakeEntity {
  id: string;
  position: Vec3Tuple;
  rotation: QuatTuple;
  components: Record<string, unknown>;
  transform(): {
    positionOr(fallback: Vec3Tuple): Vec3Tuple;
    setPose(position: Vec3Tuple, rotation: QuatTuple): void;
    yawOr(fallback: number): number;
  };
  get<T = unknown>(component: string): T | undefined;
  patch(component: string, value: unknown): void;
}

function createEntity(id: string, position: Vec3Tuple): IFakeEntity {
  const entity: IFakeEntity = {
    id,
    position,
    rotation: Quat.identity(),
    components: {},
    transform() {
      return {
        positionOr: (fallback) => entity.position ?? fallback,
        setPose: (nextPosition, nextRotation) => {
          entity.position = nextPosition;
          entity.rotation = nextRotation;
        },
        yawOr: (fallback) => Quat.yaw(entity.rotation, fallback),
      };
    },
    get(component) {
      return entity.components[component] as never;
    },
    patch(component, value) {
      entity.components[component] = value;
    },
  };
  return entity;
}

interface IFakeContext {
  entities: Map<string, IFakeEntity>;
  resourceStore: Map<string, object>;
  axes: Record<string, number>;
  actions: Record<string, boolean>;
  elapsed: number;
  fixedDelta: number;
  raycastResult: { distance?: number; hit?: boolean } | null;
  raycastCalls: Array<{ direction: Vec3Tuple; ignore?: readonly string[]; mask?: readonly string[]; maxDistance?: number; origin: Vec3Tuple }>;
  entity(id: string): IFakeEntity | undefined;
  input: { axis(name: string): number; action(name: string): boolean };
  character: { move(entityRef: string | IFakeEntity, options: { direction?: [number, number]; fixedDelta?: number; speed?: number }): { pushed?: { entity: string; position: Vec3Tuple }; resolved: Vec3Tuple } };
  resources: { set(name: string, value: unknown): void };
  physics: { raycast(options: { direction: Vec3Tuple; ignore?: readonly string[]; mask?: readonly string[]; maxDistance?: number; origin: Vec3Tuple }): { distance?: number; hit?: boolean } | null };
  state<T extends object>(key: string, defaults: T): T;
  time: { delta: number; elapsed: number; fixedDelta: number };
}

function createContext(entities: IFakeEntity[]): IFakeContext {
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const resourceStore = new Map<string, object>();
  const context: IFakeContext = {
    entities: entityMap,
    resourceStore,
    axes: {},
    actions: {},
    elapsed: 0,
    fixedDelta: 1 / 60,
    raycastResult: null,
    raycastCalls: [],
    entity(id) {
      return entityMap.get(id);
    },
    input: {
      axis: (name) => context.axes[name] ?? 0,
      action: (name) => context.actions[name] ?? false,
    },
    character: {
      move(entityRef, options) {
        const entity = typeof entityRef === "string" ? entityMap.get(entityRef) : entityRef;
        const start = entity?.position ?? [0, 0, 0];
        const [dx, dz] = options.direction ?? [0, 0];
        const speed = options.speed ?? 0;
        const dt = options.fixedDelta ?? 0;
        const resolved: Vec3Tuple = [start[0] + dx * speed * dt, start[1], start[2] + dz * speed * dt];
        return { resolved };
      },
    },
    resources: {
      set(name, value) {
        resourceStore.set(name, value as object);
      },
    },
    physics: {
      raycast(options) {
        context.raycastCalls.push(options);
        return context.raycastResult;
      },
    },
    state(key, defaults) {
      if (!resourceStore.has(key)) {
        resourceStore.set(key, { ...defaults });
      }
      return resourceStore.get(key) as never;
    },
    time: {
      delta: 1 / 60,
      elapsed: 0,
      get fixedDelta() {
        return context.fixedDelta;
      },
    },
  };
  return context;
}

function stepMoveForward(context: IFakeContext, player: IFakeEntity, ticks: number, cameraYaw: number): void {
  context.axes.MoveZ = 1;
  for (let i = 0; i < ticks; i += 1) {
    CharacterRig.update(context as never, player, {
      cameraYaw,
      forwardAxis: "-z",
      maxTurnSpeed: 20,
      walkSpeed: 3,
    });
  }
}

function roundNumber(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

test("CharacterRig.update: forwardAxis -z faces the mesh toward its actual movement direction", () => {
  const player = createEntity("player", [0, 0, 0]);
  const context = createContext([player]);

  stepMoveForward(context, player, 90, 0);

  // Moving straight "up" (MoveZ=1) with cameraYaw=0 should walk toward +Z.
  assert.ok(player.position[2] > 0, `expected forward motion along +Z, got ${player.position[2]}`);
  assert.ok(Math.abs(player.position[0]) < 1e-6, `expected no lateral drift, got ${player.position[0]}`);

  // The mesh's actual local -Z axis (its rest-pose facing) rotated by the
  // resulting quaternion must point along the world direction the character
  // actually walked in -- i.e. the model's back should not face the direction
  // of travel.
  const worldFacing = Quat.rotateVec3(player.rotation, [0, 0, -1]);
  const travelDirection = Vec3.normalize(player.position);
  assert.ok(Vec3.dot(worldFacing, travelDirection) > 0.99, `mesh facing ${worldFacing} should align with travel direction ${travelDirection}`);
});

test("CharacterRig.update: rig.yaw stays in the plain library convention regardless of forwardAxis", () => {
  const plain = createEntity("plain", [0, 0, 0]);
  const flipped = createEntity("flipped", [0, 0, 0]);
  const context = createContext([plain, flipped]);
  context.axes.MoveZ = 1;

  let plainResult;
  let flippedResult;
  for (let i = 0; i < 30; i += 1) {
    plainResult = CharacterRig.update(context as never, plain, { forwardAxis: "+z", maxTurnSpeed: 20, walkSpeed: 3 });
    flippedResult = CharacterRig.update(context as never, flipped, { forwardAxis: "-z", maxTurnSpeed: 20, walkSpeed: 3 });
  }

  // Both meshes were driven by the same raw input and should report the same
  // plain-convention yaw, even though forwardAxis differs -- forwardAxis must
  // only affect the mesh quaternion, never the returned/stored yaw.
  assert.ok(Math.abs((plainResult?.yaw ?? 0) - (flippedResult?.yaw ?? 0)) < 1e-6, `yaw should match across forwardAxis: ${plainResult?.yaw} vs ${flippedResult?.yaw}`);
});

test("CharacterRig.update: applies character push trace to the pushed entity transform", () => {
  const player = createEntity("player", [0, 0, 0]);
  const ball = createEntity("ball.push.01", [1, 0.35, 0]);
  const context = createContext([player, ball]);
  context.axes.MoveX = 1;
  context.character.move = () => ({ pushed: { entity: "ball.push.01", position: [1.4, 0.35, 0] }, resolved: [0.2, 0, 0] });

  const result = CharacterRig.update(context as never, player, { maxTurnSpeed: 20, walkSpeed: 3 });

  assert.deepEqual(ball.position, [1.4, 0.35, 0]);
  assert.deepEqual(result.pushed, { entity: "ball.push.01", position: [1.4, 0.35, 0] });
  assert.deepEqual(player.position, [0.2, 0, 0]);
});

test("CameraRig.thirdPerson: camera sits behind the target and looks at it, tracking target yaw", () => {
  const player = createEntity("player", [0, 0, 0]);
  const camera = createEntity("camera.main", [0, 0, 0]);
  const context = createContext([player, camera]);

  const rig = CameraRig.thirdPerson(context as never, {
    cameraId: "camera.main",
    offset: [0, 1, -6],
    target: player,
    yaw: 0,
  });

  assert.equal(rig.yaw, 0);
  // Camera should end up behind the target along -Z (yaw 0 => forward +Z).
  assert.ok(camera.position[2] < 0, `expected camera behind target on -Z, got ${camera.position[2]}`);
  // Camera poses follow the glTF/three.js convention where local -Z is the
  // look direction.
  const lookDirection = Quat.rotateVec3(camera.rotation, [0, 0, -1]);
  assert.ok(lookDirection[2] > 0.9, `camera should look back toward +Z (the target), got ${lookDirection}`);
});

test("CameraRig.orbitThirdPerson: should update orbit yaw and pitch from look axes", () => {
  const player = createEntity("player", [0, 0, 0]);
  const camera = createEntity("camera.main", [0, 0, 0]);
  const context = createContext([player, camera]);
  context.axes.LookX = 100;
  context.axes.LookY = 100;

  const rig = CameraRig.orbitThirdPerson(context as never, {
    cameraId: "camera.main",
    distance: 5.2,
    input: {
      maxAxisMagnitude: 100,
      maxPitchStep: 0.045,
      maxYawStep: 0.07,
      pitchSensitivity: 0.0012,
      yawSensitivity: 0.002,
    },
    lookHeight: 1.45,
    pitch: { default: 0.28, min: 0.12, max: 0.62 },
    target: player,
  });

  assert.equal(roundNumber(rig.yaw, 6), roundNumber(Math.PI - 0.07, 6));
  assert.equal(roundNumber(rig.pitch, 6), 0.235);
  assert.deepEqual(Vec3.round(rig.target, 6), [0, 1.45, 0]);
});

test("CameraRig.orbitThirdPerson: should clamp orbit pitch", () => {
  const player = createEntity("player", [0, 0, 0]);
  const camera = createEntity("camera.main", [0, 0, 0]);
  const context = createContext([player, camera]);
  context.axes.LookY = -100;

  const rig = CameraRig.orbitThirdPerson(context as never, {
    cameraId: "camera.main",
    input: { maxAxisMagnitude: 100, maxPitchStep: 1, pitchSensitivity: 1 },
    pitch: { default: 0.28, min: 0.12, max: 0.62 },
    target: player,
  });

  assert.equal(rig.pitch, 0.62);
});

test("CameraRig.orbitThirdPerson: should shorten orbit camera when raycast hits", () => {
  const player = createEntity("player", [0, 0, 0]);
  const camera = createEntity("camera.main", [0, 0, 0]);
  const context = createContext([player, camera]);
  context.raycastResult = { distance: 2.1, hit: true };

  const rig = CameraRig.orbitThirdPerson(context as never, {
    cameraId: "camera.main",
    collision: { ignore: ["player"], mask: ["world", "pushable"], padding: 0.28 },
    distance: 5.2,
    minDistance: 1.35,
    pitch: { default: 0.28, min: 0.12, max: 0.62 },
    rounding: { positionDigits: 5, rotationDigits: 5 },
    target: player,
  });

  assert.equal(rig.collided, true);
  assert.equal(roundNumber(rig.distance, 6), 1.82);
  assert.deepEqual(rig.position, Vec3.round(rig.position, 5));
  assert.deepEqual(camera.rotation, [
    roundNumber(camera.rotation[0], 5),
    roundNumber(camera.rotation[1], 5),
    roundNumber(camera.rotation[2], 5),
    roundNumber(camera.rotation[3], 5),
  ]);
  assert.equal(context.raycastCalls[0]?.maxDistance, 5.2);
  assert.deepEqual(context.raycastCalls[0]?.ignore, ["player"]);
  assert.deepEqual(context.raycastCalls[0]?.mask, ["world", "pushable"]);
});

test("Coordination: should move forward relative to orbit camera yaw", () => {
  const player = createEntity("player", [0, 0, 0]);
  const camera = createEntity("camera.main", [0, 0, 0]);
  const context = createContext([player, camera]);
  context.axes.MoveZ = 1;
  const cameraResult = CameraRig.orbitThirdPerson(context as never, {
    cameraId: "camera.main",
    distance: 5,
    target: player,
    yaw: 0,
  });

  for (let i = 0; i < 30; i += 1) {
    CharacterRig.update(context as never, player, {
      cameraYaw: cameraResult.yaw,
      forwardAxis: "-z",
      maxTurnSpeed: 20,
      walkSpeed: 3,
    });
  }

  assert.ok(player.position[2] < -1, `expected orbit-relative forward to move away from +Z camera, got ${player.position}`);
});

test("Coordination: should reset character and orbit rig state when requested", () => {
  const player = createEntity("player", [0, 0, 0]);
  const camera = createEntity("camera.main", [0, 0, 0]);
  const context = createContext([player, camera]);
  context.axes.LookX = 1;
  context.axes.MoveZ = 1;
  const cameraResult = CameraRig.orbitThirdPerson(context as never, { cameraId: "camera.main", target: player });
  CharacterRig.update(context as never, player, { cameraYaw: cameraResult.yaw, walkSpeed: 3 });

  assert.notEqual((context.resourceStore.get("tn.cameraOrbitRig.camera.main") as { yaw?: number } | undefined)?.yaw, undefined);
  assert.notEqual((context.resourceStore.get("tn.characterRig.player") as { speed?: number } | undefined)?.speed, undefined);

  RespawnEx.reset(context as never, player, {
    position: [0, 0, 0],
    stateKeys: ["tn.cameraOrbitRig.camera.main", "tn.characterRig.player"],
    yaw: Math.PI,
  });

  assert.deepEqual(context.resourceStore.get("tn.cameraOrbitRig.camera.main"), {});
  assert.deepEqual(context.resourceStore.get("tn.characterRig.player"), {});
});

test("Coordination: CharacterRig cameraYaw fed with CameraRig's own returned yaw keeps 'forward' input moving the character directly away from the camera", () => {
  const player = createEntity("player", [0, 0, 0]);
  const camera = createEntity("camera.main", [0, 0, 8]);
  const context = createContext([player, camera]);

  // Establish an off-axis camera yaw by turning the player and letting the
  // camera rig chase it over many ticks, simulating real per-frame play.
  context.axes.MoveX = 1;
  context.axes.MoveZ = 0;
  let cameraYaw = 0;
  for (let i = 0; i < 200; i += 1) {
    const characterResult = CharacterRig.update(context as never, player, {
      cameraYaw,
      forwardAxis: "-z",
      maxTurnSpeed: 20,
      walkSpeed: 3,
    });
    const cameraResult = CameraRig.thirdPerson(context as never, {
      cameraId: "camera.main",
      maxYawSpeed: 20,
      offset: [0, 1, -6],
      target: player,
      yaw: characterResult.yaw,
    });
    cameraYaw = cameraResult.yaw;
  }

  // Now press "up" only (camera-relative forward) and confirm the character
  // moves directly away from the camera's current position, not sideways.
  const beforePosition = player.position;
  context.axes.MoveX = 0;
  context.axes.MoveZ = 1;
  let lastResult;
  for (let i = 0; i < 30; i += 1) {
    lastResult = CharacterRig.update(context as never, player, {
      cameraYaw,
      forwardAxis: "-z",
      maxTurnSpeed: 20,
      walkSpeed: 3,
    });
  }
  const movement = Vec3.normalize(Vec3.sub(player.position, beforePosition));
  const awayFromCamera = Vec3.normalize(Vec3.sub(player.position, camera.position));
  assert.ok(Vec3.dot(movement, awayFromCamera) > 0.95, `camera-relative forward should move directly away from camera: movement=${movement} awayFromCamera=${awayFromCamera}`);
  assert.ok(lastResult !== undefined);
});
