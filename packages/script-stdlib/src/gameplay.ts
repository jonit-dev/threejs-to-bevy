import { NumberEx } from "./numeric.js";
import { Quat, TransformMath } from "./rotation.js";
import { RandomEx } from "./feedback.js";
import { Vec2, Vec3 } from "./vectors.js";
import { DEFAULT_VEC2, DEFAULT_VEC3, EPSILON, type QuatTuple, type Vec2Tuple, type Vec2Value, type Vec3Tuple, type Vec3Value } from "./types.js";

type BasisAxisName = "x" | "y" | "z" | "-x" | "-y" | "-z";

export interface IBasisDescriptor {
  readonly forward: BasisAxisName;
  readonly right: BasisAxisName;
  readonly up: BasisAxisName;
}

interface IResolvedBasis extends IBasisDescriptor {
  readonly forwardVector: Vec3Tuple;
  readonly rightVector: Vec3Tuple;
  readonly upVector: Vec3Tuple;
}

export interface ICheckpointRaceState {
  readonly checkpoint: number;
  readonly events: readonly ICheckpointRaceEvent[];
  readonly lap: number;
  readonly status: "ready" | "racing" | "finished";
  readonly timeSeconds: number;
}

export interface ICheckpointRaceEvent {
  readonly checkpoint: number;
  readonly kind: "checkpoint" | "lap" | "player-finish" | "race-finish" | "start" | "reset";
  readonly lap: number;
  readonly timeSeconds: number;
}

type SpawnRegion =
  | { readonly center: Vec2Value; readonly kind: "circle"; readonly radius: number }
  | { readonly from: Vec2Value; readonly kind: "segment-corridor"; readonly radius: number; readonly to: Vec2Value }
  | { readonly kind: "polygon"; readonly points: readonly Vec2Value[] }
  | { readonly kind: "rect"; readonly max: Vec2Value; readonly min: Vec2Value };

export const InputEx = Object.freeze({
  axis(value: number, options: { readonly deadzone?: number; readonly exponent?: number } = {}): number {
    const raw = NumberEx.clamp(value, -1, 1);
    const deadzone = NumberEx.saturate(options.deadzone ?? 0);
    if (Math.abs(raw) <= deadzone) {
      return 0;
    }
    const normalized = (Math.abs(raw) - deadzone) / (1 - deadzone);
    return Math.sign(raw) * normalized ** Math.max(1, NumberEx.finite(options.exponent, 1));
  },
  axis2(value: Vec2Value, options: { readonly deadzone?: number; readonly exponent?: number; readonly normalize?: boolean } = {}): Vec2Tuple {
    const shaped = Vec2.from(value).map((axis) => InputEx.axis(axis, options)) as unknown as Vec2Tuple;
    const length = Vec2.length(shaped);
    if (length > 1 || options.normalize === true) {
      return Vec2.normalize(shaped);
    }
    return shaped;
  },
});

export const MotionEx = Object.freeze({
  arrive(options: { readonly position: Vec3Value; readonly target: Vec3Value; readonly slowingDistance?: number; readonly maxSpeed: number }): Vec3Tuple {
    const offset = Vec3.sub(options.target, options.position);
    const distance = Vec3.length(offset);
    if (distance <= EPSILON) {
      return [0, 0, 0];
    }
    const ramp = NumberEx.saturate(distance / Math.max(EPSILON, NumberEx.finite(options.slowingDistance, 1)));
    return Vec3.scale(Vec3.normalize(offset), Math.max(0, NumberEx.finite(options.maxSpeed, 0)) * ramp);
  },
  applyFriction(velocity: Vec3Value, friction: number, dt: number): Vec3Tuple {
    return Vec3.moveToward(velocity, DEFAULT_VEC3, Math.max(0, NumberEx.finite(friction, 0)) * Math.max(0, NumberEx.finite(dt, 0)));
  },
  integrate(position: Vec3Value, velocity: Vec3Value, dt: number): Vec3Tuple {
    return Vec3.add(position, Vec3.scale(velocity, Math.max(0, NumberEx.finite(dt, 0))));
  },
  planarVelocity(options: { readonly acceleration?: number; readonly dt: number; readonly friction?: number; readonly input?: Vec2Value; readonly maxSpeed?: number; readonly velocity?: Vec3Value }): { readonly heading: number; readonly speed: number; readonly velocity: Vec3Tuple } {
    const input = Vec2.normalize(options.input ?? DEFAULT_VEC2);
    const dt = Math.max(0, NumberEx.finite(options.dt, 0));
    let velocity = Vec3.from(options.velocity);
    const accel = Math.max(0, NumberEx.finite(options.acceleration, 0));
    velocity = Vec3.add(velocity, [input[0] * accel * dt, 0, input[1] * accel * dt]);
    if (Vec2.length(input) <= EPSILON) {
      velocity = MotionEx.applyFriction(velocity, options.friction ?? 0, dt);
    }
    const speed = Vec3.length([velocity[0], 0, velocity[2]]);
    const maxSpeed = Math.max(0, NumberEx.finite(options.maxSpeed, speed));
    if (speed > maxSpeed && speed > EPSILON) {
      velocity = Vec3.scale(velocity, maxSpeed / speed);
    }
    return { velocity, speed: Vec3.length([velocity[0], 0, velocity[2]]), heading: Math.atan2(velocity[0], velocity[2]) };
  },
  seek(options: { readonly position: Vec3Value; readonly target: Vec3Value; readonly maxSpeed: number }): Vec3Tuple {
    return Vec3.scale(Vec3.normalize(Vec3.sub(options.target, options.position)), Math.max(0, NumberEx.finite(options.maxSpeed, 0)));
  },
});

export const BasisEx = Object.freeze({
  controlSignal(options: { readonly basis?: Partial<IBasisDescriptor>; readonly x?: number; readonly y?: number }): { readonly input: Vec2Tuple; readonly yaw: number; readonly world: Vec3Tuple } {
    const basis = BasisEx.create(options.basis);
    const input = InputEx.axis2([options.x ?? 0, options.y ?? 0], { normalize: true });
    const world = Vec3.add(Vec3.scale(basis.rightVector, input[0]), Vec3.scale(basis.forwardVector, input[1]));
    return { input, world, yaw: BasisEx.forwardToYaw(world) };
  },
  create(input: Partial<IBasisDescriptor> = {}): IResolvedBasis {
    const basis: IBasisDescriptor = {
      forward: input.forward ?? "z",
      right: input.right ?? "x",
      up: input.up ?? "y",
    };
    const rightVector = axisVector(basis.right);
    const upVector = axisVector(basis.up);
    const forwardVector = axisVector(basis.forward);
    const uniqueAxes = new Set([axisBase(basis.right), axisBase(basis.up), axisBase(basis.forward)]);
    if (uniqueAxes.size !== 3) {
      throw new Error("TN_STDLIB_BASIS_AXIS_DUPLICATE");
    }
    if (Vec3.dot(Vec3.cross(rightVector, forwardVector), upVector) >= 0) {
      throw new Error("TN_STDLIB_BASIS_HANDEDNESS_INVALID");
    }
    return Object.freeze({ ...basis, forwardVector, rightVector, upVector });
  },
  distance2d(left: Vec3Value, right: Vec3Value, basis?: Partial<IBasisDescriptor>): number {
    return Vec2.distance(BasisEx.toPlanar(left, basis), BasisEx.toPlanar(right, basis));
  },
  flatten(value: Vec3Value, basis?: Partial<IBasisDescriptor>): Vec3Tuple {
    const descriptor = BasisEx.create(basis);
    const vec = Vec3.from(value);
    return Vec3.sub(vec, Vec3.scale(descriptor.upVector, Vec3.dot(vec, descriptor.upVector)));
  },
  forwardToYaw(forward: Vec3Value): number {
    const vec = Vec3.normalize(BasisEx.flatten(forward));
    return Vec3.length(vec) <= EPSILON ? 0 : Math.atan2(vec[0], vec[2]);
  },
  fromBasisComponents(components: { readonly forward?: number; readonly right?: number; readonly up?: number }, basis?: Partial<IBasisDescriptor>): Vec3Tuple {
    const descriptor = BasisEx.create(basis);
    return Vec3.add(Vec3.add(Vec3.scale(descriptor.rightVector, NumberEx.finite(components.right, 0)), Vec3.scale(descriptor.upVector, NumberEx.finite(components.up, 0))), Vec3.scale(descriptor.forwardVector, NumberEx.finite(components.forward, 0)));
  },
  toPlanar(value: Vec3Value, basis?: Partial<IBasisDescriptor>): Vec2Tuple {
    const descriptor = BasisEx.create(basis);
    const vec = Vec3.from(value);
    return [Vec3.dot(vec, descriptor.rightVector), Vec3.dot(vec, descriptor.forwardVector)];
  },
  yawPitchRollFrame(options: { readonly pitch?: number; readonly roll?: number; readonly yaw?: number } = {}, basis?: Partial<IBasisDescriptor>): { readonly forward: Vec3Tuple; readonly right: Vec3Tuple; readonly rotation: QuatTuple; readonly up: Vec3Tuple } {
    const descriptor = BasisEx.create(basis);
    const rotation = Quat.fromEuler(options.pitch ?? 0, options.yaw ?? 0, options.roll ?? 0);
    return {
      forward: Quat.rotateVec3(rotation, descriptor.forwardVector),
      right: Quat.rotateVec3(rotation, descriptor.rightVector),
      rotation,
      up: Quat.rotateVec3(rotation, descriptor.upVector),
    };
  },
});

export const ControllerEx = Object.freeze({
  worldCardinalCharacter(options: {
    readonly basis?: Partial<IBasisDescriptor>;
    readonly dt: number;
    readonly gravity?: number;
    readonly grounded?: boolean;
    readonly input?: Vec2Value;
    readonly jump?: boolean;
    readonly jumpSpeed?: number;
    readonly position?: Vec3Value;
    readonly speed?: number;
    readonly turnRate?: number;
    readonly velocity?: Vec3Value;
    readonly yaw?: number;
  }): { readonly grounded: boolean; readonly intent: Vec3Tuple; readonly position: Vec3Tuple; readonly velocity: Vec3Tuple; readonly yaw: number } {
    const dt = Math.max(0, NumberEx.finite(options.dt, 0));
    const basis = BasisEx.create(options.basis);
    const input = InputEx.axis2(options.input ?? DEFAULT_VEC2, { normalize: true });
    const desired = Vec3.scale(Vec3.add(Vec3.scale(basis.rightVector, input[0]), Vec3.scale(basis.forwardVector, input[1])), Math.max(0, NumberEx.finite(options.speed, 0)));
    const currentVelocity = Vec3.from(options.velocity);
    const vertical = (options.grounded === true && options.jump === true ? Math.max(0, NumberEx.finite(options.jumpSpeed, 0)) : currentVelocity[1]) - Math.max(0, NumberEx.finite(options.gravity, 0)) * dt;
    const velocity: Vec3Tuple = [desired[0], vertical, desired[2]];
    const targetYaw = Vec3.length(desired) <= EPSILON ? NumberEx.finite(options.yaw, 0) : BasisEx.forwardToYaw(desired);
    const maxTurn = Math.max(0, NumberEx.finite(options.turnRate, Number.POSITIVE_INFINITY)) * dt;
    const yaw = Number.isFinite(maxTurn) ? NumberEx.finite(options.yaw, targetYaw) + angleDelta(NumberEx.finite(options.yaw, targetYaw), targetYaw, maxTurn) : targetYaw;
    return {
      grounded: options.grounded === true && vertical <= EPSILON,
      intent: desired,
      position: MotionEx.integrate(options.position ?? DEFAULT_VEC3, velocity, dt),
      velocity,
      yaw,
    };
  },
});

export const TimerEx = Object.freeze({
  cooldown(remaining: number, dt: number): { readonly ready: boolean; readonly remaining: number } {
    const next = Math.max(0, NumberEx.finite(remaining, 0) - Math.max(0, NumberEx.finite(dt, 0)));
    return { remaining: next, ready: next <= EPSILON };
  },
  progress(remaining: number, duration: number): number {
    const total = Math.max(EPSILON, NumberEx.finite(duration, 0));
    return NumberEx.saturate(1 - Math.max(0, NumberEx.finite(remaining, 0)) / total);
  },
  restart(duration: number): number {
    return Math.max(0, NumberEx.finite(duration, 0));
  },
  tick(remaining: number, dt: number): number {
    return TimerEx.cooldown(remaining, dt).remaining;
  },
});

export const ArrayEx = Object.freeze({
  cycle<T>(items: ReadonlyArray<T>, index: number, fallback?: T): T | undefined {
    return items.length === 0 ? fallback : items[ArrayEx.wrapIndex(index, items.length)];
  },
  groupBy<T>(items: ReadonlyArray<T>, keyOf: (item: T) => string): Record<string, T[]> {
    const groups: Record<string, T[]> = {};
    for (const item of items) {
      const key = String(keyOf(item));
      groups[key] = [...(groups[key] ?? []), item];
    }
    return groups;
  },
  wrapIndex(index: number, length: number): number {
    const count = Math.max(0, Math.trunc(NumberEx.finite(length, 0)));
    return count === 0 ? -1 : NumberEx.repeat(Math.trunc(NumberEx.finite(index, 0)), count);
  },
});

export const CameraMath = Object.freeze({
  followPose(options: { readonly offset?: Vec3Value; readonly target: Vec3Value; readonly yaw?: number }): { readonly position: Vec3Tuple; readonly rotation: QuatTuple } {
    const offset = Vec3.rotateYaw(Vec3.from(options.offset, [0, 0, -8]), NumberEx.finite(options.yaw, 0));
    const position = Vec3.add(options.target, offset);
    return TransformMath.lookAtPose(position, options.target);
  },
  lookAtPose(eye: Vec3Value, target: Vec3Value): { readonly position: Vec3Tuple; readonly rotation: QuatTuple } {
    return TransformMath.lookAtPose(eye, target);
  },
  orbitPose(options: { readonly distance?: number; readonly pitch?: number; readonly target: Vec3Value; readonly yaw?: number }): { readonly position: Vec3Tuple; readonly rotation: QuatTuple } {
    const distance = Math.max(0, NumberEx.finite(options.distance, 8));
    const pitch = NumberEx.finite(options.pitch, 0);
    const yaw = NumberEx.finite(options.yaw, 0);
    const offset: Vec3Tuple = [Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance];
    const position = Vec3.add(options.target, offset);
    return TransformMath.lookAtPose(position, options.target);
  },
  shakeOffset(seed: number, amplitude: number, index = 0): Vec3Tuple {
    const amount = Math.max(0, NumberEx.finite(amplitude, 0));
    return [RandomEx.range(seed, index, -amount, amount), RandomEx.range(seed, index + 1, -amount, amount), RandomEx.range(seed, index + 2, -amount, amount)];
  },
});

export const CheckpointRaceEx = Object.freeze({
  init(options: { readonly checkpoint?: number; readonly lap?: number; readonly status?: ICheckpointRaceState["status"]; readonly timeSeconds?: number } = {}): ICheckpointRaceState {
    return freezeCheckpointState({
      checkpoint: Math.max(0, Math.trunc(NumberEx.finite(options.checkpoint, 0))),
      events: [],
      lap: Math.max(0, Math.trunc(NumberEx.finite(options.lap, 0))),
      status: options.status ?? "ready",
      timeSeconds: Math.max(0, NumberEx.finite(options.timeSeconds, 0)),
    });
  },
  passCheckpoint(state: ICheckpointRaceState, options: { readonly checkpointCount: number; readonly lapsToFinish?: number; readonly timeSeconds?: number }): ICheckpointRaceState {
    if (state.status !== "racing") {
      return freezeCheckpointState({ ...state, events: [] });
    }
    const checkpointCount = Math.max(1, Math.trunc(NumberEx.finite(options.checkpointCount, 1)));
    const timeSeconds = Math.max(0, NumberEx.finite(options.timeSeconds, state.timeSeconds));
    const nextCheckpoint = (Math.max(0, Math.trunc(NumberEx.finite(state.checkpoint, 0))) + 1) % checkpointCount;
    const completedLap = nextCheckpoint === 0;
    const lap = completedLap ? state.lap + 1 : state.lap;
    const lapsToFinish = Math.max(1, Math.trunc(NumberEx.finite(options.lapsToFinish, 1)));
    const finished = lap >= lapsToFinish;
    const events: ICheckpointRaceEvent[] = [
      { checkpoint: state.checkpoint, kind: "checkpoint", lap: state.lap, timeSeconds },
      ...(completedLap ? [{ checkpoint: checkpointCount - 1, kind: "lap" as const, lap, timeSeconds }] : []),
      ...(finished ? [{ checkpoint: nextCheckpoint, kind: "player-finish" as const, lap, timeSeconds }, { checkpoint: nextCheckpoint, kind: "race-finish" as const, lap, timeSeconds }] : []),
    ];
    return freezeCheckpointState({ checkpoint: nextCheckpoint, events, lap, status: finished ? "finished" : "racing", timeSeconds });
  },
  reset(state: ICheckpointRaceState): ICheckpointRaceState {
    return freezeCheckpointState({ checkpoint: 0, events: [{ checkpoint: 0, kind: "reset", lap: 0, timeSeconds: 0 }], lap: 0, status: "ready", timeSeconds: 0 });
  },
  snapshot(state: ICheckpointRaceState): ICheckpointRaceState {
    return freezeCheckpointState({ ...state, events: [...state.events] });
  },
  start(state: ICheckpointRaceState, timeSeconds = state.timeSeconds): ICheckpointRaceState {
    const time = Math.max(0, NumberEx.finite(timeSeconds, 0));
    return freezeCheckpointState({ ...state, events: [{ checkpoint: state.checkpoint, kind: "start", lap: state.lap, timeSeconds: time }], status: "racing", timeSeconds: time });
  },
  step(state: ICheckpointRaceState, dt: number): ICheckpointRaceState {
    return freezeCheckpointState({ ...state, events: [], timeSeconds: state.timeSeconds + Math.max(0, NumberEx.finite(dt, 0)) });
  },
});

export const SpawnEx = Object.freeze({
  sample(options: { readonly attempts?: number; readonly blocked?: readonly SpawnRegion[]; readonly index?: number; readonly region: SpawnRegion; readonly seed: number }): Vec2Tuple | null {
    const attempts = Math.max(1, Math.trunc(NumberEx.finite(options.attempts, 8)));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const point = sampleRegion(options.region, options.seed, (options.index ?? 0) + attempt * 2);
      if (!(options.blocked ?? []).some((blocked) => SpawnEx.contains(blocked, point))) {
        return point;
      }
    }
    return null;
  },
  contains(region: SpawnRegion, point: Vec2Value): boolean {
    const p = Vec2.from(point);
    if (region.kind === "circle") {
      return Vec2.distance(p, region.center) <= Math.max(0, NumberEx.finite(region.radius, 0));
    }
    if (region.kind === "rect") {
      const min = Vec2.from(region.min);
      const max = Vec2.from(region.max);
      return p[0] >= Math.min(min[0], max[0]) && p[0] <= Math.max(min[0], max[0]) && p[1] >= Math.min(min[1], max[1]) && p[1] <= Math.max(min[1], max[1]);
    }
    if (region.kind === "segment-corridor") {
      return distanceToSegment2(p, Vec2.from(region.from), Vec2.from(region.to)) <= Math.max(0, NumberEx.finite(region.radius, 0));
    }
    return polygonContains(region.points.map((pointEntry) => Vec2.from(pointEntry)), p);
  },
});

function angleDelta(current: number, target: number, maxDelta: number): number {
  const delta = NumberEx.repeat(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return NumberEx.clamp(delta, -maxDelta, maxDelta);
}

function axisBase(axis: BasisAxisName): string {
  return axis.replace("-", "");
}

function axisVector(axis: BasisAxisName): Vec3Tuple {
  const sign = axis.startsWith("-") ? -1 : 1;
  const base = axisBase(axis);
  return base === "x" ? [sign, 0, 0] : base === "y" ? [0, sign, 0] : [0, 0, sign];
}

function distanceToSegment2(point: Vec2Tuple, start: Vec2Tuple, end: Vec2Tuple): number {
  const segment = Vec2.sub(end, start);
  const lengthSquared = Vec2.dot(segment, segment);
  if (lengthSquared <= EPSILON) {
    return Vec2.distance(point, start);
  }
  const t = NumberEx.saturate(Vec2.dot(Vec2.sub(point, start), segment) / lengthSquared);
  return Vec2.distance(point, Vec2.add(start, Vec2.scale(segment, t)));
}

function freezeCheckpointState(state: ICheckpointRaceState): ICheckpointRaceState {
  return Object.freeze({ ...state, events: Object.freeze([...state.events]) });
}

function polygonContains(points: readonly Vec2Tuple[], point: Vec2Tuple): boolean {
  if (points.length < 3) {
    return false;
  }
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index]!;
    const previousPoint = points[previous]!;
    if ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]) && point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) / (previousPoint[1] - currentPoint[1] + EPSILON) + currentPoint[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function sampleRegion(region: SpawnRegion, seed: number, index: number): Vec2Tuple {
  if (region.kind === "circle") {
    const angle = RandomEx.range(seed, index, 0, Math.PI * 2);
    const radius = Math.sqrt(RandomEx.float01(seed, index + 1)) * Math.max(0, NumberEx.finite(region.radius, 0));
    return Vec2.add(region.center, Vec2.fromAngle(angle, radius));
  }
  if (region.kind === "polygon") {
    const points = region.points.map((point) => Vec2.from(point));
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    return [
      RandomEx.range(seed, index, Math.min(...xs), Math.max(...xs)),
      RandomEx.range(seed, index + 1, Math.min(...ys), Math.max(...ys)),
    ];
  }
  if (region.kind === "segment-corridor") {
    const t = RandomEx.float01(seed, index);
    const from = Vec2.from(region.from);
    const to = Vec2.from(region.to);
    const center = Vec2.lerp(from, to, t);
    const direction = Vec2.normalize(Vec2.sub(to, from));
    const normal: Vec2Tuple = [-direction[1], direction[0]];
    return Vec2.add(center, Vec2.scale(normal, RandomEx.range(seed, index + 1, -Math.max(0, region.radius), Math.max(0, region.radius))));
  }
  const min = Vec2.from(region.min);
  const max = Vec2.from(region.max);
  return [
    RandomEx.range(seed, index, Math.min(min[0], max[0]), Math.max(min[0], max[0])),
    RandomEx.range(seed, index + 1, Math.min(min[1], max[1]), Math.max(min[1], max[1])),
  ];
}
