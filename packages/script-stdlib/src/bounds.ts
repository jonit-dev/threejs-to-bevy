import { NumberEx } from "./numeric.js";
import { Vec2, Vec3 } from "./vectors.js";
import type { Vec2Tuple, Vec2Value, Vec3Tuple, Vec3Value } from "./types.js";

export const Bounds2 = Object.freeze({
  center(bounds: { readonly max?: Vec2Value; readonly min?: Vec2Value }): Vec2Tuple {
    return Vec2.scale(Vec2.add(Vec2.from(bounds.min), Vec2.from(bounds.max)), 0.5);
  },
  closestPoint(bounds: { readonly max?: Vec2Value; readonly min?: Vec2Value }, point: Vec2Value): Vec2Tuple {
    const min = Vec2.from(bounds.min);
    const max = Vec2.from(bounds.max);
    const p = Vec2.from(point);
    return [NumberEx.clamp(p[0], min[0], max[0]), NumberEx.clamp(p[1], min[1], max[1])];
  },
  containsPoint(bounds: { readonly max?: Vec2Value; readonly min?: Vec2Value }, point: Vec2Value): boolean {
    const p = Vec2.from(point);
    const min = Vec2.from(bounds.min);
    const max = Vec2.from(bounds.max);
    return p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1];
  },
  distanceToPoint(bounds: { readonly max?: Vec2Value; readonly min?: Vec2Value }, point: Vec2Value): number {
    return Vec2.distance(point, Bounds2.closestPoint(bounds, point));
  },
  expand(bounds: { readonly max?: Vec2Value; readonly min?: Vec2Value }, amount: number): { readonly max: Vec2Tuple; readonly min: Vec2Tuple } {
    const size = Math.max(0, NumberEx.finite(amount, 0));
    return { min: Vec2.sub(Vec2.from(bounds.min), [size, size]), max: Vec2.add(Vec2.from(bounds.max), [size, size]) };
  },
  overlaps(left: { readonly max?: Vec2Value; readonly min?: Vec2Value }, right: { readonly max?: Vec2Value; readonly min?: Vec2Value }): boolean {
    const a0 = Vec2.from(left.min);
    const a1 = Vec2.from(left.max);
    const b0 = Vec2.from(right.min);
    const b1 = Vec2.from(right.max);
    return a0[0] <= b1[0] && a1[0] >= b0[0] && a0[1] <= b1[1] && a1[1] >= b0[1];
  },
  rect(x: number, y: number, width: number, height: number): { readonly max: Vec2Tuple; readonly min: Vec2Tuple } {
    const min: Vec2Tuple = [NumberEx.finite(x, 0), NumberEx.finite(y, 0)];
    return { min, max: [min[0] + Math.max(0, NumberEx.finite(width, 0)), min[1] + Math.max(0, NumberEx.finite(height, 0))] };
  },
  size(bounds: { readonly max?: Vec2Value; readonly min?: Vec2Value }): Vec2Tuple {
    return Vec2.sub(Vec2.from(bounds.max), Vec2.from(bounds.min));
  },
});

export const Bounds3 = Object.freeze({
  aabb(minValue: Vec3Value, maxValue: Vec3Value): { readonly max: Vec3Tuple; readonly min: Vec3Tuple } {
    const min = Vec3.from(minValue);
    const max = Vec3.from(maxValue);
    return { min: [Math.min(min[0], max[0]), Math.min(min[1], max[1]), Math.min(min[2], max[2])], max: [Math.max(min[0], max[0]), Math.max(min[1], max[1]), Math.max(min[2], max[2])] };
  },
  center(bounds: { readonly max?: Vec3Value; readonly min?: Vec3Value }): Vec3Tuple {
    return Vec3.scale(Vec3.add(Vec3.from(bounds.min), Vec3.from(bounds.max)), 0.5);
  },
  closestPoint(bounds: { readonly max?: Vec3Value; readonly min?: Vec3Value }, point: Vec3Value): Vec3Tuple {
    const min = Vec3.from(bounds.min);
    const max = Vec3.from(bounds.max);
    const p = Vec3.from(point);
    return [NumberEx.clamp(p[0], min[0], max[0]), NumberEx.clamp(p[1], min[1], max[1]), NumberEx.clamp(p[2], min[2], max[2])];
  },
  containsPoint(bounds: { readonly max?: Vec3Value; readonly min?: Vec3Value }, point: Vec3Value): boolean {
    const p = Vec3.from(point);
    const min = Vec3.from(bounds.min);
    const max = Vec3.from(bounds.max);
    return p[0] >= min[0] && p[0] <= max[0] && p[1] >= min[1] && p[1] <= max[1] && p[2] >= min[2] && p[2] <= max[2];
  },
  distanceToPoint(bounds: { readonly max?: Vec3Value; readonly min?: Vec3Value }, point: Vec3Value): number {
    return Vec3.distance(point, Bounds3.closestPoint(bounds, point));
  },
  expand(bounds: { readonly max?: Vec3Value; readonly min?: Vec3Value }, amount: number): { readonly max: Vec3Tuple; readonly min: Vec3Tuple } {
    const size = Math.max(0, NumberEx.finite(amount, 0));
    return { min: Vec3.sub(Vec3.from(bounds.min), [size, size, size]), max: Vec3.add(Vec3.from(bounds.max), [size, size, size]) };
  },
  overlaps(left: { readonly max?: Vec3Value; readonly min?: Vec3Value }, right: { readonly max?: Vec3Value; readonly min?: Vec3Value }): boolean {
    const a0 = Vec3.from(left.min);
    const a1 = Vec3.from(left.max);
    const b0 = Vec3.from(right.min);
    const b1 = Vec3.from(right.max);
    return a0[0] <= b1[0] && a1[0] >= b0[0] && a0[1] <= b1[1] && a1[1] >= b0[1] && a0[2] <= b1[2] && a1[2] >= b0[2];
  },
  size(bounds: { readonly max?: Vec3Value; readonly min?: Vec3Value }): Vec3Tuple {
    return Vec3.sub(Vec3.from(bounds.max), Vec3.from(bounds.min));
  },
});

