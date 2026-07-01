import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  AngleEx,
  ArrayEx,
  Bounds2,
  Bounds3,
  CameraMath,
  ColorEx,
  Ease,
  InputEx,
  MotionEx,
  NumberEx,
  Quat,
  RandomEx,
  SCRIPT_STDLIB_BUNDLE_SOURCE,
  TextEx,
  TimerEx,
  TransformMath,
  Vec2,
  Vec3,
} from "./index.js";

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
  CameraMath: {
    followPose: CameraMath.followPose({ target: [1, 0, 2], yaw: Math.PI / 2, offset: [0, 3, -6] }),
    orbitPose: CameraMath.orbitPose({ target: [0, 0, 0], yaw: 0.5, pitch: 0.25, distance: 8 }),
    shakeOffset: CameraMath.shakeOffset(12, 0.5, 2)
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

test("should compute common gameplay math deterministically", () => {
  assert.deepEqual(Vec2.round(Vec2.rotate([1, 0], Math.PI / 2), 6), [0, 1]);
  assert.equal(NumberEx.round(AngleEx.radToDeg(Math.PI), 3), 180);
  assert.equal(Bounds2.containsPoint(Bounds2.rect(0, 0, 2, 2), [1, 1]), true);
  assert.equal(NumberEx.round(Ease.smootherStep(0.5), 6), 0.5);
  assert.deepEqual(Vec3.round(Vec3.projectOnPlane([1, 2, 3], [0, 1, 0]), 3), [1, 0, 3]);
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
    CameraMath: {
      followPose: CameraMath.followPose({ target: [1, 0, 2], yaw: Math.PI / 2, offset: [0, 3, -6] }),
      orbitPose: CameraMath.orbitPose({ target: [0, 0, 0], yaw: 0.5, pitch: 0.25, distance: 8 }),
      shakeOffset: CameraMath.shakeOffset(12, 0.5, 2),
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
