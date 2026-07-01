import { NumberEx } from "./numeric.js";
import { DEFAULT_COLOR, colorParts, type ColorTuple, type ColorValue } from "./types.js";

export const Ease = Object.freeze({
  inOutCubic(t: number): number {
    const x = NumberEx.saturate(t);
    return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  },
  inOutQuad(t: number): number {
    const x = NumberEx.saturate(t);
    return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
  },
  inQuad(t: number): number {
    const x = NumberEx.saturate(t);
    return x * x;
  },
  linear(t: number): number {
    return NumberEx.saturate(t);
  },
  outCubic(t: number): number {
    return 1 - (1 - NumberEx.saturate(t)) ** 3;
  },
  outQuad(t: number): number {
    const x = NumberEx.saturate(t);
    return 1 - (1 - x) * (1 - x);
  },
  smoothStep(t: number): number {
    const x = NumberEx.saturate(t);
    return x * x * (3 - 2 * x);
  },
  smootherStep(t: number): number {
    const x = NumberEx.saturate(t);
    return x * x * x * (x * (x * 6 - 15) + 10);
  },
  step(edge: number, value: number): number {
    return NumberEx.finite(value, 0) < NumberEx.finite(edge, 0) ? 0 : 1;
  },
});

export const RandomEx = Object.freeze({
  chance(seed: number, index: number, probability: number): boolean {
    return RandomEx.float01(seed, index) < NumberEx.saturate(probability);
  },
  float01(seed: number, index = 0): number {
    return RandomEx.hash32(seed, index) / 4294967296;
  },
  hash32(seed: number, index = 0): number {
    let value = (Math.trunc(NumberEx.finite(seed, 0)) ^ Math.imul(Math.trunc(NumberEx.finite(index, 0)), 0x9e3779b9)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d) >>> 0;
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b) >>> 0;
    value ^= value >>> 16;
    return value >>> 0;
  },
  pickIndex(seed: number, index: number, length: number): number {
    const count = Math.max(0, Math.trunc(NumberEx.finite(length, 0)));
    return count === 0 ? -1 : Math.floor(RandomEx.float01(seed, index) * count) % count;
  },
  range(seed: number, index: number, min: number, max: number): number {
    return NumberEx.lerp(min, max, RandomEx.float01(seed, index));
  },
  rangeInt(seed: number, index: number, min: number, max: number): number {
    const low = Math.ceil(Math.min(NumberEx.finite(min, 0), NumberEx.finite(max, 0)));
    const high = Math.floor(Math.max(NumberEx.finite(min, 0), NumberEx.finite(max, 0)));
    return low + Math.floor(RandomEx.float01(seed, index) * (high - low + 1));
  },
});

export const ColorEx = Object.freeze({
  hex(value: string, fallback: ColorValue = DEFAULT_COLOR): ColorTuple {
    const text = typeof value === "string" ? value.replace(/^#/, "") : "";
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(text)) {
      return ColorEx.rgba(...ColorEx.from(fallback));
    }
    const r = Number.parseInt(text.slice(0, 2), 16) / 255;
    const g = Number.parseInt(text.slice(2, 4), 16) / 255;
    const b = Number.parseInt(text.slice(4, 6), 16) / 255;
    const a = text.length === 8 ? Number.parseInt(text.slice(6, 8), 16) / 255 : 1;
    return [r, g, b, a];
  },
  from(value: ColorValue | undefined, fallback: ColorValue = DEFAULT_COLOR): ColorTuple {
    if (typeof value === "string") {
      return ColorEx.hex(value, fallback);
    }
    const base = colorParts(value);
    const backup = colorParts(fallback);
    return [
      NumberEx.saturate(NumberEx.finite(base[0], NumberEx.finite(backup[0], 1))),
      NumberEx.saturate(NumberEx.finite(base[1], NumberEx.finite(backup[1], 1))),
      NumberEx.saturate(NumberEx.finite(base[2], NumberEx.finite(backup[2], 1))),
      NumberEx.saturate(NumberEx.finite(base[3], NumberEx.finite(backup[3], 1))),
    ];
  },
  lerp(left: ColorValue, right: ColorValue, alpha: number): ColorTuple {
    const a = ColorEx.from(left);
    const b = ColorEx.from(right);
    const t = NumberEx.saturate(alpha);
    return [NumberEx.lerp(a[0], b[0], t), NumberEx.lerp(a[1], b[1], t), NumberEx.lerp(a[2], b[2], t), NumberEx.lerp(a[3], b[3], t)];
  },
  multiply(color: ColorValue, scalar: number): ColorTuple {
    const c = ColorEx.from(color);
    const amount = Math.max(0, NumberEx.finite(scalar, 1));
    return [NumberEx.saturate(c[0] * amount), NumberEx.saturate(c[1] * amount), NumberEx.saturate(c[2] * amount), c[3]];
  },
  rgb(r: number, g: number, b: number): ColorTuple {
    return ColorEx.rgba(r, g, b, 1);
  },
  rgba(r: number, g: number, b: number, a = 1): ColorTuple {
    return [NumberEx.saturate(r), NumberEx.saturate(g), NumberEx.saturate(b), NumberEx.saturate(a)];
  },
  toHex(color: ColorValue, includeAlpha = false): string {
    const c = ColorEx.from(color);
    const parts = c.slice(0, includeAlpha ? 4 : 3).map((value) => Math.round(NumberEx.saturate(value) * 255).toString(16).padStart(2, "0"));
    return `#${parts.join("")}`;
  },
  withAlpha(color: ColorValue, alpha: number): ColorTuple {
    const c = ColorEx.from(color);
    return [c[0], c[1], c[2], NumberEx.saturate(alpha)];
  },
});

export const TextEx = Object.freeze({
  fixed(value: number, precision = 0): string {
    return NumberEx.round(value, precision).toFixed(Math.max(0, Math.trunc(NumberEx.finite(precision, 0))));
  },
  joinNonEmpty(parts: ReadonlyArray<unknown>, separator = " "): string {
    return parts.map((part) => (part === undefined || part === null ? "" : String(part))).filter((part) => part.length > 0).join(String(separator));
  },
  padLeft(value: unknown, length: number, fill = "0"): string {
    return String(value).padStart(Math.max(0, Math.trunc(NumberEx.finite(length, 0))), String(fill)[0] ?? " ");
  },
  percent(value: number, precision = 0): string {
    return `${TextEx.fixed(NumberEx.finite(value, 0) * 100, precision)}%`;
  },
  signedFixed(value: number, precision = 0): string {
    const number = NumberEx.finite(value, 0);
    return `${number >= 0 ? "+" : "-"}${TextEx.fixed(Math.abs(number), precision)}`;
  },
  timeSeconds(seconds: number): string {
    const total = Math.max(0, Math.floor(NumberEx.finite(seconds, 0)));
    return `${Math.floor(total / 60)}:${TextEx.padLeft(total % 60, 2, "0")}`;
  },
});

