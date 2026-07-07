import { EPSILON } from "./types.js";

export const NumberEx = Object.freeze({
  approximately(left: number, right: number, epsilon = 0.000001): boolean {
    return Math.abs(NumberEx.finite(left, 0) - NumberEx.finite(right, 0)) <= Math.max(0, NumberEx.finite(epsilon, 0.000001));
  },
  clamp(value: number, min: number, max: number): number {
    const low = Math.min(NumberEx.finite(min, 0), NumberEx.finite(max, 0));
    const high = Math.max(NumberEx.finite(min, 0), NumberEx.finite(max, 0));
    return Math.min(Math.max(NumberEx.finite(value, low), low), high);
  },
  finite(value: number | undefined, fallback: number | undefined): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback ?? 0;
  },
  inverseLerp(min: number, max: number, value: number): number {
    const start = NumberEx.finite(min, 0);
    const end = NumberEx.finite(max, 0);
    if (Math.abs(end - start) <= EPSILON) {
      return 0;
    }
    return NumberEx.saturate((NumberEx.finite(value, start) - start) / (end - start));
  },
  moveToward(current: number, target: number, maxDelta: number): number {
    const from = NumberEx.finite(current, 0);
    const to = NumberEx.finite(target, 0);
    const delta = Math.max(0, NumberEx.finite(maxDelta, 0));
    return Math.abs(to - from) <= delta ? to : from + Math.sign(to - from) * delta;
  },
  pingPong(value: number, length = 1): number {
    const size = Math.max(EPSILON, Math.abs(NumberEx.finite(length, 1)));
    return size - Math.abs(NumberEx.repeat(value, size * 2) - size);
  },
  remap(inMin: number, inMax: number, outMin: number, outMax: number, value: number): number {
    return NumberEx.lerp(outMin, outMax, NumberEx.inverseLerp(inMin, inMax, value));
  },
  repeat(value: number, length = 1): number {
    const size = Math.max(EPSILON, Math.abs(NumberEx.finite(length, 1)));
    return ((NumberEx.finite(value, 0) % size) + size) % size;
  },
  round(value: number, precision = 3): number {
    const scale = 10 ** Math.max(0, Math.trunc(NumberEx.finite(precision, 3)));
    return Math.round(NumberEx.finite(value, 0) * scale) / scale;
  },
  saturate(value: number): number {
    return NumberEx.clamp(value, 0, 1);
  },
  sign(value: number): number {
    const number = NumberEx.finite(value, 0);
    return number === 0 ? 0 : Math.sign(number);
  },
  lerp(left: number, right: number, alpha: number): number {
    const t = NumberEx.saturate(alpha);
    return NumberEx.finite(left, 0) + (NumberEx.finite(right, 0) - NumberEx.finite(left, 0)) * t;
  },
  wrap(value: number, min: number, max: number): number {
    const low = NumberEx.finite(min, 0);
    const high = NumberEx.finite(max, 0);
    const size = high - low;
    return Math.abs(size) <= EPSILON ? low : low + NumberEx.repeat(NumberEx.finite(value, low) - low, size);
  },
});

export const AngleEx = Object.freeze({
  degToRad(degrees: number): number {
    return (NumberEx.finite(degrees, 0) * Math.PI) / 180;
  },
  deltaAngle(current: number, target: number): number {
    return NumberEx.repeat(NumberEx.finite(target, 0) - NumberEx.finite(current, 0) + Math.PI, Math.PI * 2) - Math.PI;
  },
  moveTowardAngle(current: number, target: number, maxDelta: number): number {
    return NumberEx.finite(current, 0) + NumberEx.moveToward(0, AngleEx.deltaAngle(current, target), maxDelta);
  },
  radToDeg(radians: number): number {
    return (NumberEx.finite(radians, 0) * 180) / Math.PI;
  },
});

export const Mathf = NumberEx;
