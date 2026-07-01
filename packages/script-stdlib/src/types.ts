export type Vec2Value = readonly [number, number] | ReadonlyArray<number> | { readonly x?: number; readonly y?: number };
export type Vec3Value = readonly [number, number, number] | ReadonlyArray<number> | { readonly x?: number; readonly y?: number; readonly z?: number };
export type QuatValue = readonly [number, number, number, number] | ReadonlyArray<number> | { readonly w?: number; readonly x?: number; readonly y?: number; readonly z?: number };
export type ColorValue = string | readonly [number, number, number] | readonly [number, number, number, number] | ReadonlyArray<number> | { readonly a?: number; readonly b?: number; readonly g?: number; readonly r?: number };
export type Vec2Tuple = readonly [number, number];
export type Vec3Tuple = readonly [number, number, number];
export type QuatTuple = readonly [number, number, number, number];
export type ColorTuple = readonly [number, number, number, number];

export const EPSILON = 1e-9;
export const DEFAULT_VEC2: Vec2Tuple = [0, 0];
export const DEFAULT_VEC3: Vec3Tuple = [0, 0, 0];
export const DEFAULT_QUAT: QuatTuple = [0, 0, 0, 1];
export const DEFAULT_COLOR: ColorTuple = [1, 1, 1, 1];

export function vec2Parts(value: Vec2Value | undefined): [number | undefined, number | undefined] {
  if (Array.isArray(value)) {
    return [value[0], value[1]];
  }
  if (isRecord(value)) {
    return [value.x as number | undefined, value.y as number | undefined];
  }
  return [undefined, undefined];
}

export function vec3Parts(value: Vec3Value | undefined): [number | undefined, number | undefined, number | undefined] {
  if (Array.isArray(value)) {
    return [value[0], value[1], value[2]];
  }
  if (isRecord(value)) {
    return [value.x as number | undefined, value.y as number | undefined, value.z as number | undefined];
  }
  return [undefined, undefined, undefined];
}

export function quatParts(value: QuatValue | undefined): [number | undefined, number | undefined, number | undefined, number | undefined] {
  if (Array.isArray(value)) {
    return [value[0], value[1], value[2], value[3]];
  }
  if (isRecord(value)) {
    return [value.x as number | undefined, value.y as number | undefined, value.z as number | undefined, value.w as number | undefined];
  }
  return [undefined, undefined, undefined, undefined];
}

export function colorParts(value: ColorValue | undefined): [number | undefined, number | undefined, number | undefined, number | undefined] {
  if (Array.isArray(value)) {
    return [value[0], value[1], value[2], value[3]];
  }
  if (isRecord(value)) {
    return [value.r as number | undefined, value.g as number | undefined, value.b as number | undefined, value.a as number | undefined];
  }
  return [undefined, undefined, undefined, undefined];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

