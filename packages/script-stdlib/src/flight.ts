import { CoordinatedTurnEx } from "./combat.js";
import { NumberEx } from "./numeric.js";
import type { QuatTuple, Vec3Tuple } from "./types.js";

export interface IFlightRigBindings {
  readonly aileronLeft?: string;
  readonly aileronRight?: string;
  readonly elevator: string;
  readonly thruster: string;
}

export interface IFlightRigInput {
  readonly pitch?: number;
  readonly retry?: boolean;
  readonly roll?: number;
  readonly throttleDown?: boolean;
  readonly throttleUp?: boolean;
  readonly yaw?: number;
}

export interface IFlightRigSample {
  readonly altitude: number;
  readonly angularVelocity?: Vec3Tuple;
  readonly dt: number;
  readonly integrity?: number;
  readonly velocity: Vec3Tuple;
}

export interface IFlightRigState {
  elapsed: number;
  failed: boolean;
  phase: "cruise" | "ditched" | "ready" | "retry" | "stall";
  retryCount: number;
  stall: boolean;
  throttle: number;
}

export interface IFlightRigTuning {
  readonly completeAfter?: number;
  readonly ditchAltitude?: number;
  readonly ditchMushAltitude?: number;
  readonly ditchMushSpeed?: number;
  readonly elevatorSign?: -1 | 1;
  readonly initialThrottle?: number;
  readonly retryPose?: {
    readonly position: Vec3Tuple;
    readonly rotation?: QuatTuple;
    readonly velocity: Vec3Tuple;
  };
  readonly stallSpeed?: number;
  readonly throttleRate?: number;
  readonly turnGains?: Partial<IFlightRigTurnGains>;
  readonly yawMix?: number;
}

export interface IFlightRigTurnGains {
  readonly pitchDamping: number;
  readonly rollDamping: number;
  readonly yawAuthority: number;
  readonly yawDamping: number;
}

export interface IFlightRigTelemetry {
  readonly altitude: number;
  readonly complete: boolean;
  readonly elapsed: number;
  readonly failed: boolean;
  readonly phase: IFlightRigState["phase"];
  readonly retryCount: number;
  readonly speed: number;
  readonly stall: boolean;
  readonly throttle: number;
}

export interface IFlightRigResult {
  readonly controls: {
    readonly surfaces: Record<string, number>;
    readonly thrusters: Record<string, number>;
  };
  readonly retryPose?: {
    readonly position: Vec3Tuple;
    readonly rotation: QuatTuple;
    readonly velocity: Vec3Tuple;
  };
  readonly state: IFlightRigState;
  readonly telemetry: IFlightRigTelemetry;
  readonly torque: Vec3Tuple;
  readonly velocity: Vec3Tuple;
}

const DEFAULT_TURN_GAINS: IFlightRigTurnGains = {
  pitchDamping: 30_000,
  rollDamping: 55_000,
  yawAuthority: 14_000,
  yawDamping: 25_000,
};

export const FlightRig = Object.freeze({
  initialState(tuning: IFlightRigTuning = {}): IFlightRigState {
    return {
      elapsed: 0,
      failed: false,
      phase: "ready",
      retryCount: 0,
      stall: false,
      throttle: NumberEx.saturate(tuning.initialThrottle ?? 0),
    };
  },

  step(
    current: Readonly<IFlightRigState>,
    input: IFlightRigInput,
    sample: IFlightRigSample,
    bindings: IFlightRigBindings,
    tuning: IFlightRigTuning = {},
  ): IFlightRigResult {
    const dt = Math.max(0, NumberEx.finite(sample.dt, 0));
    const initialThrottle = NumberEx.saturate(tuning.initialThrottle ?? 0);
    const retryCount = current.retryCount + (input.retry === true ? 1 : 0);
    let throttle = input.retry === true ? initialThrottle : NumberEx.saturate(current.throttle);
    const throttleDirection = Number(input.throttleUp === true) - Number(input.throttleDown === true);
    throttle = NumberEx.clamp(throttle + throttleDirection * Math.max(0, tuning.throttleRate ?? 0.22) * dt, 0, 1);

    const pitch = NumberEx.clamp(input.pitch ?? 0, -1, 1);
    const roll = NumberEx.clamp(input.roll ?? 0, -1, 1);
    const yaw = NumberEx.clamp(input.yaw ?? 0, -1, 1);
    const turnInput = NumberEx.clamp(roll + yaw * NumberEx.finite(tuning.yawMix, 0.7), -1, 1);
    const turn = CoordinatedTurnEx.step({
      angularVelocity: sample.angularVelocity ?? [0, 0, 0],
      dt,
      gains: { ...DEFAULT_TURN_GAINS, ...tuning.turnGains },
      turnInput,
      velocity: sample.velocity,
    });
    const speed = Math.hypot(...sample.velocity);
    const measuredStall = speed < Math.max(0, tuning.stallSpeed ?? 36);
    const measuredFailure = NumberEx.finite(sample.integrity, 100) <= 0
      || sample.altitude < NumberEx.finite(tuning.ditchAltitude, 5)
      || (
        sample.altitude < NumberEx.finite(tuning.ditchMushAltitude, 22)
        && speed < Math.max(0, tuning.ditchMushSpeed ?? 24)
      );
    const stall = input.retry === true ? false : measuredStall;
    const failed = input.retry === true ? false : measuredFailure;
    const elapsed = input.retry === true ? 0 : current.elapsed + (failed ? 0 : dt);
    const phase: IFlightRigState["phase"] = input.retry === true
      ? "retry"
      : failed
        ? "ditched"
        : stall
          ? "stall"
          : "cruise";
    const state: IFlightRigState = { elapsed, failed, phase, retryCount, stall, throttle };
    const surfaces: Record<string, number> = {
      [bindings.elevator]: pitch * (tuning.elevatorSign ?? -1),
    };
    if (bindings.aileronLeft !== undefined) surfaces[bindings.aileronLeft] = roll;
    if (bindings.aileronRight !== undefined) surfaces[bindings.aileronRight] = -roll;
    const retryPose = input.retry !== true || tuning.retryPose === undefined
      ? undefined
      : {
          position: tuning.retryPose.position,
          rotation: tuning.retryPose.rotation ?? [0, 0, 0, 1] as QuatTuple,
          velocity: tuning.retryPose.velocity,
        };
    return {
      controls: {
        surfaces,
        thrusters: { [bindings.thruster]: throttle },
      },
      ...(retryPose === undefined ? {} : { retryPose }),
      state,
      telemetry: {
        altitude: sample.altitude,
        complete: elapsed >= Math.max(0, tuning.completeAfter ?? Number.POSITIVE_INFINITY),
        elapsed,
        failed,
        phase,
        retryCount,
        speed,
        stall,
        throttle,
      },
      torque: turn.torque,
      velocity: turn.velocity,
    };
  },
});
