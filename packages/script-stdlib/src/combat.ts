import { NumberEx } from "./numeric.js";
import type { Vec3Tuple, Vec3Value } from "./types.js";
import { Vec3 } from "./vectors.js";

export interface IProjectile {
  life: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  targetId?: string;
}

export interface IProjectileSpawn {
  life: number;
  position: Vec3Value;
  velocity: Vec3Value;
  targetId?: string;
}

export interface IFireballState {
  life: number;
  x: number;
  y: number;
  z: number;
}

const PARK_Y = -9999;
const MIN_SCALE = 0.001;

export const ProjectileEx = Object.freeze({
  entityId(prefix: string, index: number, pad = 0): string {
    const value = String(Math.max(0, Math.trunc(NumberEx.finite(index, 0))));
    return `${prefix}${pad > 0 ? value.padStart(Math.trunc(pad), "0") : value}`;
  },
  parkPose(): { readonly position: Vec3Tuple; readonly scale: Vec3Tuple } {
    return { position: [0, PARK_Y, 0], scale: [MIN_SCALE, MIN_SCALE, MIN_SCALE] };
  },
  pool(size: number): IProjectile[] {
    return Array.from(
      { length: Math.max(0, Math.trunc(NumberEx.finite(size, 0))) },
      () => ({ life: 0, px: 0, py: PARK_Y, pz: 0, vx: 0, vy: 0, vz: 0 })
    );
  },
  spawn(
    pool: IProjectile[],
    cursor: number,
    initial: IProjectileSpawn
  ): { readonly cursor: number; readonly index: number; readonly round: IProjectile } {
    if (pool.length === 0) {
      throw new RangeError("ProjectileEx.spawn requires a non-empty pool.");
    }
    const index = Math.max(0, Math.trunc(NumberEx.finite(cursor, 0))) % pool.length;
    const round = pool[index]!;
    const position = Vec3.from(initial.position);
    const velocity = Vec3.from(initial.velocity);
    round.life = NumberEx.finite(initial.life, 0);
    round.px = position[0];
    round.py = position[1];
    round.pz = position[2];
    round.vx = velocity[0];
    round.vy = velocity[1];
    round.vz = velocity[2];
    if (initial.targetId === undefined) {
      delete round.targetId;
    } else {
      round.targetId = initial.targetId;
    }
    return { cursor: cursor + 1, index, round };
  },
  step(
    round: IProjectile,
    dt: number,
    options: { readonly floorY?: number; readonly parkOnExpire?: boolean } = {}
  ): "flying" | "expired" {
    if (round.life <= 0) return "expired";
    const fixedDelta = Math.max(0, NumberEx.finite(dt, 0));
    round.life -= fixedDelta;
    round.px += round.vx * fixedDelta;
    round.py += round.vy * fixedDelta;
    round.pz += round.vz * fixedDelta;
    const expired = round.life <= 0 || round.py < NumberEx.finite(options.floorY, 1);
    if (expired && options.parkOnExpire !== false) {
      round.life = 0;
      round.py = PARK_Y;
    }
    return expired ? "expired" : "flying";
  },
});

export const GunneryEx = Object.freeze({
  leadPoint(
    shooterValue: Vec3Value,
    targetValue: Vec3Value,
    targetVelocityValue: Vec3Value,
    options: {
      readonly maxLead: number;
      readonly minLead: number;
      readonly leadTime?: number;
      readonly scatter?: Vec3Value;
      readonly speed: number;
    }
  ): { readonly aim: Vec3Tuple; readonly flightTime: number; readonly velocity: Vec3Tuple } {
    const shooter = Vec3.from(shooterValue);
    const target = Vec3.from(targetValue);
    const targetVelocity = Vec3.from(targetVelocityValue);
    const speed = Math.max(0.001, NumberEx.finite(options.speed, 0.001));
    const distance = Vec3.distance(shooter, target);
    const flightTime = NumberEx.clamp(
      options.leadTime ?? distance / speed,
      NumberEx.finite(options.minLead, 0),
      NumberEx.finite(options.maxLead, 0)
    );
    const aim = Vec3.add(
      Vec3.add(target, Vec3.scale(targetVelocity, flightTime)),
      Vec3.from(options.scatter)
    );
    return {
      aim,
      flightTime,
      velocity: Vec3.scale(Vec3.normalize(Vec3.sub(aim, shooter)), speed),
    };
  },
});

export const FxEx = Object.freeze({
  envelope(age01: number): number {
    return Math.sin(NumberEx.saturate(age01) * Math.PI);
  },
  fireball(
    state: IFireballState,
    dt: number,
    options: {
      readonly duration: number;
      readonly grow: number;
      readonly rise: number;
      readonly startSize: number;
      readonly verticalScale?: number;
    }
  ): {
    readonly life: number;
    readonly position: Vec3Tuple;
    readonly scale: Vec3Tuple;
    readonly spent: boolean;
  } {
    if (state.life <= 0) {
      const parked = ProjectileEx.parkPose();
      return { life: 0, position: parked.position, scale: parked.scale, spent: true };
    }
    const duration = Math.max(0.001, NumberEx.finite(options.duration, 0.001));
    const life = Math.max(0, state.life - Math.max(0, NumberEx.finite(dt, 0)));
    const age = 1 - life / duration;
    const flare = Math.sin(Math.min(1, age * 1.15) * Math.PI);
    const size = Math.max(
      MIN_SCALE,
      flare * (NumberEx.finite(options.startSize, 0) + age * NumberEx.finite(options.grow, 0))
    );
    return {
      life,
      position: [state.x, state.y + age * NumberEx.finite(options.rise, 0), state.z],
      scale: [size, size * NumberEx.finite(options.verticalScale, 1), size],
      spent: false,
    };
  },
  flash(life: number, duration: number): number {
    if (life <= 0) return 0;
    return FxEx.envelope(NumberEx.finite(life, 0) / Math.max(0.001, NumberEx.finite(duration, 0.001)));
  },
  parkPose(): { readonly position: Vec3Tuple; readonly scale: Vec3Tuple } {
    return ProjectileEx.parkPose();
  },
  pulse(elapsed: number, rate: number, base = 0.82, amplitude = 0.18, phase = 0): number {
    return NumberEx.finite(base, 0.82)
      + Math.sin(NumberEx.finite(elapsed, 0) * NumberEx.finite(rate, 0) + NumberEx.finite(phase, 0))
        * NumberEx.finite(amplitude, 0.18);
  },
});

export const HitTestEx = Object.freeze({
  insideBox(
    pointValue: Vec3Value,
    centerValue: Vec3Value,
    bounds: { readonly halfX: number; readonly halfZ: number; readonly maxY: number; readonly minY: number }
  ): boolean {
    const point = Vec3.from(pointValue);
    const center = Vec3.from(centerValue);
    return Math.abs(point[0] - center[0]) <= bounds.halfX
      && point[1] >= center[1] + bounds.minY
      && point[1] <= center[1] + bounds.maxY
      && Math.abs(point[2] - center[2]) <= bounds.halfZ;
  },
  insideSphereSq(pointValue: Vec3Value, centerValue: Vec3Value, radiusSq: number): boolean {
    const delta = Vec3.sub(pointValue, centerValue);
    return Vec3.dot(delta, delta) <= NumberEx.finite(radiusSq, 0);
  },
  risingEdge(insideNow: boolean, wasInside: boolean): boolean {
    return insideNow && !wasInside;
  },
});

export const ShipFxEx = Object.freeze({
  sinkPose(
    originValue: Vec3Value,
    elapsed: number,
    options: {
      readonly drift: number;
      readonly roll: number;
      readonly rollDuration: number;
      readonly sinkDepth: number;
      readonly sinkDuration: number;
    }
  ): { readonly position: Vec3Tuple; readonly rotation: readonly [number, number, number, number] } {
    const origin = Vec3.from(originValue);
    const sink = NumberEx.clamp(elapsed / options.sinkDuration, 0, 1);
    const roll = NumberEx.clamp(elapsed / options.rollDuration, 0, 1) * options.roll;
    return {
      position: [
        origin[0],
        origin[1] - sink * options.sinkDepth,
        origin[2] - sink * options.drift,
      ],
      rotation: [Math.sin(roll / 2), 0, 0, Math.cos(roll / 2)],
    };
  },
});

export const GuidedFlightEx = Object.freeze({
  step(options: {
    readonly dt: number;
    readonly limits: {
      readonly acceleration: number;
      readonly climbAcceleration: number;
      readonly climbGain: number;
      readonly climbMax: number;
      readonly climbMin: number;
      readonly deceleration: number;
      readonly speed: number;
      readonly yawGain: number;
      readonly yawRate: number;
    };
    readonly position: Vec3Value;
    readonly target: Vec3Value;
    readonly velocity: Vec3Value;
  }): {
    readonly bankTarget: number;
    readonly pitchTarget: number;
    readonly velocity: Vec3Tuple;
    readonly yawRate: number;
  } {
    const dt = Math.max(0, NumberEx.finite(options.dt, 0));
    const position = Vec3.from(options.position);
    const target = Vec3.from(options.target);
    const velocity = Vec3.from(options.velocity);
    const limits = options.limits;
    const desiredYaw = Math.atan2(-(target[0] - position[0]), -(target[2] - position[2]));
    const horizontalSpeed = Math.max(0.001, Math.hypot(velocity[0], velocity[2]));
    const headingYaw = Math.atan2(-velocity[0], -velocity[2]);
    // Preserve the positive-PI choice made by the conventional while-loop
    // wrap used by existing guided-flight behaviors.
    let yawError = desiredYaw - headingYaw;
    while (yawError > Math.PI) yawError -= Math.PI * 2;
    while (yawError < -Math.PI) yawError += Math.PI * 2;
    const yawRate = NumberEx.clamp(
      yawError * limits.yawGain,
      -Math.abs(limits.yawRate),
      Math.abs(limits.yawRate)
    );
    const speed = horizontalSpeed + NumberEx.clamp(
      limits.speed - horizontalSpeed,
      -Math.abs(limits.deceleration) * dt,
      Math.abs(limits.acceleration) * dt
    );
    const theta = yawRate * dt;
    const cosTurn = Math.cos(theta);
    const sinTurn = Math.sin(theta);
    const headingX = (velocity[0] * cosTurn + velocity[2] * sinTurn) / horizontalSpeed;
    const headingZ = (-velocity[0] * sinTurn + velocity[2] * cosTurn) / horizontalSpeed;
    const climbTarget = NumberEx.clamp(
      (target[1] - position[1]) * limits.climbGain,
      limits.climbMin,
      limits.climbMax
    );
    const climb = velocity[1] + NumberEx.clamp(
      climbTarget - velocity[1],
      -Math.abs(limits.climbAcceleration) * dt,
      Math.abs(limits.climbAcceleration) * dt
    );
    const totalSpeed = Math.max(20, Vec3.length(velocity));
    return {
      bankTarget: NumberEx.clamp(-yawRate * 1.05, -0.5, 0.5),
      pitchTarget: NumberEx.clamp(Math.asin(NumberEx.clamp(climb / totalSpeed, -1, 1)), -0.32, 0.32),
      velocity: [headingX * speed, climb, headingZ * speed],
      yawRate,
    };
  },
});

export const CoordinatedTurnEx = Object.freeze({
  step(options: {
    readonly angularVelocity: Vec3Value;
    readonly dt: number;
    readonly gains: {
      readonly pitchDamping: number;
      readonly rollDamping: number;
      readonly yawAuthority: number;
      readonly yawDamping: number;
    };
    readonly turnInput: number;
    readonly velocity: Vec3Value;
  }): { readonly torque: Vec3Tuple; readonly velocity: Vec3Tuple } {
    const angularVelocity = Vec3.from(options.angularVelocity);
    const velocity = Vec3.from(options.velocity);
    const yawRate = angularVelocity[1];
    const theta = Math.abs(yawRate) > 0.0005 ? yawRate * Math.max(0, NumberEx.finite(options.dt, 0)) : 0;
    const cosTurn = Math.cos(theta);
    const sinTurn = Math.sin(theta);
    return {
      torque: [
        -angularVelocity[0] * options.gains.pitchDamping,
        -NumberEx.clamp(options.turnInput, -1, 1) * options.gains.yawAuthority
          - angularVelocity[1] * options.gains.yawDamping,
        -angularVelocity[2] * options.gains.rollDamping,
      ],
      velocity: theta === 0
        ? velocity
        : [
          velocity[0] * cosTurn + velocity[2] * sinTurn,
          velocity[1],
          -velocity[0] * sinTurn + velocity[2] * cosTurn,
        ],
    };
  },
});
