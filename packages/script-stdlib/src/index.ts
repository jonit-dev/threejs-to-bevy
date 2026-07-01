export type Vec3Value = readonly [number, number, number] | ReadonlyArray<number> | { readonly x?: number; readonly y?: number; readonly z?: number };
export type QuatValue = readonly [number, number, number, number] | ReadonlyArray<number> | { readonly w?: number; readonly x?: number; readonly y?: number; readonly z?: number };
export type Vec3Tuple = readonly [number, number, number];
export type QuatTuple = readonly [number, number, number, number];

const DEFAULT_VEC3: Vec3Tuple = [0, 0, 0];
const DEFAULT_QUAT: QuatTuple = [0, 0, 0, 1];

export const NumberEx = Object.freeze({
  clamp(value: number, min: number, max: number): number {
    const finiteValue = NumberEx.finite(value, min);
    return Math.min(Math.max(finiteValue, min), max);
  },
  finite(value: number | undefined, fallback: number | undefined): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback ?? 0;
  },
  round(value: number, precision = 3): number {
    const scale = 10 ** Math.max(0, Math.trunc(NumberEx.finite(precision, 3)));
    return Math.round(NumberEx.finite(value, 0) * scale) / scale;
  },
});

export const Vec3 = Object.freeze({
  add(left: Vec3Value, right: Vec3Value): Vec3Tuple {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  },
  cross(left: Vec3Value, right: Vec3Value): Vec3Tuple {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  },
  distance2d(left: Vec3Value, right: Vec3Value): number {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return Math.hypot(a[0] - b[0], a[2] - b[2]);
  },
  from(value: Vec3Value | undefined, fallback: Vec3Value = DEFAULT_VEC3): Vec3Tuple {
    const base = vectorParts(value);
    const backup = vectorParts(fallback);
    return [
      NumberEx.finite(base[0], NumberEx.finite(backup[0], 0)),
      NumberEx.finite(base[1], NumberEx.finite(backup[1], 0)),
      NumberEx.finite(base[2], NumberEx.finite(backup[2], 0)),
    ];
  },
  lerp(left: Vec3Value, right: Vec3Value, alpha: number): Vec3Tuple {
    const t = NumberEx.clamp(alpha, 0, 1);
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  },
  normalize(value: Vec3Value): Vec3Tuple {
    const vec = Vec3.from(value);
    const length = Math.hypot(vec[0], vec[1], vec[2]);
    if (length <= 1e-9) {
      return [0, 0, 0];
    }
    return [vec[0] / length, vec[1] / length, vec[2] / length];
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
});

export const Quat = Object.freeze({
  from(value: QuatValue | undefined, fallback: QuatValue = DEFAULT_QUAT): QuatTuple {
    const base = quatParts(value);
    const backup = quatParts(fallback);
    return [
      NumberEx.finite(base[0], NumberEx.finite(backup[0], 0)),
      NumberEx.finite(base[1], NumberEx.finite(backup[1], 0)),
      NumberEx.finite(base[2], NumberEx.finite(backup[2], 0)),
      NumberEx.finite(base[3], NumberEx.finite(backup[3], 1)),
    ];
  },
  fromYaw(yaw: number): QuatTuple {
    const half = NumberEx.finite(yaw, 0) / 2;
    return [0, Math.sin(half), 0, Math.cos(half)];
  },
  lookAt(eye: Vec3Value, target: Vec3Value): QuatTuple {
    const forward = Vec3.normalize(Vec3.sub(target, eye));
    if (Vec3.distance2d(forward, DEFAULT_VEC3) <= 1e-9 && Math.abs(forward[1]) <= 1e-9) {
      return DEFAULT_QUAT;
    }
    return Quat.fromYaw(Math.atan2(forward[0], forward[2]));
  },
  yaw(rotation: QuatValue | undefined, fallback = 0): number {
    const q = Quat.from(rotation);
    const siny = 2 * (q[3] * q[1] + q[2] * q[0]);
    const cosy = 1 - 2 * (q[1] * q[1] + q[2] * q[2]);
    const yaw = Math.atan2(siny, cosy);
    return NumberEx.finite(yaw, fallback);
  },
});

export const TransformMath = Object.freeze({
  pose(options: { readonly position?: Vec3Value; readonly yaw?: number }): { readonly position: Vec3Tuple; readonly rotation: QuatTuple } {
    return {
      position: Vec3.from(options.position),
      rotation: Quat.fromYaw(options.yaw ?? 0),
    };
  },
  position(value: unknown, fallback: Vec3Value = DEFAULT_VEC3): Vec3Tuple {
    if (isRecord(value) && "position" in value) {
      return Vec3.from(value.position as Vec3Value, fallback);
    }
    return Vec3.from(value as Vec3Value, fallback);
  },
  yaw(rotation: unknown, fallback = 0): number {
    if (isRecord(rotation) && "rotation" in rotation) {
      return Quat.yaw(rotation.rotation as QuatValue, fallback);
    }
    return Quat.yaw(rotation as QuatValue, fallback);
  },
});

export const SCRIPT_STDLIB_BUNDLE_SOURCE = String.raw`
const NumberEx = Object.freeze({
  clamp(value, min, max) {
    const finiteValue = NumberEx.finite(value, min);
    return Math.min(Math.max(finiteValue, min), max);
  },
  finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  },
  round(value, precision = 3) {
    const scale = 10 ** Math.max(0, Math.trunc(NumberEx.finite(precision, 3)));
    return Math.round(NumberEx.finite(value, 0) * scale) / scale;
  },
});
const Vec3 = Object.freeze({
  add(left, right) {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  },
  cross(left, right) {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  },
  distance2d(left, right) {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return Math.hypot(a[0] - b[0], a[2] - b[2]);
  },
  from(value, fallback = [0, 0, 0]) {
    const base = vectorParts(value);
    const backup = vectorParts(fallback);
    return [
      NumberEx.finite(base[0], NumberEx.finite(backup[0], 0)),
      NumberEx.finite(base[1], NumberEx.finite(backup[1], 0)),
      NumberEx.finite(base[2], NumberEx.finite(backup[2], 0)),
    ];
  },
  lerp(left, right, alpha) {
    const t = NumberEx.clamp(alpha, 0, 1);
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  },
  normalize(value) {
    const vec = Vec3.from(value);
    const length = Math.hypot(vec[0], vec[1], vec[2]);
    if (length <= 1e-9) {
      return [0, 0, 0];
    }
    return [vec[0] / length, vec[1] / length, vec[2] / length];
  },
  round(value, precision = 3) {
    const vec = Vec3.from(value);
    return [NumberEx.round(vec[0], precision), NumberEx.round(vec[1], precision), NumberEx.round(vec[2], precision)];
  },
  scale(value, scalar) {
    const vec = Vec3.from(value);
    const amount = NumberEx.finite(scalar, 0);
    return [vec[0] * amount, vec[1] * amount, vec[2] * amount];
  },
  sub(left, right) {
    const a = Vec3.from(left);
    const b = Vec3.from(right);
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  },
});
const Quat = Object.freeze({
  from(value, fallback = [0, 0, 0, 1]) {
    const base = quatParts(value);
    const backup = quatParts(fallback);
    return [
      NumberEx.finite(base[0], NumberEx.finite(backup[0], 0)),
      NumberEx.finite(base[1], NumberEx.finite(backup[1], 0)),
      NumberEx.finite(base[2], NumberEx.finite(backup[2], 0)),
      NumberEx.finite(base[3], NumberEx.finite(backup[3], 1)),
    ];
  },
  fromYaw(yaw) {
    const half = NumberEx.finite(yaw, 0) / 2;
    return [0, Math.sin(half), 0, Math.cos(half)];
  },
  lookAt(eye, target) {
    const forward = Vec3.normalize(Vec3.sub(target, eye));
    if (Vec3.distance2d(forward, [0, 0, 0]) <= 1e-9 && Math.abs(forward[1]) <= 1e-9) {
      return [0, 0, 0, 1];
    }
    return Quat.fromYaw(Math.atan2(forward[0], forward[2]));
  },
  yaw(rotation, fallback = 0) {
    const q = Quat.from(rotation);
    const siny = 2 * (q[3] * q[1] + q[2] * q[0]);
    const cosy = 1 - 2 * (q[1] * q[1] + q[2] * q[2]);
    const yaw = Math.atan2(siny, cosy);
    return NumberEx.finite(yaw, fallback);
  },
});
const TransformMath = Object.freeze({
  pose(options) {
    return {
      position: Vec3.from(options.position),
      rotation: Quat.fromYaw(options.yaw ?? 0),
    };
  },
  position(value, fallback = [0, 0, 0]) {
    if (isRecord(value) && "position" in value) {
      return Vec3.from(value.position, fallback);
    }
    return Vec3.from(value, fallback);
  },
  yaw(rotation, fallback = 0) {
    if (isRecord(rotation) && "rotation" in rotation) {
      return Quat.yaw(rotation.rotation, fallback);
    }
    return Quat.yaw(rotation, fallback);
  },
});
function vectorParts(value) {
  if (Array.isArray(value)) {
    return [value[0], value[1], value[2]];
  }
  if (isRecord(value)) {
    return [value.x, value.y, value.z];
  }
  return [undefined, undefined, undefined];
}
function quatParts(value) {
  if (Array.isArray(value)) {
    return [value[0], value[1], value[2], value[3]];
  }
  if (isRecord(value)) {
    return [value.x, value.y, value.z, value.w];
  }
  return [undefined, undefined, undefined, undefined];
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
`.trim();

function vectorParts(value: Vec3Value | undefined): [number | undefined, number | undefined, number | undefined] {
  if (Array.isArray(value)) {
    return [value[0], value[1], value[2]];
  }
  if (isRecord(value)) {
    return [value.x, value.y, value.z];
  }
  return [undefined, undefined, undefined];
}

function quatParts(value: QuatValue | undefined): [number | undefined, number | undefined, number | undefined, number | undefined] {
  if (Array.isArray(value)) {
    return [value[0], value[1], value[2], value[3]];
  }
  if (isRecord(value)) {
    return [value.x, value.y, value.z, value.w];
  }
  return [undefined, undefined, undefined, undefined];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
