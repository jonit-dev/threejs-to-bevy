export type Vec3Tuple = readonly [number, number, number];
export type QuatTuple = readonly [number, number, number, number];

export interface ITransformSample {
  position?: Vec3Tuple;
  rotation?: QuatTuple;
  scale?: Vec3Tuple;
}

export function interpolateVec3(from: Vec3Tuple, to: Vec3Tuple, alpha: number): Vec3Tuple {
  const t = clamp01(alpha);
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

export function interpolateQuat(from: QuatTuple, to: QuatTuple, alpha: number): QuatTuple {
  const t = clamp01(alpha);
  let dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3];
  const target: [number, number, number, number] = dot < 0 ? [-to[0], -to[1], -to[2], -to[3]] : [to[0], to[1], to[2], to[3]];
  dot = Math.abs(dot);
  if (dot > 0.9995) {
    return normalizeQuat([
      from[0] + (target[0] - from[0]) * t,
      from[1] + (target[1] - from[1]) * t,
      from[2] + (target[2] - from[2]) * t,
      from[3] + (target[3] - from[3]) * t,
    ]);
  }
  const theta0 = Math.acos(dot);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return [
    from[0] * s0 + target[0] * s1,
    from[1] * s0 + target[1] * s1,
    from[2] * s0 + target[2] * s1,
    from[3] * s0 + target[3] * s1,
  ];
}

export function interpolateTransform(from: ITransformSample, to: ITransformSample, alpha: number): ITransformSample {
  return {
    position: interpolateVec3(from.position ?? [0, 0, 0], to.position ?? [0, 0, 0], alpha),
    rotation: interpolateQuat(from.rotation ?? [0, 0, 0, 1], to.rotation ?? [0, 0, 0, 1], alpha),
    scale: interpolateVec3(from.scale ?? [1, 1, 1], to.scale ?? [1, 1, 1], alpha),
  };
}

export function smoothDampVec3(current: Vec3Tuple, target: Vec3Tuple, smoothing: number, deltaSeconds: number): Vec3Tuple {
  const factor = 1 - Math.exp(-Math.max(0, smoothing) * Math.max(0, deltaSeconds));
  return interpolateVec3(current, target, factor);
}

function normalizeQuat(value: QuatTuple): QuatTuple {
  const length = Math.hypot(value[0], value[1], value[2], value[3]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length, value[3] / length];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
