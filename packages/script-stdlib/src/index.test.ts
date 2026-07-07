import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  AngleEx,
  ArrayEx,
  BasisEx,
  Bounds2,
  Bounds3,
  CameraMath,
  CameraRig,
  CheckpointRaceEx,
  ColorEx,
  CharacterRig,
  ControllerEx,
  Ease,
  InputEx,
  KinematicMoverEx,
  Mathf,
  MotionEx,
  NumberEx,
  Quat,
  RandomEx,
  RespawnEx,
  SCRIPT_STDLIB_BUNDLE_SOURCE,
  SpawnEx,
  TextEx,
  TimerEx,
  TransformMath,
  Vector2,
  Vector3,
  TriggerEx,
  Vec2,
  Vec3,
} from "./index.js";
import type { QuatTuple, Vec3Tuple } from "./index.js";

const sampleExpression = `({
  AngleEx: {
    degToRad: NumberEx.round(AngleEx.degToRad(90), 6),
    deltaAngle: NumberEx.round(AngleEx.deltaAngle(3, -3), 6),
    moveTowardAngle: NumberEx.round(AngleEx.moveTowardAngle(0, Math.PI, 0.25), 6),
    radToDeg: NumberEx.round(AngleEx.radToDeg(Math.PI), 3)
  },
  ArrayEx: {
    cycle: ArrayEx.cycle(["a", "b", "c"], -1),
    groupBy: ArrayEx.groupBy([{ type: "a", value: 1 }, { type: "a", value: 2 }, { type: "b", value: 3 }], (item) => item.type),
    wrapIndex: ArrayEx.wrapIndex(-2, 5)
  },
  Bounds2: {
    center: Bounds2.center(Bounds2.rect(1, 2, 4, 6)),
    containsPoint: Bounds2.containsPoint(Bounds2.rect(0, 0, 2, 2), [1, 1]),
    distanceToPoint: Bounds2.distanceToPoint(Bounds2.rect(0, 0, 2, 2), [5, 1]),
    expand: Bounds2.expand(Bounds2.rect(0, 0, 2, 2), 1),
    overlaps: Bounds2.overlaps(Bounds2.rect(0, 0, 2, 2), Bounds2.rect(1, 1, 2, 2)),
    size: Bounds2.size(Bounds2.rect(1, 2, 4, 6))
  },
  Bounds3: {
    aabb: Bounds3.aabb([3, 2, 1], [-1, 5, 0]),
    center: Bounds3.center(Bounds3.aabb([0, 0, 0], [2, 4, 6])),
    closestPoint: Bounds3.closestPoint(Bounds3.aabb([0, 0, 0], [2, 4, 6]), [9, 2, -1]),
    containsPoint: Bounds3.containsPoint(Bounds3.aabb([0, 0, 0], [2, 4, 6]), [1, 2, 3]),
    distanceToPoint: Bounds3.distanceToPoint(Bounds3.aabb([0, 0, 0], [2, 4, 6]), [2, 8, 6]),
    overlaps: Bounds3.overlaps(Bounds3.aabb([0, 0, 0], [2, 2, 2]), Bounds3.aabb([1, 1, 1], [3, 3, 3])),
    size: Bounds3.size(Bounds3.aabb([0, 0, 0], [2, 4, 6]))
  },
  BasisEx: {
    controlSignal: BasisEx.controlSignal({ x: 1, y: 1 }),
    distance2d: BasisEx.distance2d([0, 9, 0], [3, -4, 4]),
    planar: BasisEx.toPlanar([2, 5, -3]),
    yaw: NumberEx.round(BasisEx.forwardToYaw([1, 0, 1]), 6)
  },
  CameraMath: {
    followPose: CameraMath.followPose({ target: [1, 0, 2], yaw: Math.PI / 2, offset: [0, 3, -6] }),
    orbitPose: CameraMath.orbitPose({ target: [0, 0, 0], yaw: 0.5, pitch: 0.25, distance: 8 }),
    shakeOffset: CameraMath.shakeOffset(12, 0.5, 2)
  },
  CharacterRig: (() => {
    const states = {};
    const calls = [];
    const player = { id: "player", pose: { position: [0, 1, 0], rotation: [0, 0, 0, 1] }, transform() { return { positionOr: () => this.pose.position, yawOr: () => Quat.yaw(this.pose.rotation), setPose: (position, rotation) => { this.pose = { position, rotation }; } }; } };
    const camera = { id: "camera", pose: { position: [0, 3, -6], rotation: [0, 0, 0, 1] }, transform() { return { positionOr: () => this.pose.position, yawOr: () => Quat.yaw(this.pose.rotation), setPose: (position, rotation) => { this.pose = { position, rotation }; } }; } };
    const context = { animation: { play: (...args) => calls.push(args) }, character: { move: (entity, options) => ({ resolved: Vec3.add(player.pose.position, Vec3.scale([options.direction[0], 0, options.direction[1]], options.speed * options.fixedDelta)) }) }, entity: (id) => id === "player" ? player : camera, input: { action: (name) => name === "Sprint", axis: (name) => name === "MoveZ" ? 1 : name === "LookX" ? 12 : name === "LookY" ? -8 : 0 }, physics: { raycast: () => ({ hit: true, distance: 3.5 }) }, state: (key, defaults) => states[key] ??= { ...defaults }, time: { fixedDt: 0.1, delta: 0.1 } };
    const character = CharacterRig.update(context, "player", { clips: { run: { clip: "run", referenceSpeed: 5.5 }, walk: "walk" }, sprintAction: "Sprint" });
    const follow = CameraRig.thirdPerson(context, { cameraId: "camera", sprinting: character.sprinting, target: "player", yaw: character.yaw });
    const orbit = CameraRig.orbitThirdPerson(context, { cameraId: "camera", collision: { ignore: ["player"], mask: ["world"], padding: 0.25 }, distance: 5, input: { maxPitchStep: 0.04, maxYawStep: 0.05 }, lookHeight: 1.25, minDistance: 1.25, pitch: { default: 0.2, min: 0.1, max: 0.5 }, rounding: { positionDigits: 3, rotationDigits: 3 }, target: "player" });
    return { animation: calls.at(-1)?.[1], camera: Vec3.round(camera.pose.position, 3), character: { moving: character.moving, position: Vec3.round(character.position, 3), speed: NumberEx.round(character.speed, 3), sprinting: character.sprinting, yaw: NumberEx.round(character.yaw, 3) }, follow: NumberEx.round(follow.yaw, 3), orbit: { collided: orbit.collided, distance: NumberEx.round(orbit.distance, 3), pitch: NumberEx.round(orbit.pitch, 3), position: Vec3.round(orbit.position, 3), yaw: NumberEx.round(orbit.yaw, 3) } };
  })(),
  Phase3Rig: (() => {
    const states = {};
    const resources = {};
    const player = { id: "player", components: { Collider: { layer: "player" }, RigidBody: {}, Transform: { position: [0, 1, 0], rotation: Quat.identity() } }, pose: { position: [0, 1, 0], rotation: Quat.identity() }, get(component) { return this.components[component]; }, has(component) { return this.components[component] !== undefined; }, patch(component, value) { this.components[component] = { ...(this.components[component] ?? {}), ...value }; }, transform() { return { positionOr: () => this.pose.position, yawOr: () => Quat.yaw(this.pose.rotation), setPose: (position, rotation) => { this.pose = { position, rotation }; this.components.Transform = { position, rotation }; } }; } };
    const context = { entity: (id) => id === "player" ? player : undefined, physics: { sensor: () => ({ events: [{ occupants: ["player"], phase: "stay", sensor: "goal" }] }) }, resources: { set: (name, value) => { resources[name] = value; } }, state: (key, defaults) => states[key] ??= { ...defaults }, time: { elapsed: 0.5 } };
    const first = TriggerEx.entered(context, "goal", { component: "Collider", layer: "player" }).map((entity) => entity.id);
    const second = TriggerEx.entered(context, "goal", { component: "Collider", layer: "player" }).map((entity) => entity.id);
    const sweep = KinematicMoverEx.sweep(context, "player", { direction: [1, 0, 0], origin: [1, 0, 2], radius: 2, speed: 2 });
    const reset = RespawnEx.reset(context, "player", { components: { Health: { hp: 3 } }, position: [0, 1, 0], resources: { status: "ready" }, yaw: Math.PI / 2 });
    return { first, reset: { entity: reset.entity, position: Vec3.round(reset.position, 3) }, resource: resources.status, second, sweep: { position: Vec3.round(sweep.position, 3), velocity: Vec3.round(sweep.velocity, 3) } };
  })(),
  CheckpointRaceEx: {
    finish: CheckpointRaceEx.passCheckpoint(CheckpointRaceEx.passCheckpoint(CheckpointRaceEx.start(CheckpointRaceEx.init()), { checkpointCount: 2, lapsToFinish: 1, timeSeconds: 1 }), { checkpointCount: 2, lapsToFinish: 1, timeSeconds: 2 }),
    reset: CheckpointRaceEx.reset(CheckpointRaceEx.init({ status: "finished", lap: 2 }))
  },
  ColorEx: {
    hex: ColorEx.hex("#336699cc"),
    lerp: ColorEx.lerp("#000000", "#ffffff", 0.25),
    multiply: ColorEx.multiply([0.8, 0.4, 0.2, 0.5], 0.5),
    rgb: ColorEx.rgb(0.2, 0.4, 0.6),
    toHex: ColorEx.toHex([0.2, 0.4, 0.6, 0.8], true),
    withAlpha: ColorEx.withAlpha("#ff0000", 0.25)
  },
  Ease: {
    inOutCubic: Ease.inOutCubic(0.75),
    inOutQuad: Ease.inOutQuad(0.75),
    inQuad: Ease.inQuad(0.5),
    linear: Ease.linear(2),
    outCubic: Ease.outCubic(0.25),
    outQuad: Ease.outQuad(0.5),
    smoothStep: Ease.smoothStep(0.5),
    smootherStep: Ease.smootherStep(0.5),
    step: Ease.step(0.5, 0.75)
  },
  InputEx: {
    axis: InputEx.axis(0.6, { deadzone: 0.2, exponent: 2 }),
    axis2: InputEx.axis2({ x: 0.2, y: 1 }, { deadzone: 0.1 })
  },
  ControllerEx: {
    cardinal: ControllerEx.worldCardinalCharacter({ dt: 0.5, grounded: true, input: [1, 1], position: [0, 0, 0], speed: 4, turnRate: Math.PI, yaw: 0 })
  },
  MotionEx: {
    arrive: MotionEx.arrive({ position: [0, 0, 0], target: [0, 0, 5], slowingDistance: 10, maxSpeed: 8 }),
    friction: MotionEx.applyFriction([4, 0, 0], 3, 0.5),
    integrate: MotionEx.integrate([1, 0, 2], [3, 0, -2], 0.5),
    planarVelocity: MotionEx.planarVelocity({ velocity: [0, 0, 0], input: [1, 1], maxSpeed: 5, acceleration: 10, friction: 2, dt: 0.2 }),
    seek: MotionEx.seek({ position: [0, 0, 0], target: [4, 0, 3], maxSpeed: 10 })
  },
  NumberEx: {
    approximately: NumberEx.approximately(1, 1.0000001),
    clamp: NumberEx.clamp(4, 0, 2),
    finite: NumberEx.finite(undefined, 7),
    inverseLerp: NumberEx.inverseLerp(10, 20, 15),
    moveToward: NumberEx.moveToward(0, 10, 3),
    pingPong: NumberEx.pingPong(2.5, 1),
    remap: NumberEx.remap(0, 10, 100, 200, 2.5),
    repeat: NumberEx.repeat(-1, 4),
    round: NumberEx.round(1.23456, 3),
    saturate: NumberEx.saturate(2),
    sign: NumberEx.sign(-3),
    wrap: NumberEx.wrap(12, 2, 6)
  },
  Quat: {
    fromEuler: Quat.fromEuler(0.2, 0.3, 0.4),
    fromYaw: Quat.fromYaw(Math.PI / 2),
    identity: Quat.identity(),
    lookRotation: Quat.lookRotation([0, 0, 1]),
    multiply: Quat.multiply(Quat.fromYaw(0.1), Quat.fromYaw(0.2)),
    rotateVec3: Quat.rotateVec3(Quat.fromYaw(Math.PI / 2), [0, 0, 1]),
    slerp: Quat.slerp(Quat.identity(), Quat.fromYaw(Math.PI), 0.5),
    yaw: Quat.yaw(Quat.fromYaw(Math.PI / 2))
  },
  RandomEx: {
    chance: RandomEx.chance(42, 3, 0.5),
    float01: RandomEx.float01(42, 3),
    hash32: RandomEx.hash32(42, 3),
    pickIndex: RandomEx.pickIndex(42, 3, 7),
    range: RandomEx.range(42, 3, 10, 20),
    rangeInt: RandomEx.rangeInt(42, 3, 1, 6)
  },
  SpawnEx: {
    contains: SpawnEx.contains({ kind: "rect", min: [-1, -1], max: [1, 1] }, [0.5, 0.5]),
    sample: SpawnEx.sample({ seed: 12, index: 1, region: { kind: "rect", min: [0, 0], max: [4, 4] }, blocked: [{ kind: "circle", center: [2, 2], radius: 0.5 }] })
  },
  TextEx: {
    fixed: TextEx.fixed(12.345, 2),
    joinNonEmpty: TextEx.joinNonEmpty(["Lap", "", 3, null, "Ready"], " "),
    padLeft: TextEx.padLeft(7, 3, "0"),
    percent: TextEx.percent(0.456, 1),
    signedFixed: TextEx.signedFixed(-1.25, 1),
    timeSeconds: TextEx.timeSeconds(125)
  },
  TimerEx: {
    cooldown: TimerEx.cooldown(0.5, 0.2),
    progress: TimerEx.progress(0.25, 1),
    restart: TimerEx.restart(0.75),
    tick: TimerEx.tick(0.5, 0.2)
  },
  TransformMath: {
    forward: TransformMath.forward(Quat.fromYaw(Math.PI / 2)),
    lookAtPose: TransformMath.lookAtPose([0, 0, -4], [0, 0, 0]),
    pose: TransformMath.pose({ position: [1, 2, 3], yaw: Math.PI }),
    right: TransformMath.right(Quat.fromYaw(Math.PI / 2)),
    translate: TransformMath.translate({ position: [1, 2, 3], rotation: Quat.identity() }, [4, 5, 6]),
    up: TransformMath.up(Quat.fromYaw(Math.PI / 2)),
    withPosition: TransformMath.withPosition({ position: [1, 2, 3], rotation: Quat.identity() }, [7, 8, 9]),
    yaw: TransformMath.yaw({ rotation: Quat.fromYaw(Math.PI / 2) })
  },
  Vec2: {
    add: Vec2.add([1, 2], { x: 3, y: 4 }),
    angle: Vec2.angle([0, 1]),
    distance: Vec2.distance([0, 0], [3, 4]),
    dot: Vec2.dot([1, 2], [3, 4]),
    fromAngle: Vec2.fromAngle(Math.PI / 2, 2),
    lerp: Vec2.lerp([0, 0], [10, 20], 0.25),
    normalize: Vec2.normalize([3, 4]),
    rotate: Vec2.rotate([1, 0], Math.PI / 2),
    round: Vec2.round([1.234, 5.678], 2),
    scale: Vec2.scale([2, 3], 4),
    sub: Vec2.sub([5, 6], [1, 2])
  },
  Vec3: {
    add: Vec3.add([1, 2, 3], { x: 4, y: 5, z: 6 }),
    angle: Vec3.angle([1, 0, 0], [0, 0, 1]),
    cross: Vec3.cross([1, 0, 0], [0, 1, 0]),
    distance: Vec3.distance([0, 0, 0], [2, 3, 6]),
    distance2d: Vec3.distance2d([0, 9, 0], [3, -2, 4]),
    dot: Vec3.dot([1, 2, 3], [4, 5, 6]),
    lerp: Vec3.lerp([0, 0, 0], [10, 20, 30], 0.25),
    moveToward: Vec3.moveToward([0, 0, 0], [0, 0, 10], 3),
    normalize: Vec3.normalize([0, 3, 4]),
    projectOnPlane: Vec3.projectOnPlane([1, 2, 3], [0, 1, 0]),
    rotateYaw: Vec3.rotateYaw([0, 0, 1], Math.PI / 2),
    round: Vec3.round([1.234, 5.678, 9.1011], 2),
    scale: Vec3.scale([2, 3, 4], 2),
    sub: Vec3.sub([5, 6, 7], [1, 2, 3]),
    withY: Vec3.withY([1, 2, 3], 9)
  }
})`;

test("should keep exported and bundled helper behavior identical", () => {
  const exported = roundedJson(exportedSamples());
  const bundled = roundedJson(runBundleSamples());

  assert.deepEqual(bundled, exported);
});

test("should round-trip yaw through fromYaw as a y-axis rotation", () => {
  assert.equal(NumberEx.round(Quat.yaw(Quat.fromYaw(Math.PI / 2)), 6), NumberEx.round(Math.PI / 2, 6));
  assert.equal(NumberEx.round(Quat.yaw(Quat.fromYaw(-1.2)), 6), -1.2);
  assert.deepEqual(Vec3.round(Quat.rotateVec3(Quat.fromYaw(Math.PI / 2), [0, 0, 1]), 6), [1, 0, 0]);
  assert.deepEqual(Vec3.round(Quat.rotateVec3(Quat.fromEuler(Math.PI / 2, 0, 0), [0, 0, 1]), 6), [0, -1, 0]);
  assert.deepEqual(Vec3.round(Quat.rotateVec3(Quat.fromEuler(0, 0, Math.PI / 2), [1, 0, 0]), 6), [0, 1, 0]);
});

test("should compute common gameplay math deterministically", () => {
  assert.deepEqual(Vec2.round(Vec2.rotate([1, 0], Math.PI / 2), 6), [0, 1]);
  assert.equal(NumberEx.round(AngleEx.radToDeg(Math.PI), 3), 180);
  assert.equal(Bounds2.containsPoint(Bounds2.rect(0, 0, 2, 2), [1, 1]), true);
  assert.equal(NumberEx.round(Ease.smootherStep(0.5), 6), 0.5);
  assert.deepEqual(Vec3.round(Vec3.projectOnPlane([1, 2, 3], [0, 1, 0]), 3), [1, 0, 3]);
});

test("should expose familiar helper aliases with the same behavior as legacy helpers", () => {
  assert.equal(Mathf, NumberEx);
  assert.equal(Vector2, Vec2);
  assert.equal(Vector3, Vec3);
  assert.equal(Mathf.clamp(4, 0, 2), NumberEx.clamp(4, 0, 2));
  assert.deepEqual(Vector2.normalize([3, 4]), Vec2.normalize([3, 4]));
  assert.deepEqual(Vector3.add([1, 2, 3], [4, 5, 6]), Vec3.add([1, 2, 3], [4, 5, 6]));
});

test("should bundle familiar helper aliases with the same behavior as legacy helpers", () => {
  const context = vm.createContext({ console, Math });
  const source = `${SCRIPT_STDLIB_BUNDLE_SOURCE}\n({
    clamp: Mathf.clamp(4, 0, 2),
    vec2: Vector2.normalize([3, 4]),
    vec3: Vector3.add([1, 2, 3], [4, 5, 6])
  })`;
  const result = vm.runInContext(source, context) as Record<string, unknown>;

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    clamp: NumberEx.clamp(4, 0, 2),
    vec2: Vec2.normalize([3, 4]),
    vec3: Vec3.add([1, 2, 3], [4, 5, 6]),
  });
});

test("should validate gameplay basis descriptors", () => {
  assert.deepEqual(BasisEx.create({ right: "x", up: "y", forward: "z" }).forwardVector, [0, 0, 1]);
  assert.throws(() => BasisEx.create({ right: "x", up: "x", forward: "z" }), /TN_STDLIB_BASIS_AXIS_DUPLICATE/);
  assert.throws(() => BasisEx.create({ right: "x", up: "-y", forward: "z" }), /TN_STDLIB_BASIS_HANDEDNESS_INVALID/);
});

test("should convert cardinal controls through BasisEx deterministically", () => {
  const signal = BasisEx.controlSignal({ x: 1, y: 1 });
  const controller = ControllerEx.worldCardinalCharacter({ dt: 0.25, grounded: true, input: [0, 1], position: [0, 1, 0], speed: 8, turnRate: Math.PI, yaw: 0 });

  assert.deepEqual(Vec3.round(signal.world, 6), [0.707107, 0, 0.707107]);
  assert.equal(NumberEx.round(signal.yaw, 6), 0.785398);
  assert.deepEqual(Vec3.round(controller.position, 3), [0, 1, 2]);
  assert.deepEqual(Vec3.round(controller.velocity, 3), [0, 0, 8]);
});

test("should emit checkpoint race events in stable order", () => {
  const started = CheckpointRaceEx.start(CheckpointRaceEx.init(), 0);
  const first = CheckpointRaceEx.passCheckpoint(started, { checkpointCount: 2, lapsToFinish: 1, timeSeconds: 3 });
  const finished = CheckpointRaceEx.passCheckpoint(first, { checkpointCount: 2, lapsToFinish: 1, timeSeconds: 7 });

  assert.deepEqual(first.events.map((event) => event.kind), ["checkpoint"]);
  assert.deepEqual(finished.events.map((event) => event.kind), ["checkpoint", "lap", "player-finish", "race-finish"]);
  assert.equal(finished.status, "finished");
  assert.equal(finished.lap, 1);
});

test("should sample spawn regions while rejecting blocked regions", () => {
  const region = { kind: "rect" as const, min: [0, 0] as const, max: [1, 1] as const };
  const fullyBlocked = { kind: "rect" as const, min: [0, 0] as const, max: [1, 1] as const };
  const sampled = SpawnEx.sample({ seed: 22, index: 0, region, blocked: [{ kind: "circle", center: [0.5, 0.5], radius: 0.1 }], attempts: 4 });

  assert.equal(SpawnEx.contains(region, [0.2, 0.8]), true);
  assert.equal(SpawnEx.contains({ kind: "polygon", points: [[0, 0], [2, 0], [1, 2]] }, [1, 0.5]), true);
  assert.notEqual(sampled, null);
  assert.deepEqual(SpawnEx.sample({ seed: 22, index: 0, region, blocked: [fullyBlocked], attempts: 4 }), null);
});

test("should compute random color and text helpers deterministically", () => {
  assert.equal(RandomEx.hash32(42, 3), RandomEx.hash32(42, 3));
  assert.equal(RandomEx.rangeInt(42, 3, 1, 6), RandomEx.rangeInt(42, 3, 1, 6));
  assert.equal(ColorEx.toHex(ColorEx.hex("#336699cc"), true), "#336699cc");
  assert.equal(TextEx.joinNonEmpty(["Lap", 1, "", undefined, "Ready"], " "), "Lap 1 Ready");
});

test("should reduce common gameplay boilerplate without host state", () => {
  const input = InputEx.axis2({ x: 0.25, y: 1 }, { deadzone: 0.1 });
  const body = MotionEx.planarVelocity({ velocity: [0, 0, 0], input, maxSpeed: 7, acceleration: 20, friction: 9, dt: 0.1 });
  const cooldown = TimerEx.cooldown(0.2, 0.1);
  const camera = CameraMath.followPose({ target: [0, 0, 0], yaw: 0, offset: [0, 4, -8] });

  assert.equal(body.speed > 0, true);
  assert.deepEqual(cooldown, { ready: false, remaining: 0.1 });
  assert.deepEqual(ArrayEx.cycle(["idle", "run"], 3), "run");
  assert.deepEqual(Vec3.round(camera.position, 3), [0, 4, -8]);
});

test("should ease speed toward target and cap turn rate when CharacterRig updates", () => {
  const context = createRigContext({ moveZ: 1 });
  let result = CharacterRig.update(context, "player", {
    acceleration: 2,
    clips: { walk: { clip: "walk", referenceSpeed: 2 } },
    maxTurnSpeed: Math.PI / 4,
    walkSpeed: 4,
  });
  for (let index = 1; index < 60; index += 1) {
    result = CharacterRig.update(context, "player", {
      acceleration: 2,
      clips: { walk: { clip: "walk", referenceSpeed: 2 } },
      maxTurnSpeed: Math.PI / 4,
      walkSpeed: 4,
    });
  }

  assert.deepEqual(Vec3.round(result.position, 6), [0, 1, 20.2]);
  assert.equal(NumberEx.round(result.speed, 6), 4);
  assert.equal(NumberEx.round(result.yaw, 6), 0);
  assert.equal(context.animations.at(-1)?.clip, "walk");
  assert.equal(NumberEx.round(Number(context.animations.at(-1)?.options.speed), 6), 2);
});

test("should keep last movement direction while CharacterRig decelerates", () => {
  const input = { moveZ: 1 };
  const context = createRigContext(input);
  const first = CharacterRig.update(context, "player", { acceleration: 20, deceleration: 2, walkSpeed: 4 });
  const beforeRelease = context.entities.player!.pose.position;

  input.moveZ = 0;
  const second = CharacterRig.update(context, "player", { acceleration: 20, deceleration: 2, walkSpeed: 4 });

  assert.equal(first.moving, true);
  assert.equal(second.moving, true);
  assert.equal(second.speed < first.speed, true);
  assert.equal(second.speed > 0, true);
  assert.equal(context.entities.player!.pose.position[2] > beforeRelease[2], true);
});

test("should converge camera behind moving target without overshoot when CameraRig follows", () => {
  const context = createRigContext({ moveZ: 1 });
  const yawErrors: number[] = [];
  for (let index = 0; index < 12; index += 1) {
    const character = CharacterRig.update(context, "player", { cameraYaw: Math.PI / 2, maxTurnSpeed: Math.PI, walkSpeed: 3 });
    const camera = CameraRig.thirdPerson(context, { cameraId: "camera", target: "player", yaw: character.yaw, yawSmoothing: 1 });
    yawErrors.push(Math.abs(Math.PI / 2 - camera.yaw));
  }

  assert.equal(yawErrors.every((value, index) => index === 0 || value <= yawErrors[index - 1]! + 0.000001), true);
  assert.equal(yawErrors.at(-1)! < yawErrors[0]!, true);
  assert.deepEqual(Vec3.round(context.entities.camera!.pose.position, 3), [-1.899, 4.2, -0.55]);
});

test("should report trigger entry once while overlap persists", () => {
  const context = createRigContext();
  context.sensorEvents.push({ occupants: ["player"], phase: "stay", sensor: "goal" });

  assert.deepEqual(TriggerEx.entered(context, "goal", { component: "Collider", layer: "player" }).map((entity) => entity.id), ["player"]);
  assert.deepEqual(TriggerEx.entered(context, "goal", { component: "Collider", layer: "player" }), []);

  context.sensorEvents.length = 0;
  assert.deepEqual(TriggerEx.entered(context, "goal", { component: "Collider", layer: "player" }), []);
  context.sensorEvents.push({ occupants: ["player"], phase: "stay", sensor: "goal" });
  assert.deepEqual(TriggerEx.entered(context, "goal", { component: "Collider", layer: "player" }).map((entity) => entity.id), ["player"]);
});

test("should gate trigger cooldown through context state", () => {
  const context = createRigContext();

  context.time.elapsed = 1;
  assert.equal(TriggerEx.cooldown(context, "hazard", 0.5), true);
  context.time.elapsed = 1.25;
  assert.equal(TriggerEx.cooldown(context, "hazard", 0.5), false);
  context.time.elapsed = 1.5;
  assert.equal(TriggerEx.cooldown(context, "hazard", 0.5), true);
});

test("should emit swept kinematic position and derivative velocity", () => {
  const context = createRigContext();
  context.time.elapsed = 0.5;

  const result = KinematicMoverEx.sweep(context, "player", { direction: [1, 0, 0], origin: [1, 0, 2], radius: 2, speed: 2 });

  assert.deepEqual(Vec3.round(result.position, 6), [2.682942, 0, 2]);
  assert.deepEqual(Vec3.round(result.velocity, 6), [2.161209, 0, 0]);
  assert.deepEqual(Vec3.round(context.entities.player!.pose.position, 6), [2.682942, 0, 2]);
  assert.deepEqual(Vec3.round(context.entities.player!.components.RigidBody!.velocity as Vec3Tuple, 6), [2.161209, 0, 0]);
});

test("should reset pose, components, and resources through RespawnEx", () => {
  const context = createRigContext();

  const result = RespawnEx.reset(context, "player", {
    components: { Health: { hp: 3, max: 5 }, RigidBody: { velocity: [0, 0, 0] } },
    position: [2, 3, 4],
    resources: { status: "ready" },
    yaw: Math.PI / 2,
  });

  assert.deepEqual(result, { entity: "player", position: [2, 3, 4] });
  assert.deepEqual(context.entities.player!.pose.position, [2, 3, 4]);
  assert.equal(NumberEx.round(Quat.yaw(context.entities.player!.pose.rotation), 6), NumberEx.round(Math.PI / 2, 6));
  assert.deepEqual(context.entities.player!.components.Health, { hp: 3, max: 5 });
  assert.deepEqual(context.entities.player!.components.RigidBody!.velocity, [0, 0, 0]);
  assert.equal(context.resourcesStore.status, "ready");
});

test("should keep stdlib helpers deterministic and host-free", () => {
  const context = vm.createContext(Object.create(null));
  const script = new vm.Script(`${SCRIPT_STDLIB_BUNDLE_SOURCE}; ({
    globals: {
      process: typeof process,
      window: typeof window,
      document: typeof document,
      random: typeof Math.random
    },
    first: RandomEx.float01(123, 4),
    second: RandomEx.float01(123, 4),
    motion: MotionEx.planarVelocity({ velocity: [0, 0, 0], input: [1, 0], maxSpeed: 3, acceleration: 12, friction: 2, dt: 0.25 })
  });`);
  const result = script.runInContext(context) as {
    first: number;
    globals: Record<string, string>;
    motion: unknown;
    second: number;
  };

  assert.equal(result.first, result.second);
  assert.deepEqual(roundedJson(result.globals), {
    document: "undefined",
    process: "undefined",
    random: "function",
    window: "undefined",
  });
  assert.equal("process" in context, false);
  assert.equal("window" in context, false);
  assert.equal("document" in context, false);
  assert.deepEqual(roundedJson(result.motion), { heading: 1.570796, speed: 3, velocity: [3, 0, 0] });
});

test("should keep BasisEx and ControllerEx host-free in bundle source", () => {
  const context = vm.createContext(Object.create(null));
  const script = new vm.Script(`${SCRIPT_STDLIB_BUNDLE_SOURCE}; ({
    basis: BasisEx.controlSignal({ x: 1, y: 0 }),
    controller: ControllerEx.worldCardinalCharacter({ dt: 0.5, input: [0, 1], speed: 2, position: [0, 0, 0] }),
    race: CheckpointRaceEx.passCheckpoint(CheckpointRaceEx.start(CheckpointRaceEx.init()), { checkpointCount: 1, lapsToFinish: 1, timeSeconds: 1 }).events.map((event) => event.kind),
    spawn: SpawnEx.sample({ seed: 1, region: { kind: "rect", min: [0, 0], max: [1, 1] } }),
    globals: { process: typeof process, window: typeof window, document: typeof document }
  });`);
  const result = script.runInContext(context) as {
    basis: unknown;
    controller: unknown;
    globals: Record<string, string>;
    race: string[];
    spawn: unknown;
  };

  assert.deepEqual(roundedJson(result.globals), { document: "undefined", process: "undefined", window: "undefined" });
  assert.deepEqual(roundedJson(result.basis), { input: [1, 0], world: [1, 0, 0], yaw: 1.570796 });
  assert.deepEqual(roundedJson(result.controller), { grounded: false, intent: [0, 0, 2], position: [0, 0, 1], velocity: [0, 0, 2], yaw: 0 });
  assert.deepEqual(roundedJson(result.race), ["checkpoint", "lap", "player-finish", "race-finish"]);
  assert.notEqual(result.spawn, null);
});

function exportedSamples(): unknown {
  return {
    AngleEx: {
      degToRad: NumberEx.round(AngleEx.degToRad(90), 6),
      deltaAngle: NumberEx.round(AngleEx.deltaAngle(3, -3), 6),
      moveTowardAngle: NumberEx.round(AngleEx.moveTowardAngle(0, Math.PI, 0.25), 6),
      radToDeg: NumberEx.round(AngleEx.radToDeg(Math.PI), 3),
    },
    ArrayEx: {
      cycle: ArrayEx.cycle(["a", "b", "c"], -1),
      groupBy: ArrayEx.groupBy(
        [
          { type: "a", value: 1 },
          { type: "a", value: 2 },
          { type: "b", value: 3 },
        ],
        (item) => item.type,
      ),
      wrapIndex: ArrayEx.wrapIndex(-2, 5),
    },
    Bounds2: {
      center: Bounds2.center(Bounds2.rect(1, 2, 4, 6)),
      containsPoint: Bounds2.containsPoint(Bounds2.rect(0, 0, 2, 2), [1, 1]),
      distanceToPoint: Bounds2.distanceToPoint(Bounds2.rect(0, 0, 2, 2), [5, 1]),
      expand: Bounds2.expand(Bounds2.rect(0, 0, 2, 2), 1),
      overlaps: Bounds2.overlaps(Bounds2.rect(0, 0, 2, 2), Bounds2.rect(1, 1, 2, 2)),
      size: Bounds2.size(Bounds2.rect(1, 2, 4, 6)),
    },
    Bounds3: {
      aabb: Bounds3.aabb([3, 2, 1], [-1, 5, 0]),
      center: Bounds3.center(Bounds3.aabb([0, 0, 0], [2, 4, 6])),
      closestPoint: Bounds3.closestPoint(Bounds3.aabb([0, 0, 0], [2, 4, 6]), [9, 2, -1]),
      containsPoint: Bounds3.containsPoint(Bounds3.aabb([0, 0, 0], [2, 4, 6]), [1, 2, 3]),
      distanceToPoint: Bounds3.distanceToPoint(Bounds3.aabb([0, 0, 0], [2, 4, 6]), [2, 8, 6]),
      overlaps: Bounds3.overlaps(Bounds3.aabb([0, 0, 0], [2, 2, 2]), Bounds3.aabb([1, 1, 1], [3, 3, 3])),
      size: Bounds3.size(Bounds3.aabb([0, 0, 0], [2, 4, 6])),
    },
    BasisEx: {
      controlSignal: BasisEx.controlSignal({ x: 1, y: 1 }),
      distance2d: BasisEx.distance2d([0, 9, 0], [3, -4, 4]),
      planar: BasisEx.toPlanar([2, 5, -3]),
      yaw: NumberEx.round(BasisEx.forwardToYaw([1, 0, 1]), 6),
    },
    CameraMath: {
      followPose: CameraMath.followPose({ target: [1, 0, 2], yaw: Math.PI / 2, offset: [0, 3, -6] }),
      orbitPose: CameraMath.orbitPose({ target: [0, 0, 0], yaw: 0.5, pitch: 0.25, distance: 8 }),
      shakeOffset: CameraMath.shakeOffset(12, 0.5, 2),
    },
    CharacterRig: rigSample(),
    Phase3Rig: phase3RigSample(),
    CheckpointRaceEx: {
      finish: CheckpointRaceEx.passCheckpoint(
        CheckpointRaceEx.passCheckpoint(CheckpointRaceEx.start(CheckpointRaceEx.init()), { checkpointCount: 2, lapsToFinish: 1, timeSeconds: 1 }),
        { checkpointCount: 2, lapsToFinish: 1, timeSeconds: 2 },
      ),
      reset: CheckpointRaceEx.reset(CheckpointRaceEx.init({ status: "finished", lap: 2 })),
    },
    ColorEx: {
      hex: ColorEx.hex("#336699cc"),
      lerp: ColorEx.lerp("#000000", "#ffffff", 0.25),
      multiply: ColorEx.multiply([0.8, 0.4, 0.2, 0.5], 0.5),
      rgb: ColorEx.rgb(0.2, 0.4, 0.6),
      toHex: ColorEx.toHex([0.2, 0.4, 0.6, 0.8], true),
      withAlpha: ColorEx.withAlpha("#ff0000", 0.25),
    },
    Ease: {
      inOutCubic: Ease.inOutCubic(0.75),
      inOutQuad: Ease.inOutQuad(0.75),
      inQuad: Ease.inQuad(0.5),
      linear: Ease.linear(2),
      outCubic: Ease.outCubic(0.25),
      outQuad: Ease.outQuad(0.5),
      smoothStep: Ease.smoothStep(0.5),
      smootherStep: Ease.smootherStep(0.5),
      step: Ease.step(0.5, 0.75),
    },
    InputEx: {
      axis: InputEx.axis(0.6, { deadzone: 0.2, exponent: 2 }),
      axis2: InputEx.axis2({ x: 0.2, y: 1 }, { deadzone: 0.1 }),
    },
    ControllerEx: {
      cardinal: ControllerEx.worldCardinalCharacter({ dt: 0.5, grounded: true, input: [1, 1], position: [0, 0, 0], speed: 4, turnRate: Math.PI, yaw: 0 }),
    },
    MotionEx: {
      arrive: MotionEx.arrive({ position: [0, 0, 0], target: [0, 0, 5], slowingDistance: 10, maxSpeed: 8 }),
      friction: MotionEx.applyFriction([4, 0, 0], 3, 0.5),
      integrate: MotionEx.integrate([1, 0, 2], [3, 0, -2], 0.5),
      planarVelocity: MotionEx.planarVelocity({ velocity: [0, 0, 0], input: [1, 1], maxSpeed: 5, acceleration: 10, friction: 2, dt: 0.2 }),
      seek: MotionEx.seek({ position: [0, 0, 0], target: [4, 0, 3], maxSpeed: 10 }),
    },
    NumberEx: {
      approximately: NumberEx.approximately(1, 1.0000001),
      clamp: NumberEx.clamp(4, 0, 2),
      finite: NumberEx.finite(undefined, 7),
      inverseLerp: NumberEx.inverseLerp(10, 20, 15),
      moveToward: NumberEx.moveToward(0, 10, 3),
      pingPong: NumberEx.pingPong(2.5, 1),
      remap: NumberEx.remap(0, 10, 100, 200, 2.5),
      repeat: NumberEx.repeat(-1, 4),
      round: NumberEx.round(1.23456, 3),
      saturate: NumberEx.saturate(2),
      sign: NumberEx.sign(-3),
      wrap: NumberEx.wrap(12, 2, 6),
    },
    Quat: {
      fromEuler: Quat.fromEuler(0.2, 0.3, 0.4),
      fromYaw: Quat.fromYaw(Math.PI / 2),
      identity: Quat.identity(),
      lookRotation: Quat.lookRotation([0, 0, 1]),
      multiply: Quat.multiply(Quat.fromYaw(0.1), Quat.fromYaw(0.2)),
      rotateVec3: Quat.rotateVec3(Quat.fromYaw(Math.PI / 2), [0, 0, 1]),
      slerp: Quat.slerp(Quat.identity(), Quat.fromYaw(Math.PI), 0.5),
      yaw: Quat.yaw(Quat.fromYaw(Math.PI / 2)),
    },
    RandomEx: {
      chance: RandomEx.chance(42, 3, 0.5),
      float01: RandomEx.float01(42, 3),
      hash32: RandomEx.hash32(42, 3),
      pickIndex: RandomEx.pickIndex(42, 3, 7),
      range: RandomEx.range(42, 3, 10, 20),
      rangeInt: RandomEx.rangeInt(42, 3, 1, 6),
    },
    SpawnEx: {
      contains: SpawnEx.contains({ kind: "rect", min: [-1, -1], max: [1, 1] }, [0.5, 0.5]),
      sample: SpawnEx.sample({ seed: 12, index: 1, region: { kind: "rect", min: [0, 0], max: [4, 4] }, blocked: [{ kind: "circle", center: [2, 2], radius: 0.5 }] }),
    },
    TextEx: {
      fixed: TextEx.fixed(12.345, 2),
      joinNonEmpty: TextEx.joinNonEmpty(["Lap", "", 3, null, "Ready"], " "),
      padLeft: TextEx.padLeft(7, 3, "0"),
      percent: TextEx.percent(0.456, 1),
      signedFixed: TextEx.signedFixed(-1.25, 1),
      timeSeconds: TextEx.timeSeconds(125),
    },
    TimerEx: {
      cooldown: TimerEx.cooldown(0.5, 0.2),
      progress: TimerEx.progress(0.25, 1),
      restart: TimerEx.restart(0.75),
      tick: TimerEx.tick(0.5, 0.2),
    },
    TransformMath: {
      forward: TransformMath.forward(Quat.fromYaw(Math.PI / 2)),
      lookAtPose: TransformMath.lookAtPose([0, 0, -4], [0, 0, 0]),
      pose: TransformMath.pose({ position: [1, 2, 3], yaw: Math.PI }),
      right: TransformMath.right(Quat.fromYaw(Math.PI / 2)),
      translate: TransformMath.translate({ position: [1, 2, 3], rotation: Quat.identity() }, [4, 5, 6]),
      up: TransformMath.up(Quat.fromYaw(Math.PI / 2)),
      withPosition: TransformMath.withPosition({ position: [1, 2, 3], rotation: Quat.identity() }, [7, 8, 9]),
      yaw: TransformMath.yaw({ rotation: Quat.fromYaw(Math.PI / 2) }),
    },
    Vec2: {
      add: Vec2.add([1, 2], { x: 3, y: 4 }),
      angle: Vec2.angle([0, 1]),
      distance: Vec2.distance([0, 0], [3, 4]),
      dot: Vec2.dot([1, 2], [3, 4]),
      fromAngle: Vec2.fromAngle(Math.PI / 2, 2),
      lerp: Vec2.lerp([0, 0], [10, 20], 0.25),
      normalize: Vec2.normalize([3, 4]),
      rotate: Vec2.rotate([1, 0], Math.PI / 2),
      round: Vec2.round([1.234, 5.678], 2),
      scale: Vec2.scale([2, 3], 4),
      sub: Vec2.sub([5, 6], [1, 2]),
    },
    Vec3: {
      add: Vec3.add([1, 2, 3], { x: 4, y: 5, z: 6 }),
      angle: Vec3.angle([1, 0, 0], [0, 0, 1]),
      cross: Vec3.cross([1, 0, 0], [0, 1, 0]),
      distance: Vec3.distance([0, 0, 0], [2, 3, 6]),
      distance2d: Vec3.distance2d([0, 9, 0], [3, -2, 4]),
      dot: Vec3.dot([1, 2, 3], [4, 5, 6]),
      lerp: Vec3.lerp([0, 0, 0], [10, 20, 30], 0.25),
      moveToward: Vec3.moveToward([0, 0, 0], [0, 0, 10], 3),
      normalize: Vec3.normalize([0, 3, 4]),
      projectOnPlane: Vec3.projectOnPlane([1, 2, 3], [0, 1, 0]),
      rotateYaw: Vec3.rotateYaw([0, 0, 1], Math.PI / 2),
      round: Vec3.round([1.234, 5.678, 9.1011], 2),
      scale: Vec3.scale([2, 3, 4], 2),
      sub: Vec3.sub([5, 6, 7], [1, 2, 3]),
      withY: Vec3.withY([1, 2, 3], 9),
    },
  };
}

function rigSample(): unknown {
  const context = createRigContext({ lookX: 12, lookY: -8, moveZ: 1, sprint: true });
  const character = CharacterRig.update(context, "player", {
    clips: { run: { clip: "run", referenceSpeed: 5.5 }, walk: "walk" },
    sprintAction: "Sprint",
  });
  const follow = CameraRig.thirdPerson(context, { cameraId: "camera", sprinting: character.sprinting, target: "player", yaw: character.yaw });
  const orbit = CameraRig.orbitThirdPerson(context, {
    cameraId: "camera",
    collision: { ignore: ["player"], mask: ["world"], padding: 0.25 },
    distance: 5,
    input: { maxPitchStep: 0.04, maxYawStep: 0.05 },
    lookHeight: 1.25,
    minDistance: 1.25,
    pitch: { default: 0.2, min: 0.1, max: 0.5 },
    rounding: { positionDigits: 3, rotationDigits: 3 },
    target: "player",
  });
  return {
    animation: context.animations.at(-1)?.clip,
    camera: Vec3.round(context.entities.camera!.pose.position, 3),
    character: {
      moving: character.moving,
      position: Vec3.round(character.position, 3),
      speed: NumberEx.round(character.speed, 3),
      sprinting: character.sprinting,
      yaw: NumberEx.round(character.yaw, 3),
    },
    follow: NumberEx.round(follow.yaw, 3),
    orbit: {
      collided: orbit.collided,
      distance: NumberEx.round(orbit.distance, 3),
      pitch: NumberEx.round(orbit.pitch, 3),
      position: Vec3.round(orbit.position, 3),
      yaw: NumberEx.round(orbit.yaw, 3),
    },
  };
}

function phase3RigSample(): unknown {
  const context = createRigContext();
  context.time.elapsed = 0.5;
  context.sensorEvents.push({ occupants: ["player"], phase: "stay", sensor: "goal" });
  const first = TriggerEx.entered(context, "goal", { component: "Collider", layer: "player" }).map((entity) => entity.id);
  const second = TriggerEx.entered(context, "goal", { component: "Collider", layer: "player" }).map((entity) => entity.id);
  const sweep = KinematicMoverEx.sweep(context, "player", { direction: [1, 0, 0], origin: [1, 0, 2], radius: 2, speed: 2 });
  const reset = RespawnEx.reset(context, "player", {
    components: { Health: { hp: 3 } },
    position: [0, 1, 0],
    resources: { status: "ready" },
    yaw: Math.PI / 2,
  });
  return {
    first,
    reset: { entity: reset.entity, position: Vec3.round(reset.position, 3) },
    resource: context.resourcesStore.status,
    second,
    sweep: { position: Vec3.round(sweep.position, 3), velocity: Vec3.round(sweep.velocity, 3) },
  };
}

function createRigContext(input: { lookX?: number; lookY?: number; moveX?: number; moveZ?: number; sprint?: boolean } = {}): {
  animation: { play(entity: unknown, clip: string, options: Record<string, unknown>): void };
  animations: Array<{ clip: string; entity: unknown; options: Record<string, unknown> }>;
  character: { move(entity: unknown, options: { direction: [number, number]; fixedDelta: number; speed: number }): { resolved: Vec3Tuple } };
  entities: Record<string, ReturnType<typeof createRigEntity>>;
  entity(id: string): ReturnType<typeof createRigEntity> | undefined;
  input: { action(name: string): boolean; axis(name: string): number };
  physics: {
    raycast(options: { direction: Vec3Tuple; ignore?: readonly string[]; mask?: readonly string[]; maxDistance?: number; origin: Vec3Tuple }): { distance: number; hit: boolean };
    sensor(options?: { phases?: Array<"enter" | "exit" | "stay">; sensor?: string }): { events: Array<{ occupants: string[]; phase: "enter" | "exit" | "stay"; sensor: string }> };
  };
  resources: { set(name: string, value: unknown): void };
  resourcesStore: Record<string, unknown>;
  sensorEvents: Array<{ occupants: string[]; phase: "enter" | "exit" | "stay"; sensor: string }>;
  state<T extends object>(key: string, defaults: T): T;
  stateStore: Record<string, object>;
  time: { delta: number; elapsed: number; fixedDelta(): number; fixedDt: number };
} {
  const entities: Record<string, ReturnType<typeof createRigEntity>> = {
    camera: createRigEntity("camera", [0, 3, -6]),
    player: createRigEntity("player", [0, 1, 0]),
  };
  const animations: Array<{ clip: string; entity: unknown; options: Record<string, unknown> }> = [];
  const resourcesStore: Record<string, unknown> = {};
  const sensorEvents: Array<{ occupants: string[]; phase: "enter" | "exit" | "stay"; sensor: string }> = [];
  const stateStore: Record<string, object> = {};
  return {
    animations,
    character: {
      move(entity: unknown, options: { direction: [number, number]; fixedDelta: number; speed: number }) {
        const target = typeof entity === "string" ? entities[entity]! : entity as ReturnType<typeof createRigEntity>;
        const resolved = Vec3.add(target.pose.position, Vec3.scale([options.direction[0], 0, options.direction[1]], options.speed * options.fixedDelta));
        return { resolved };
      },
    },
    animation: {
      play(entity: unknown, clip: string, options: Record<string, unknown>) {
        animations.push({ clip, entity, options });
      },
    },
    entities,
    entity(id: string) {
      return entities[id];
    },
    input: {
      action(name: string) {
        return name === "Sprint" ? input.sprint === true : false;
      },
      axis(name: string) {
        return name === "MoveX" ? input.moveX ?? 0 : name === "MoveZ" ? input.moveZ ?? 0 : name === "LookX" ? input.lookX ?? 0 : name === "LookY" ? input.lookY ?? 0 : 0;
      },
    },
    physics: {
      raycast() {
        return { distance: 3.5, hit: true };
      },
      sensor(options?: { phases?: Array<"enter" | "exit" | "stay">; sensor?: string }) {
        return {
          events: sensorEvents.filter((event) => (options?.sensor === undefined || event.sensor === options.sensor) && (options?.phases === undefined || options.phases.includes(event.phase))),
        };
      },
    },
    resources: {
      set(name: string, value: unknown) {
        resourcesStore[name] = value;
      },
    },
    resourcesStore,
    sensorEvents,
    state<T extends object>(key: string, defaults: T): T {
      stateStore[key] ??= { ...defaults };
      return stateStore[key] as T;
    },
    stateStore,
    time: {
      delta: 0.1,
      elapsed: 0,
      fixedDt: 0.1,
      fixedDelta() {
        return 0.1;
      },
    },
  };
}

function createRigEntity(id: string, position: Vec3Tuple): {
  components: Record<string, Record<string, unknown>>;
  get<T = unknown>(component: string): T | undefined;
  has(component: string): boolean;
  id: string;
  patch(component: string, value: unknown): void;
  pose: { position: Vec3Tuple; rotation: QuatTuple };
  set(component: string, value: unknown): void;
  transform(): { positionOr(fallback: Vec3Tuple): Vec3Tuple; setPose(position: Vec3Tuple, rotation: QuatTuple): void; yawOr(fallback: number): number };
} {
  return {
    components: {
      Collider: { layer: id === "player" ? "player" : "default" },
      RigidBody: {},
      Transform: { position, rotation: Quat.identity() },
    },
    get<T = unknown>(component: string): T | undefined {
      return this.components[component] as T | undefined;
    },
    has(component: string): boolean {
      return this.components[component] !== undefined;
    },
    id,
    patch(component: string, value: unknown): void {
      this.components[component] = { ...(this.components[component] ?? {}), ...(typeof value === "object" && value !== null ? value : { value }) };
    },
    pose: { position, rotation: Quat.identity() },
    set(component: string, value: unknown): void {
      this.components[component] = typeof value === "object" && value !== null ? { ...value as Record<string, unknown> } : { value };
    },
    transform() {
      return {
        positionOr: () => this.pose.position,
        setPose: (nextPosition, nextRotation) => {
          this.pose = { position: Vec3.from(nextPosition), rotation: Quat.from(nextRotation) };
          this.components.Transform = { position: this.pose.position, rotation: this.pose.rotation };
        },
        yawOr: (fallback) => Quat.yaw(this.pose.rotation, fallback),
      };
    },
  };
}

function runBundleSamples(): unknown {
  const context = vm.createContext(Object.create(null));
  return new vm.Script(`${SCRIPT_STDLIB_BUNDLE_SOURCE}; ${sampleExpression};`).runInContext(context);
}

function roundedJson(value: unknown): unknown {
  return roundJsonValue(JSON.parse(JSON.stringify(value)) as unknown);
}

function roundJsonValue(value: unknown): unknown {
  if (typeof value === "number") {
    return NumberEx.round(value, 6);
  }
  if (Array.isArray(value)) {
    return value.map((item) => roundJsonValue(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundJsonValue(item)]));
  }
  return value;
}
