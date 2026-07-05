export interface ILaneRunnerState {
  distance: number;
  lane: number;
  score: number;
  speed: number;
  status: "failed" | "playing";
}

export const LaneRunnerKit = Object.freeze({
  initial(options: { lane?: number; speed?: number } = {}): ILaneRunnerState {
    return Object.freeze({
      distance: 0,
      lane: Math.trunc(finite(options.lane, 0)),
      score: 0,
      speed: Math.max(0, finite(options.speed, 6)),
      status: "playing",
    });
  },
  steer(state: ILaneRunnerState, direction: -1 | 0 | 1, options: { laneCount?: number } = {}): ILaneRunnerState {
    const laneCount = Math.max(1, Math.trunc(finite(options.laneCount, 3)));
    const maxLane = laneCount - 1;
    return Object.freeze({
      ...cloneState(state),
      lane: clamp(Math.trunc(finite(state.lane, 0)) + direction, 0, maxLane),
    });
  },
  tick(state: ILaneRunnerState, deltaSeconds: number, options: { acceleration?: number; pointsPerMeter?: number } = {}): ILaneRunnerState {
    if (state.status !== "playing") {
      return cloneState(state);
    }
    const speed = Math.max(0, finite(state.speed, 0) + Math.max(0, finite(options.acceleration, 0)) * Math.max(0, finite(deltaSeconds, 0)));
    const distance = Math.max(0, finite(state.distance, 0) + speed * Math.max(0, finite(deltaSeconds, 0)));
    return Object.freeze({
      distance,
      lane: Math.trunc(finite(state.lane, 0)),
      score: Math.trunc(distance * Math.max(0, finite(options.pointsPerMeter, 1))),
      speed,
      status: "playing",
    });
  },
  collide(state: ILaneRunnerState, obstacleLane: number): ILaneRunnerState {
    return Object.freeze({
      ...cloneState(state),
      status: Math.trunc(finite(state.lane, 0)) === Math.trunc(finite(obstacleLane, 0)) ? "failed" : state.status,
    });
  },
});

function cloneState(state: ILaneRunnerState): ILaneRunnerState {
  return {
    distance: Math.max(0, finite(state.distance, 0)),
    lane: Math.trunc(finite(state.lane, 0)),
    score: Math.trunc(finite(state.score, 0)),
    speed: Math.max(0, finite(state.speed, 0)),
    status: state.status,
  };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
