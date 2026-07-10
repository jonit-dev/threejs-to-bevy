/*
 * Cascade split, fit, bias, and texel-snapping math adapted from three-csm:
 * https://github.com/StrandedKitty/three-csm
 *
 * MIT License
 *
 * Copyright (c) 2019 vtHawk
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export type CascadeSplitScheme = "uniform" | "logarithmic" | "practical";
export type CascadeVec3 = readonly [number, number, number];

export interface CascadeSplitOptions {
  cascadeCount: number;
  maxDistance: number;
  nearDistance: number;
  scheme: CascadeSplitScheme;
  splitLambda?: number;
}

export interface CascadeFrustumSlice {
  near: readonly CascadeVec3[];
  far: readonly CascadeVec3[];
}

export interface CascadeOrthoFit {
  bottom: number;
  center: CascadeVec3;
  left: number;
  radius: number;
  right: number;
  top: number;
}

export interface CascadeBias {
  bias: number;
  normalBias: number;
}

export interface CascadeCoverageRange {
  far: number;
  near: number;
  requestedFar: number;
  requestedNear: number;
}

export function calculateCascadeSplits(options: CascadeSplitOptions): number[] {
  const { cascadeCount, maxDistance, nearDistance, scheme } = options;
  const splitLambda = options.splitLambda ?? 0.5;
  assertSplitOptions(cascadeCount, nearDistance, maxDistance, splitLambda);

  const splits: number[] = [];
  for (let index = 1; index < cascadeCount; index += 1) {
    const ratio = index / cascadeCount;
    const uniform = nearDistance + (maxDistance - nearDistance) * ratio;
    const logarithmic = nearDistance * (maxDistance / nearDistance) ** ratio;
    if (scheme === "uniform") {
      splits.push(uniform);
    } else if (scheme === "logarithmic") {
      splits.push(logarithmic);
    } else {
      splits.push(uniform + (logarithmic - uniform) * splitLambda);
    }
  }
  splits.push(maxDistance);
  return splits;
}

export function calculateCascadeCoverageRanges(
  nearDistance: number,
  splits: readonly number[],
  blendFraction: number,
): CascadeCoverageRange[] {
  if (!Number.isFinite(nearDistance) || nearDistance <= 0) {
    throw new RangeError("Cascade near distance must be positive.");
  }
  if (!Number.isFinite(blendFraction) || blendFraction < 0 || blendFraction > 1) {
    throw new RangeError("Cascade blend fraction must be between zero and one.");
  }
  if (splits.length === 0 || splits.some((split, index) => !Number.isFinite(split) || split <= (index === 0 ? nearDistance : splits[index - 1]!))) {
    throw new RangeError("Cascade splits must be finite and strictly increasing after the near distance.");
  }

  const requested = splits.map((requestedFar, index) => ({
    requestedFar,
    requestedNear: index === 0 ? nearDistance : splits[index - 1]!,
  }));
  const boundaryMargins = requested.slice(0, -1).map((range, index) => {
    const next = requested[index + 1]!;
    const leftSpan = range.requestedFar - range.requestedNear;
    const rightSpan = next.requestedFar - next.requestedNear;
    return blendFraction * Math.min(leftSpan, rightSpan);
  });
  const maxDistance = splits.at(-1)!;
  return requested.map((range, index) => ({
    far: Math.min(maxDistance, range.requestedFar + (boundaryMargins[index] ?? 0) / 2),
    near: Math.max(nearDistance, range.requestedNear - (boundaryMargins[index - 1] ?? 0) / 2),
    ...range,
  }));
}

export function fitCascadeFrustumSlice(slice: CascadeFrustumSlice): CascadeOrthoFit {
  if (slice.near.length !== 4 || slice.far.length !== 4) {
    throw new RangeError("A cascade frustum slice requires four near and four far corners.");
  }
  const corners = [...slice.near, ...slice.far];
  for (const corner of corners) {
    if (corner.length !== 3 || !corner.every(Number.isFinite)) {
      throw new RangeError("Cascade frustum corners must contain three finite coordinates.");
    }
  }

  const center: CascadeVec3 = [
    (Math.min(...corners.map((corner) => corner[0])) + Math.max(...corners.map((corner) => corner[0]))) / 2,
    (Math.min(...corners.map((corner) => corner[1])) + Math.max(...corners.map((corner) => corner[1]))) / 2,
    (Math.min(...corners.map((corner) => corner[2])) + Math.max(...corners.map((corner) => corner[2]))) / 2,
  ];
  const radius = Math.max(...corners.map((corner) => distance(corner, center)));
  if (!(radius > 0)) {
    throw new RangeError("A cascade frustum slice must have a positive radius.");
  }

  return { bottom: -radius, center, left: -radius, radius, right: radius, top: radius };
}

export function snapCascadeCenter(center: CascadeVec3, fit: CascadeOrthoFit, mapSize: number): CascadeVec3 {
  if (!Number.isInteger(mapSize) || mapSize <= 0) {
    throw new RangeError("Cascade shadow map size must be a positive integer.");
  }
  const texelWidth = (fit.right - fit.left) / mapSize;
  const texelHeight = (fit.top - fit.bottom) / mapSize;
  if (!(texelWidth > 0) || !(texelHeight > 0)) {
    throw new RangeError("Cascade orthographic bounds must have positive width and height.");
  }
  return [
    Math.floor(center[0] / texelWidth) * texelWidth,
    Math.floor(center[1] / texelHeight) * texelHeight,
    center[2],
  ];
}

export function scaleCascadeBias(base: CascadeBias, fit: CascadeOrthoFit, referenceDistance: number): CascadeBias {
  if (!Number.isFinite(referenceDistance) || referenceDistance <= 0) {
    throw new RangeError("Cascade bias reference distance must be positive.");
  }
  const diameter = fit.radius * 2;
  const scale = Math.min(1, diameter / referenceDistance);
  return { bias: base.bias * scale, normalBias: base.normalBias * scale };
}

function assertSplitOptions(cascadeCount: number, nearDistance: number, maxDistance: number, splitLambda: number): void {
  if (!Number.isInteger(cascadeCount) || cascadeCount <= 0) {
    throw new RangeError("Cascade count must be a positive integer.");
  }
  if (!Number.isFinite(nearDistance) || nearDistance <= 0) {
    throw new RangeError("Cascade near distance must be positive.");
  }
  if (!Number.isFinite(maxDistance) || maxDistance <= nearDistance) {
    throw new RangeError("Cascade max distance must be greater than its near distance.");
  }
  if (!Number.isFinite(splitLambda) || splitLambda < 0 || splitLambda > 1) {
    throw new RangeError("Cascade split lambda must be between zero and one.");
  }
}

function distance(a: CascadeVec3, b: CascadeVec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
