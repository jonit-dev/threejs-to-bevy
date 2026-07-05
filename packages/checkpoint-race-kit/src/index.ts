export type Vec3Tuple = readonly [number, number, number];
export type Vec3Value = Vec3Tuple | ReadonlyArray<number> | { readonly x?: number; readonly y?: number; readonly z?: number };

export interface ICheckpointRaceState {
  checkpoint: number;
  lap: number;
  missed: number;
  status: "finished" | "racing";
  timeSeconds: number;
}

export const CheckpointRaceKit = Object.freeze({
  initial(): ICheckpointRaceState {
    return Object.freeze({ checkpoint: 0, lap: 0, missed: 0, status: "racing", timeSeconds: 0 });
  },
  tick(state: ICheckpointRaceState, deltaSeconds: number): ICheckpointRaceState {
    return Object.freeze({
      ...cloneState(state),
      timeSeconds: Math.max(0, finite(state.timeSeconds, 0) + Math.max(0, finite(deltaSeconds, 0))),
    });
  },
  passCheckpoint(
    state: ICheckpointRaceState,
    position: Vec3Value,
    checkpoints: ReadonlyArray<Vec3Value>,
    options: { lapsToFinish?: number; radius?: number } = {},
  ): ICheckpointRaceState & { reached: boolean } {
    const points = checkpoints.map((checkpoint) => vec3(checkpoint));
    if (state.status !== "racing" || points.length === 0) {
      return Object.freeze({ ...cloneState(state), reached: false });
    }
    const checkpoint = clamp(Math.trunc(finite(state.checkpoint, 0)), 0, points.length - 1);
    const reached = distance2d(vec3(position), points[checkpoint]!) <= Math.max(0, finite(options.radius, 2));
    if (!reached) {
      return Object.freeze({ ...cloneState(state), checkpoint, reached: false });
    }
    const nextCheckpoint = (checkpoint + 1) % points.length;
    const lap = nextCheckpoint === 0 ? Math.trunc(finite(state.lap, 0)) + 1 : Math.trunc(finite(state.lap, 0));
    const lapsToFinish = Math.max(1, Math.trunc(finite(options.lapsToFinish, 1)));
    return Object.freeze({
      checkpoint: nextCheckpoint,
      lap,
      missed: Math.max(0, Math.trunc(finite(state.missed, 0))),
      reached: true,
      status: lap >= lapsToFinish ? "finished" : "racing",
      timeSeconds: Math.max(0, finite(state.timeSeconds, 0)),
    });
  },
  missCheckpoint(state: ICheckpointRaceState): ICheckpointRaceState {
    return Object.freeze({ ...cloneState(state), missed: Math.max(0, Math.trunc(finite(state.missed, 0))) + 1 });
  },
});

function cloneState(state: ICheckpointRaceState): ICheckpointRaceState {
  return {
    checkpoint: Math.max(0, Math.trunc(finite(state.checkpoint, 0))),
    lap: Math.max(0, Math.trunc(finite(state.lap, 0))),
    missed: Math.max(0, Math.trunc(finite(state.missed, 0))),
    status: state.status,
    timeSeconds: Math.max(0, finite(state.timeSeconds, 0)),
  };
}

function vec3(value: Vec3Value): Vec3Tuple {
  if (Array.isArray(value)) {
    return [finite(value[0], 0), finite(value[1], 0), finite(value[2], 0)];
  }
  const objectValue = value as { readonly x?: number; readonly y?: number; readonly z?: number };
  return [finite(objectValue.x, 0), finite(objectValue.y, 0), finite(objectValue.z, 0)];
}

function distance2d(left: Vec3Tuple, right: Vec3Tuple): number {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
