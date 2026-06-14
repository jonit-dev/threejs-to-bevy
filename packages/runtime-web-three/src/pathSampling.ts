export type Vec3Tuple = readonly [number, number, number];
export type EasingKind = "linear" | "easeInQuad" | "easeOutQuad" | "easeInOutQuad";

export function ease(kind: EasingKind, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (kind === "easeInQuad") {
    return clamped * clamped;
  }
  if (kind === "easeOutQuad") {
    return clamped * (2 - clamped);
  }
  if (kind === "easeInOutQuad") {
    return clamped < 0.5 ? 2 * clamped * clamped : 1 - (-2 * clamped + 2) ** 2 / 2;
  }
  return clamped;
}

export function sampleLine(from: Vec3Tuple, to: Vec3Tuple, steps: number, easing: EasingKind = "linear"): Vec3Tuple[] {
  return sampleSteps(steps, (t) => lerpVec3(from, to, ease(easing, t)));
}

export function sampleQuadraticBezier(from: Vec3Tuple, control: Vec3Tuple, to: Vec3Tuple, steps: number, easing: EasingKind = "linear"): Vec3Tuple[] {
  return sampleSteps(steps, (t) => {
    const u = ease(easing, t);
    const a = lerpVec3(from, control, u);
    const b = lerpVec3(control, to, u);
    return lerpVec3(a, b, u);
  });
}

export function sampleCubicBezier(from: Vec3Tuple, controlA: Vec3Tuple, controlB: Vec3Tuple, to: Vec3Tuple, steps: number, easing: EasingKind = "linear"): Vec3Tuple[] {
  return sampleSteps(steps, (t) => {
    const u = ease(easing, t);
    const a = lerpVec3(from, controlA, u);
    const b = lerpVec3(controlA, controlB, u);
    const c = lerpVec3(controlB, to, u);
    return lerpVec3(lerpVec3(a, b, u), lerpVec3(b, c, u), u);
  });
}

export function sampleCatmullRom(points: readonly Vec3Tuple[], stepsPerSegment: number): Vec3Tuple[] {
  if (points.length < 2) {
    return [...points];
  }
  const samples: Vec3Tuple[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)] as Vec3Tuple;
    const p1 = points[index] as Vec3Tuple;
    const p2 = points[index + 1] as Vec3Tuple;
    const p3 = points[Math.min(points.length - 1, index + 2)] as Vec3Tuple;
    const segment = sampleSteps(stepsPerSegment, (t) => catmullRomPoint(p0, p1, p2, p3, t));
    samples.push(...(index === 0 ? segment : segment.slice(1)));
  }
  return samples;
}

function sampleSteps(steps: number, sampler: (t: number) => Vec3Tuple): Vec3Tuple[] {
  const count = Math.max(1, Math.floor(steps));
  return Array.from({ length: count + 1 }, (_, index) => sampler(index / count));
}

function lerpVec3(from: Vec3Tuple, to: Vec3Tuple, t: number): Vec3Tuple {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function catmullRomPoint(p0: Vec3Tuple, p1: Vec3Tuple, p2: Vec3Tuple, p3: Vec3Tuple, t: number): Vec3Tuple {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1, 2].map((axis) => {
    const v0 = p0[axis] as number;
    const v1 = p1[axis] as number;
    const v2 = p2[axis] as number;
    const v3 = p3[axis] as number;
    return 0.5 * ((2 * v1) + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
  }) as [number, number, number];
}
