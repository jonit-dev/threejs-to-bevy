import { NumberEx } from "./numeric.js";
import { DEFAULT_VEC2, DEFAULT_VEC3, EPSILON, vec2Parts, vec3Parts, type Vec2Tuple, type Vec2Value, type Vec3Tuple, type Vec3Value } from "./types.js";

export const Vec2 = Object.freeze({
  add(left: Vec2Value, right: Vec2Value): Vec2Tuple {
    const a = Vec2.from(left);
    const b = Vec2.from(right);
    return [a[0] + b[0], a[1] + b[1]];
  },
  angle(value: Vec2Value): number {
    const vec = Vec2.from(value);
    return Math.atan2(vec[1], vec[0]);
  },
  distance(left: Vec2Value, right: Vec2Value): number {
    return Vec2.length(Vec2.sub(left, right));
  },
  dot(left: Vec2Value, right: Vec2Value): number {
    const a = Vec2.from(left);
    const b = Vec2.from(right);
    return a[0] * b[0] + a[1] * b[1];
  },
  from(value: Vec2Value | undefined, fallback: Vec2Value = DEFAULT_VEC2): Vec2Tuple {
    const base = vec2Parts(value);
    const backup = vec2Parts(fallback);
    return [NumberEx.finite(base[0], NumberEx.finite(backup[0], 0)), NumberEx.finite(base[1], NumberEx.finite(backup[1], 0))];
  },
  fromAngle(angle: number, length = 1): Vec2Tuple {
    const size = NumberEx.finite(length, 1);
    return [Math.cos(NumberEx.finite(angle, 0)) * size, Math.sin(NumberEx.finite(angle, 0)) * size];
  },
  length(value: Vec2Value): number {
    const vec = Vec2.from(value);
    return Math.hypot(vec[0], vec[1]);
  },
  lerp(left: Vec2Value, right: Vec2Value, alpha: number): Vec2Tuple {
    const a = Vec2.from(left);
    const b = Vec2.from(right);
    const t = NumberEx.saturate(alpha);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  },
  normalize(value: Vec2Value): Vec2Tuple {
    const vec = Vec2.from(value);
    const length = Vec2.length(vec);
    return length <= EPSILON ? [0, 0] : [vec[0] / length, vec[1] / length];
  },
  rotate(value: Vec2Value, angle: number): Vec2Tuple {
    const vec = Vec2.from(value);
    const c = Math.cos(NumberEx.finite(angle, 0));
    const s = Math.sin(NumberEx.finite(angle, 0));
    return [vec[0] * c - vec[1] * s, vec[0] * s + vec[1] * c];
  },
  round(value: Vec2Value, precision = 3): Vec2Tuple {
    const vec = Vec2.from(value);
    return [NumberEx.round(vec[0], precision), NumberEx.round(vec[1], precision)];
  },
  scale(value: Vec2Value, scalar: number): Vec2Tuple {
    const vec = Vec2.from(value);
    const amount = NumberEx.finite(scalar, 0);
    return [vec[0] * amount, vec[1] * amount];
  },
  sub(left: Vec2Value, right: Vec2Value): Vec2Tuple {
    const a = Vec2.from(left);
    const b = Vec2.from(right);
    return [a[0] - b[0], a[1] - b[1]];
  },
});

export const Vec3 = Object.freeze({
  add(left: Vec3Value, right: Vec3Value): Vec3Tuple {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  },
  angle(left: Vec3Value, right: Vec3Value): number {
    const a = Vec3.normalize(left);
    const b = Vec3.normalize(right);
    return Math.acos(NumberEx.clamp(Vec3.dot(a, b), -1, 1));
  },
  cross(left: Vec3Value, right: Vec3Value): Vec3Tuple {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  },
  distance(left: Vec3Value, right: Vec3Value): number {
    return Vec3.length(Vec3.sub(left, right));
  },
  distance2d(left: Vec3Value, right: Vec3Value): number {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return Math.hypot(a[0] - b[0], a[2] - b[2]);
  },
  dot(left: Vec3Value, right: Vec3Value): number {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },
  from(value: Vec3Value | undefined, fallback: Vec3Value = DEFAULT_VEC3): Vec3Tuple {
    const base = vec3Parts(value);
    const backup = vec3Parts(fallback);
    return [
      NumberEx.finite(base[0], NumberEx.finite(backup[0], 0)),
      NumberEx.finite(base[1], NumberEx.finite(backup[1], 0)),
      NumberEx.finite(base[2], NumberEx.finite(backup[2], 0)),
    ];
  },
  length(value: Vec3Value): number {
    const vec = Vec3.from(value);
    return Math.hypot(vec[0], vec[1], vec[2]);
  },
  lerp(left: Vec3Value, right: Vec3Value, alpha: number): Vec3Tuple {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    const t = NumberEx.saturate(alpha);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  },
  moveToward(current: Vec3Value, target: Vec3Value, maxDistanceDelta: number): Vec3Tuple {
    const delta = Vec3.sub(target, current);
    const distance = Vec3.length(delta);
    if (distance <= EPSILON || distance <= NumberEx.finite(maxDistanceDelta, 0)) {
      return Vec3.from(target);
    }
    return Vec3.add(current, Vec3.scale(delta, Math.max(0, NumberEx.finite(maxDistanceDelta, 0)) / distance));
  },
  normalize(value: Vec3Value): Vec3Tuple {
    const vec = Vec3.from(value);
    const length = Vec3.length(vec);
    return length <= EPSILON ? [0, 0, 0] : [vec[0] / length, vec[1] / length, vec[2] / length];
  },
  projectOnPlane(value: Vec3Value, normal: Vec3Value): Vec3Tuple {
    const n = Vec3.normalize(normal);
    return Vec3.sub(value, Vec3.scale(n, Vec3.dot(value, n)));
  },
  rotateYaw(value: Vec3Value, yaw: number): Vec3Tuple {
    const vec = Vec3.from(value);
    const c = Math.cos(NumberEx.finite(yaw, 0));
    const s = Math.sin(NumberEx.finite(yaw, 0));
    return [vec[0] * c + vec[2] * s, vec[1], vec[2] * c - vec[0] * s];
  },
  round(value: Vec3Value, precision = 3): Vec3Tuple {
    const vec = Vec3.from(value);
    return [NumberEx.round(vec[0], precision), NumberEx.round(vec[1], precision), NumberEx.round(vec[2], precision)];
  },
  scale(value: Vec3Value, scalar: number): Vec3Tuple {
    const vec = Vec3.from(value);
    const amount = NumberEx.finite(scalar, 0);
    return [vec[0] * amount, vec[1] * amount, vec[2] * amount];
  },
  sub(left: Vec3Value, right: Vec3Value): Vec3Tuple {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  },
  withY(value: Vec3Value, y: number): Vec3Tuple {
    const vec = Vec3.from(value);
    return [vec[0], NumberEx.finite(y, 0), vec[2]];
  },
});

export const Vector2 = Vec2;
export const Vector3 = Vec3;
