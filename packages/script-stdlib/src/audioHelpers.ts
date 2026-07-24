import { NumberEx } from "./numeric.js";

export interface IAudioCueDecision {
  readonly fire: boolean;
  readonly nextActive: boolean;
}

export interface IRateLimitedCueDecision {
  readonly fire: boolean;
  readonly nextReadyAt: number;
}

export interface IPropellerResult {
  readonly clipSpeed: number;
  readonly discBlend: number;
  readonly discScale: number;
}

export const AudioCueEx = Object.freeze({
  rising(previousActive: boolean, active: boolean): IAudioCueDecision {
    return { fire: active && !previousActive, nextActive: active };
  },

  rateLimited(now: number, readyAt: number, interval: number, active = true): IRateLimitedCueDecision {
    const time = NumberEx.finite(now, 0);
    const nextReadyAt = NumberEx.finite(readyAt, Number.NEGATIVE_INFINITY);
    const fire = active && time >= nextReadyAt;
    return {
      fire,
      nextReadyAt: fire ? time + Math.max(0, NumberEx.finite(interval, 0)) : nextReadyAt,
    };
  },
});

export const PropellerEx = Object.freeze({
  step(
    currentBlend: number,
    throttle: number,
    dt: number,
    tuning: {
      readonly blendRate?: number;
      readonly discEnd?: number;
      readonly discScale?: number;
      readonly discStart?: number;
      readonly maxClipSpeed?: number;
      readonly minClipSpeed?: number;
    } = {},
  ): IPropellerResult {
    const normalizedThrottle = NumberEx.saturate(throttle);
    const discStart = NumberEx.finite(tuning.discStart, 0.3);
    const discEnd = Math.max(discStart + Number.EPSILON, NumberEx.finite(tuning.discEnd, 0.65));
    const targetBlend = NumberEx.saturate((normalizedThrottle - discStart) / (discEnd - discStart));
    const blend = NumberEx.lerp(
      NumberEx.saturate(currentBlend),
      targetBlend,
      Math.max(0, NumberEx.finite(dt, 0)) * Math.max(0, NumberEx.finite(tuning.blendRate, 3)),
    );
    const minClipSpeed = Math.max(0, NumberEx.finite(tuning.minClipSpeed, 1.5));
    const maxClipSpeed = Math.max(minClipSpeed, NumberEx.finite(tuning.maxClipSpeed, 36.5));
    return {
      clipSpeed: NumberEx.lerp(minClipSpeed, maxClipSpeed, normalizedThrottle),
      discBlend: blend,
      discScale: Math.max(0.001, blend) * Math.max(0, NumberEx.finite(tuning.discScale, 0.5)),
    };
  },
});
