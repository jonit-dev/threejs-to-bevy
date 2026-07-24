import type { ICosmeticTransformComponent, ITransformComponent, Quat, Vec3 } from "./types.js";

const IDENTITY_POSITION: Vec3 = [0, 0, 0];
const IDENTITY_ROTATION: Quat = [0, 0, 0, 1];
const IDENTITY_SCALE: Vec3 = [1, 1, 1];

/**
 * Composes the durable/simulated Transform with a bounded runtime-local
 * cosmetic layer using matrix order `base * cosmeticLocal`.
 */
export function composeTransformLayers(
  base: ITransformComponent | undefined,
  cosmeticLocal: ICosmeticTransformComponent | undefined,
): Required<ITransformComponent> {
  const basePosition = base?.position ?? IDENTITY_POSITION;
  const baseRotation = normalizeQuat(base?.rotation ?? IDENTITY_ROTATION);
  const baseScale = base?.scale ?? IDENTITY_SCALE;
  const localPosition = cosmeticLocal?.position ?? IDENTITY_POSITION;
  const scaledLocal: Vec3 = [
    localPosition[0] * baseScale[0],
    localPosition[1] * baseScale[1],
    localPosition[2] * baseScale[2],
  ];
  const rotatedLocal = rotateVec3(baseRotation, scaledLocal);
  return {
    position: [
      basePosition[0] + rotatedLocal[0],
      basePosition[1] + rotatedLocal[1],
      basePosition[2] + rotatedLocal[2],
    ],
    rotation: normalizeQuat(multiplyQuat(baseRotation, cosmeticLocal?.rotation ?? IDENTITY_ROTATION)),
    scale: [
      baseScale[0] * (cosmeticLocal?.scale?.[0] ?? 1),
      baseScale[1] * (cosmeticLocal?.scale?.[1] ?? 1),
      baseScale[2] * (cosmeticLocal?.scale?.[2] ?? 1),
    ],
  };
}

function multiplyQuat(left: Quat, right: Quat): Quat {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ];
}

function normalizeQuat(value: Quat): Quat {
  const length = Math.hypot(...value);
  return length > 1e-9
    ? [value[0] / length, value[1] / length, value[2] / length, value[3] / length]
    : [...IDENTITY_ROTATION];
}

function rotateVec3(rotation: Quat, value: Vec3): Vec3 {
  const [x, y, z, w] = rotation;
  const [vx, vy, vz] = value;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}
