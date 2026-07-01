import { NumberEx } from "./numeric.js";
import { Vec3 } from "./vectors.js";
import { DEFAULT_QUAT, DEFAULT_VEC3, EPSILON, isRecord, quatParts, type QuatTuple, type QuatValue, type Vec3Tuple, type Vec3Value } from "./types.js";

export const Quat = Object.freeze({
  identity(): QuatTuple {
    return DEFAULT_QUAT;
  },
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
  fromEuler(pitch = 0, yaw = 0, roll = 0): QuatTuple {
    const cy = Math.cos(NumberEx.finite(yaw, 0) * 0.5);
    const sy = Math.sin(NumberEx.finite(yaw, 0) * 0.5);
    const cp = Math.cos(NumberEx.finite(pitch, 0) * 0.5);
    const sp = Math.sin(NumberEx.finite(pitch, 0) * 0.5);
    const cr = Math.cos(NumberEx.finite(roll, 0) * 0.5);
    const sr = Math.sin(NumberEx.finite(roll, 0) * 0.5);
    return Quat.normalize([sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy, cr * cp * cy + sr * sp * sy]);
  },
  fromYaw(yaw: number): QuatTuple {
    return Quat.fromEuler(0, yaw, 0);
  },
  lookAt(eye: Vec3Value, target: Vec3Value): QuatTuple {
    return Quat.lookRotation(Vec3.sub(target, eye));
  },
  lookRotation(forwardValue: Vec3Value, upValue: Vec3Value = [0, 1, 0]): QuatTuple {
    const forward = Vec3.normalize(forwardValue);
    if (Vec3.length(forward) <= EPSILON) {
      return DEFAULT_QUAT;
    }
    const up = Vec3.normalize(upValue);
    const zAxis = Vec3.scale(forward, -1);
    const xAxis = Vec3.normalize(Vec3.cross(up, zAxis));
    if (Vec3.length(xAxis) <= EPSILON) {
      return Quat.fromYaw(Math.atan2(forward[0], forward[2]));
    }
    const yAxis = Vec3.cross(zAxis, xAxis);
    return quatFromBasis(xAxis, yAxis, zAxis);
  },
  multiply(left: QuatValue, right: QuatValue): QuatTuple {
    const a = Quat.from(left);
    const b = Quat.from(right);
    return Quat.normalize([
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]);
  },
  normalize(value: QuatValue): QuatTuple {
    const q = Quat.from(value);
    const length = Math.hypot(q[0], q[1], q[2], q[3]);
    return length <= EPSILON ? DEFAULT_QUAT : [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
  },
  rotateVec3(rotation: QuatValue, value: Vec3Value): Vec3Tuple {
    const q = Quat.normalize(rotation);
    const v = Vec3.from(value);
    const u: Vec3Tuple = [q[0], q[1], q[2]];
    return Vec3.add(Vec3.add(Vec3.scale(u, 2 * Vec3.dot(u, v)), Vec3.scale(v, q[3] * q[3] - Vec3.dot(u, u))), Vec3.scale(Vec3.cross(u, v), 2 * q[3]));
  },
  slerp(left: QuatValue, right: QuatValue, alpha: number): QuatTuple {
    let a = Quat.normalize(left);
    let b = Quat.normalize(right);
    let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (dot < 0) {
      b = [-b[0], -b[1], -b[2], -b[3]];
      dot = -dot;
    }
    const t = NumberEx.saturate(alpha);
    if (dot > 0.9995) {
      return Quat.normalize([NumberEx.lerp(a[0], b[0], t), NumberEx.lerp(a[1], b[1], t), NumberEx.lerp(a[2], b[2], t), NumberEx.lerp(a[3], b[3], t)]);
    }
    const theta0 = Math.acos(NumberEx.clamp(dot, -1, 1));
    const theta = theta0 * t;
    const sinTheta = Math.sin(theta);
    const sinTheta0 = Math.sin(theta0);
    const scale0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
    const scale1 = sinTheta / sinTheta0;
    return [a[0] * scale0 + b[0] * scale1, a[1] * scale0 + b[1] * scale1, a[2] * scale0 + b[2] * scale1, a[3] * scale0 + b[3] * scale1];
  },
  yaw(rotation: QuatValue | undefined, fallback = 0): number {
    const q = Quat.from(rotation);
    const siny = 2 * (q[3] * q[1] + q[2] * q[0]);
    const cosy = 1 - 2 * (q[1] * q[1] + q[2] * q[2]);
    return NumberEx.finite(Math.atan2(siny, cosy), fallback);
  },
});

export const TransformMath = Object.freeze({
  forward(pose: { readonly rotation?: QuatValue } | QuatValue): Vec3Tuple {
    return Quat.rotateVec3(readRotation(pose) ?? DEFAULT_QUAT, [0, 0, 1]);
  },
  lookAtPose(eye: Vec3Value, target: Vec3Value): { readonly position: Vec3Tuple; readonly rotation: QuatTuple } {
    return { position: Vec3.from(eye), rotation: Quat.lookAt(eye, target) };
  },
  pose(options: { readonly position?: Vec3Value; readonly rotation?: QuatValue; readonly yaw?: number }): { readonly position: Vec3Tuple; readonly rotation: QuatTuple } {
    return { position: Vec3.from(options.position), rotation: options.rotation === undefined ? Quat.fromYaw(options.yaw ?? 0) : Quat.from(options.rotation) };
  },
  position(value: unknown, fallback: Vec3Value = DEFAULT_VEC3): Vec3Tuple {
    return isRecord(value) && "position" in value ? Vec3.from(value.position as Vec3Value, fallback) : Vec3.from(value as Vec3Value, fallback);
  },
  right(pose: { readonly rotation?: QuatValue } | QuatValue): Vec3Tuple {
    return Quat.rotateVec3(readRotation(pose) ?? DEFAULT_QUAT, [1, 0, 0]);
  },
  translate(pose: { readonly position?: Vec3Value; readonly rotation?: QuatValue }, offset: Vec3Value): { readonly position: Vec3Tuple; readonly rotation: QuatTuple } {
    return { position: Vec3.add(Vec3.from(pose.position), offset), rotation: Quat.from(pose.rotation) };
  },
  up(pose: { readonly rotation?: QuatValue } | QuatValue): Vec3Tuple {
    return Quat.rotateVec3(readRotation(pose) ?? DEFAULT_QUAT, [0, 1, 0]);
  },
  withPosition(pose: { readonly position?: Vec3Value; readonly rotation?: QuatValue }, position: Vec3Value): { readonly position: Vec3Tuple; readonly rotation: QuatTuple } {
    return { position: Vec3.from(position), rotation: Quat.from(pose.rotation) };
  },
  yaw(rotation: unknown, fallback = 0): number {
    return isRecord(rotation) && "rotation" in rotation ? Quat.yaw(rotation.rotation as QuatValue, fallback) : Quat.yaw(rotation as QuatValue, fallback);
  },
});

function quatFromBasis(x: Vec3Tuple, y: Vec3Tuple, z: Vec3Tuple): QuatTuple {
  const trace = x[0] + y[1] + z[2];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return Quat.normalize([(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, 0.25 * s]);
  }
  if (x[0] > y[1] && x[0] > z[2]) {
    const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2;
    return Quat.normalize([0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]);
  }
  if (y[1] > z[2]) {
    const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2;
    return Quat.normalize([(y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s]);
  }
  const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2;
  return Quat.normalize([(z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s, (x[1] - y[0]) / s]);
}

function readRotation(pose: { readonly rotation?: QuatValue } | QuatValue): QuatValue | undefined {
  return isRecord(pose) && "rotation" in pose ? (pose.rotation as QuatValue | undefined) : (pose as QuatValue | undefined);
}

