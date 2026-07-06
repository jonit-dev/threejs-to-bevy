import assert from "node:assert/strict";
import test from "node:test";

import { CameraRig, CharacterRig } from "./rigs.js";
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
  resources: Map<string, object>;
  axes: Record<string, number>;
  actions: Record<string, boolean>;
  elapsed: number;
  fixedDelta: number;
  entity(id: string): IFakeEntity | undefined;
  input: { axis(name: string): number; action(name: string): boolean };
  character: { move(entityRef: string | IFakeEntity, options: { direction?: [number, number]; fixedDelta?: number; speed?: number }): { resolved: Vec3Tuple } };
  resources_: { set(name: string, value: unknown): void };
  state<T extends object>(key: string, defaults: T): T;
  time: { delta: number; elapsed: number; fixedDelta(): number };
}

function createContext(entities: IFakeEntity[]): IFakeContext {
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const resources = new Map<string, object>();
  const context: IFakeContext = {
    entities: entityMap,
    resources,
    axes: {},
    actions: {},
    elapsed: 0,
    fixedDelta: 1 / 60,
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
    resources_: {
      set(name, value) {
        resources.set(name, value as object);
      },
    },
    state(key, defaults) {
      if (!resources.has(key)) {
        resources.set(key, { ...defaults });
      }
      return resources.get(key) as never;
    },
    time: {
      delta: 1 / 60,
      elapsed: 0,
      fixedDelta: () => context.fixedDelta,
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
