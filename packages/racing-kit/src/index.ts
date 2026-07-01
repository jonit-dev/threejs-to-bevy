export type Vec3Tuple = readonly [number, number, number];
export type Vec3Value = Vec3Tuple | ReadonlyArray<number> | { readonly x?: number; readonly y?: number; readonly z?: number };

export interface ITrack2DDefinition {
  points: Vec3Tuple[];
  width: number;
}

export interface ITrack2DOptions {
  points: ReadonlyArray<Vec3Value>;
  width: number;
}

export interface ITrack2D {
  contains2d(position: Vec3Value): boolean;
  pointAtPhase(phase: number): Vec3Tuple;
  points: readonly Vec3Tuple[];
  width: number;
}

export interface ICheckpointRaceState {
  checkpoint: number;
  lap: number;
}

export interface ICheckpointRaceAdvanceResult extends ICheckpointRaceState {
  completed: boolean;
  message: string;
}

export const Track2D = Object.freeze({
  loop(options: ITrack2DOptions): ITrack2D {
    const points = normalizePoints(options.points);
    const width = finite(options.width, 1);
    const definition = Object.freeze({ points, width });
    return Object.freeze({
      points: definition.points,
      width: definition.width,
      contains2d(position: Vec3Value): boolean {
        return Track2D.contains2d(definition, position);
      },
      pointAtPhase(phase: number): Vec3Tuple {
        return Track2D.pointAtPhase(definition, phase);
      },
    });
  },
  contains2d(track: ITrack2DDefinition, position: Vec3Value): boolean {
    const points = normalizePoints(track.points);
    if (points.length === 0) {
      return false;
    }
    const width = Math.max(0, finite(track.width, 0));
    const pos = vec3(position);
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index]!;
      const end = points[(index + 1) % points.length]!;
      nearest = Math.min(nearest, distanceToSegment2d(pos, start, end));
    }
    return nearest <= width / 2;
  },
  pointAtPhase(track: ITrack2DDefinition, phase: number): Vec3Tuple {
    const points = normalizePoints(track.points);
    if (points.length === 0) {
      return [0, 0, 0];
    }
    if (points.length === 1) {
      return points[0]!;
    }
    const wrapped = wrap01(phase);
    const segmentLengths = points.map((point, index) => distance2d(point, points[(index + 1) % points.length]!));
    const total = segmentLengths.reduce((sum, length) => sum + length, 0);
    if (total <= 1e-9) {
      return points[0]!;
    }
    let targetDistance = wrapped * total;
    for (let index = 0; index < points.length; index += 1) {
      const length = segmentLengths[index]!;
      if (targetDistance <= length || index === points.length - 1) {
        const start = points[index]!;
        const end = points[(index + 1) % points.length]!;
        return lerp(start, end, length <= 1e-9 ? 0 : targetDistance / length);
      }
      targetDistance -= length;
    }
    return points[0]!;
  },
});

export const CheckpointRace = Object.freeze({
  advance(
    state: ICheckpointRaceState,
    position: Vec3Value,
    checkpoints: ReadonlyArray<Vec3Value>,
    options: { radius?: number } = {},
  ): ICheckpointRaceAdvanceResult {
    const points = normalizePoints(checkpoints);
    if (points.length === 0) {
      return { checkpoint: 0, completed: false, lap: Math.max(0, Math.trunc(finite(state.lap, 0))), message: "No checkpoints" };
    }
    const checkpoint = clampInt(state.checkpoint, 0, points.length - 1);
    const lap = Math.max(0, Math.trunc(finite(state.lap, 0)));
    const radius = Math.max(0, finite(options.radius, 1));
    const reached = distance2d(vec3(position), points[checkpoint]!) <= radius;
    if (!reached) {
      return { checkpoint, completed: false, lap, message: `Checkpoint ${checkpoint + 1}/${points.length}` };
    }
    const nextCheckpoint = (checkpoint + 1) % points.length;
    const completed = nextCheckpoint === 0;
    const nextLap = completed ? lap + 1 : lap;
    return {
      checkpoint: nextCheckpoint,
      completed,
      lap: nextLap,
      message: completed ? `Lap ${nextLap}` : `Checkpoint ${nextCheckpoint + 1}/${points.length}`,
    };
  },
  hud(state: ICheckpointRaceState & { message?: string; speed?: number }): string {
    const speed = Math.max(0, finite(state.speed, 0));
    const lap = Math.max(0, Math.trunc(finite(state.lap, 0)));
    const checkpoint = Math.max(0, Math.trunc(finite(state.checkpoint, 0))) + 1;
    const message = typeof state.message === "string" && state.message.length > 0 ? state.message : `Checkpoint ${checkpoint}`;
    return `Lap ${lap} | ${message} | ${Math.round(speed)} km/h`;
  },
});

export const RACING_KIT_BUNDLE_SOURCE = String.raw`
const Track2D = Object.freeze({
  loop(options) {
    const points = normalizePoints(options.points);
    const width = finite(options.width, 1);
    const definition = Object.freeze({ points, width });
    return Object.freeze({
      points: definition.points,
      width: definition.width,
      contains2d(position) {
        return Track2D.contains2d(definition, position);
      },
      pointAtPhase(phase) {
        return Track2D.pointAtPhase(definition, phase);
      },
    });
  },
  contains2d(track, position) {
    const points = normalizePoints(track.points);
    if (points.length === 0) {
      return false;
    }
    const width = Math.max(0, finite(track.width, 0));
    const pos = vec3(position);
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      nearest = Math.min(nearest, distanceToSegment2d(pos, start, end));
    }
    return nearest <= width / 2;
  },
  pointAtPhase(track, phase) {
    const points = normalizePoints(track.points);
    if (points.length === 0) {
      return [0, 0, 0];
    }
    if (points.length === 1) {
      return points[0];
    }
    const wrapped = wrap01(phase);
    const segmentLengths = points.map((point, index) => distance2d(point, points[(index + 1) % points.length]));
    const total = segmentLengths.reduce((sum, length) => sum + length, 0);
    if (total <= 1e-9) {
      return points[0];
    }
    let targetDistance = wrapped * total;
    for (let index = 0; index < points.length; index += 1) {
      const length = segmentLengths[index];
      if (targetDistance <= length || index === points.length - 1) {
        const start = points[index];
        const end = points[(index + 1) % points.length];
        return lerp(start, end, length <= 1e-9 ? 0 : targetDistance / length);
      }
      targetDistance -= length;
    }
    return points[0];
  },
});
const CheckpointRace = Object.freeze({
  advance(state, position, checkpoints, options = {}) {
    const points = normalizePoints(checkpoints);
    if (points.length === 0) {
      return { checkpoint: 0, completed: false, lap: Math.max(0, Math.trunc(finite(state.lap, 0))), message: "No checkpoints" };
    }
    const checkpoint = clampInt(state.checkpoint, 0, points.length - 1);
    const lap = Math.max(0, Math.trunc(finite(state.lap, 0)));
    const radius = Math.max(0, finite(options.radius, 1));
    const reached = distance2d(vec3(position), points[checkpoint]) <= radius;
    if (!reached) {
      return { checkpoint, completed: false, lap, message: "Checkpoint " + (checkpoint + 1) + "/" + points.length };
    }
    const nextCheckpoint = (checkpoint + 1) % points.length;
    const completed = nextCheckpoint === 0;
    const nextLap = completed ? lap + 1 : lap;
    return {
      checkpoint: nextCheckpoint,
      completed,
      lap: nextLap,
      message: completed ? "Lap " + nextLap : "Checkpoint " + (nextCheckpoint + 1) + "/" + points.length,
    };
  },
  hud(state) {
    const speed = Math.max(0, finite(state.speed, 0));
    const lap = Math.max(0, Math.trunc(finite(state.lap, 0)));
    const checkpoint = Math.max(0, Math.trunc(finite(state.checkpoint, 0))) + 1;
    const message = typeof state.message === "string" && state.message.length > 0 ? state.message : "Checkpoint " + checkpoint;
    return "Lap " + lap + " | " + message + " | " + Math.round(speed) + " km/h";
  },
});
function normalizePoints(points) {
  return (Array.isArray(points) ? points : []).map((point) => vec3(point));
}
function vec3(value) {
  if (Array.isArray(value)) {
    return [finite(value[0], 0), finite(value[1], 0), finite(value[2], 0)];
  }
  if (value !== null && typeof value === "object") {
    return [finite(value.x, 0), finite(value.y, 0), finite(value.z, 0)];
  }
  return [0, 0, 0];
}
function finite(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function wrap01(value) {
  const finiteValue = finite(value, 0);
  return ((finiteValue % 1) + 1) % 1;
}
function clampInt(value, min, max) {
  return Math.min(Math.max(Math.trunc(finite(value, min)), min), max);
}
function distance2d(left, right) {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}
function lerp(left, right, alpha) {
  const t = Math.min(Math.max(finite(alpha, 0), 0), 1);
  return [left[0] + (right[0] - left[0]) * t, left[1] + (right[1] - left[1]) * t, left[2] + (right[2] - left[2]) * t];
}
function distanceToSegment2d(point, start, end) {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-9) {
    return distance2d(point, start);
  }
  const t = Math.min(Math.max(((point[0] - start[0]) * dx + (point[2] - start[2]) * dz) / lengthSquared, 0), 1);
  return distance2d(point, [start[0] + dx * t, 0, start[2] + dz * t]);
}
`;

function normalizePoints(points: ReadonlyArray<Vec3Value>): Vec3Tuple[] {
  return [...points].map((point) => vec3(point));
}

function vec3(value: Vec3Value | undefined): Vec3Tuple {
  if (Array.isArray(value)) {
    return [finite(value[0], 0), finite(value[1], 0), finite(value[2], 0)];
  }
  if (value !== undefined && value !== null && typeof value === "object") {
    const record = value as { readonly x?: number; readonly y?: number; readonly z?: number };
    return [finite(record.x, 0), finite(record.y, 0), finite(record.z, 0)];
  }
  return [0, 0, 0];
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function wrap01(value: number): number {
  const finiteValue = finite(value, 0);
  return ((finiteValue % 1) + 1) % 1;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(finite(value, min)), min), max);
}

function distance2d(left: Vec3Tuple, right: Vec3Tuple): number {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}

function lerp(left: Vec3Tuple, right: Vec3Tuple, alpha: number): Vec3Tuple {
  const t = Math.min(Math.max(finite(alpha, 0), 0), 1);
  return [left[0] + (right[0] - left[0]) * t, left[1] + (right[1] - left[1]) * t, left[2] + (right[2] - left[2]) * t];
}

function distanceToSegment2d(point: Vec3Tuple, start: Vec3Tuple, end: Vec3Tuple): number {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-9) {
    return distance2d(point, start);
  }
  const t = Math.min(Math.max(((point[0] - start[0]) * dx + (point[2] - start[2]) * dz) / lengthSquared, 0), 1);
  return distance2d(point, [start[0] + dx * t, 0, start[2] + dz * t]);
}
