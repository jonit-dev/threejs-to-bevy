import { NumberEx } from "./numeric.js";
import { Quat, TransformMath } from "./rotation.js";
import { RandomEx } from "./feedback.js";
import { Vec2, Vec3 } from "./vectors.js";
import { DEFAULT_VEC2, DEFAULT_VEC3, EPSILON, type QuatTuple, type Vec2Tuple, type Vec2Value, type Vec3Tuple, type Vec3Value } from "./types.js";

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
