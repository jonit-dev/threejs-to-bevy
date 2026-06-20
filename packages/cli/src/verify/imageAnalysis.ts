import { createHash } from "node:crypto";

export interface IPixelFrame {
  data: ArrayLike<number>;
  height: number;
  width: number;
}

export interface IPixelCheck {
  changedPixelRatio: number;
  ok: boolean;
  threshold: number;
}

export interface IProjectedBoundsCheck {
  height: number;
  nonblankPixelRatio: number;
  ok: boolean;
  width: number;
  x: number;
  y: number;
}

export interface IFrameComparison extends IPixelCheck {
  averageBrightnessDelta: number;
  averageColorDelta: {
    blue: number;
    green: number;
    red: number;
  };
}

export interface INormalizedRegion {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface IAverageColor {
  blue: number;
  green: number;
  red: number;
}

export interface IDetailedFrameComparison extends IFrameComparison {
  maxChannelDelta: number;
  p95ChannelDelta: number;
  signedAverageBrightnessDelta: number;
  signedAverageColorDelta: IAverageColor;
}

export const defaultNonblankThreshold = 0.002;
export const defaultDiffThreshold = 0.001;

/** Stable SHA-256 of raw RGBA bytes for a frame (used for exact-match fast paths). */
export function hashPixelFrame(frame: IPixelFrame): string {
  const bytes = frame.data instanceof Uint8Array ? frame.data : Uint8Array.from(frame.data);
  return createHash("sha256").update(bytes).digest("hex");
}

export function framesMatchExactly(first: IPixelFrame, second: IPixelFrame): boolean {
  if (first.width !== second.width || first.height !== second.height) {
    return false;
  }
  return hashPixelFrame(first) === hashPixelFrame(second);
}

export function analyzeNonblank(frame: IPixelFrame, threshold = defaultNonblankThreshold): IPixelCheck {
  const totalPixels = frame.width * frame.height;
  if (totalPixels <= 0) {
    return { changedPixelRatio: 0, ok: false, threshold };
  }

  let visiblePixels = 0;
  for (let index = 0; index < frame.data.length; index += 4) {
    const red = frame.data[index] ?? 0;
    const green = frame.data[index + 1] ?? 0;
    const blue = frame.data[index + 2] ?? 0;
    const alpha = frame.data[index + 3] ?? 0;
    const brightest = Math.max(red, green, blue);
    const darkest = Math.min(red, green, blue);

    if (alpha > 0 && (brightest > 12 || brightest - darkest > 8)) {
      visiblePixels += 1;
    }
  }

  const changedPixelRatio = visiblePixels / totalPixels;
  return {
    changedPixelRatio,
    ok: changedPixelRatio >= threshold,
    threshold,
  };
}

export function analyzeProjectedBounds(frame: IPixelFrame, threshold = defaultNonblankThreshold): IProjectedBoundsCheck {
  const totalPixels = frame.width * frame.height;
  let minX = frame.width;
  let minY = frame.height;
  let maxX = -1;
  let maxY = -1;
  let visiblePixels = 0;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const index = (y * frame.width + x) * 4;
      const red = frame.data[index] ?? 0;
      const green = frame.data[index + 1] ?? 0;
      const blue = frame.data[index + 2] ?? 0;
      const alpha = frame.data[index + 3] ?? 0;
      const brightest = Math.max(red, green, blue);
      const darkest = Math.min(red, green, blue);
      if (alpha > 0 && (brightest > 12 || brightest - darkest > 8)) {
        visiblePixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const nonblankPixelRatio = totalPixels <= 0 ? 0 : visiblePixels / totalPixels;
  const empty = maxX < minX || maxY < minY;
  return {
    height: empty ? 0 : maxY - minY + 1,
    nonblankPixelRatio,
    ok: nonblankPixelRatio >= threshold,
    width: empty ? 0 : maxX - minX + 1,
    x: empty ? 0 : minX,
    y: empty ? 0 : minY,
  };
}

export function analyzeRegionNonblank(
  frame: IPixelFrame,
  region: { height: number; width: number; x: number; y: number },
  threshold = defaultNonblankThreshold,
): IPixelCheck & { nonblankRatio: number } {
  const xEnd = Math.min(frame.width, region.x + region.width);
  const yEnd = Math.min(frame.height, region.y + region.height);
  let visiblePixels = 0;
  let totalPixels = 0;
  for (let y = Math.max(0, region.y); y < yEnd; y += 1) {
    for (let x = Math.max(0, region.x); x < xEnd; x += 1) {
      totalPixels += 1;
      const index = (y * frame.width + x) * 4;
      const red = frame.data[index] ?? 0;
      const green = frame.data[index + 1] ?? 0;
      const blue = frame.data[index + 2] ?? 0;
      const alpha = frame.data[index + 3] ?? 0;
      const brightest = Math.max(red, green, blue);
      const darkest = Math.min(red, green, blue);
      if (alpha > 0 && (brightest > 12 || brightest - darkest > 8)) {
        visiblePixels += 1;
      }
    }
  }
  const nonblankRatio = totalPixels === 0 ? 0 : visiblePixels / totalPixels;
  return {
    changedPixelRatio: nonblankRatio,
    nonblankRatio,
    ok: nonblankRatio >= threshold,
    threshold,
  };
}

export function compareFrames(
  first: IPixelFrame,
  second: IPixelFrame,
  threshold = defaultDiffThreshold,
): IFrameComparison {
  if (first.width !== second.width || first.height !== second.height) {
    return {
      averageBrightnessDelta: 1,
      averageColorDelta: { blue: 1, green: 1, red: 1 },
      changedPixelRatio: 1,
      ok: true,
      threshold,
    };
  }

  const totalPixels = first.width * first.height;
  if (totalPixels <= 0) {
    return {
      averageBrightnessDelta: 0,
      averageColorDelta: { blue: 0, green: 0, red: 0 },
      changedPixelRatio: 0,
      ok: false,
      threshold,
    };
  }

  let changedPixels = 0;
  let brightnessDelta = 0;
  let redDelta = 0;
  let greenDelta = 0;
  let blueDelta = 0;
  const length = Math.min(first.data.length, second.data.length);
  for (let index = 0; index < length; index += 4) {
    const firstRed = first.data[index] ?? 0;
    const firstGreen = first.data[index + 1] ?? 0;
    const firstBlue = first.data[index + 2] ?? 0;
    const secondRed = second.data[index] ?? 0;
    const secondGreen = second.data[index + 1] ?? 0;
    const secondBlue = second.data[index + 2] ?? 0;
    const currentRedDelta = Math.abs(firstRed - secondRed);
    const currentGreenDelta = Math.abs(firstGreen - secondGreen);
    const currentBlueDelta = Math.abs(firstBlue - secondBlue);
    const channelDelta =
      currentRedDelta +
      currentGreenDelta +
      currentBlueDelta +
      Math.abs((first.data[index + 3] ?? 0) - (second.data[index + 3] ?? 0));

    if (channelDelta > 12) {
      changedPixels += 1;
    }

    redDelta += currentRedDelta;
    greenDelta += currentGreenDelta;
    blueDelta += currentBlueDelta;
    brightnessDelta += Math.abs((firstRed + firstGreen + firstBlue) / 3 - (secondRed + secondGreen + secondBlue) / 3);
  }

  const changedPixelRatio = changedPixels / totalPixels;
  return {
    averageBrightnessDelta: brightnessDelta / totalPixels / 255,
    averageColorDelta: {
      blue: blueDelta / totalPixels / 255,
      green: greenDelta / totalPixels / 255,
      red: redDelta / totalPixels / 255,
    },
    changedPixelRatio,
    ok: changedPixelRatio >= threshold,
    threshold,
  };
}

export function absoluteRegion(frame: IPixelFrame, region: INormalizedRegion): { height: number; width: number; x: number; y: number } {
  return {
    height: Math.max(1, Math.floor(frame.height * region.height)),
    width: Math.max(1, Math.floor(frame.width * region.width)),
    x: Math.floor(frame.width * region.x),
    y: Math.floor(frame.height * region.y),
  };
}

export function cropFrame(frame: IPixelFrame, region: { height: number; width: number; x: number; y: number }): IPixelFrame {
  const width = Math.min(region.width, frame.width - region.x);
  const height = Math.min(region.height, frame.height - region.y);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const from = ((row + region.y) * frame.width + column + region.x) * 4;
      const to = (row * width + column) * 4;
      data[to] = frame.data[from] ?? 0;
      data[to + 1] = frame.data[from + 1] ?? 0;
      data[to + 2] = frame.data[from + 2] ?? 0;
      data[to + 3] = frame.data[from + 3] ?? 255;
    }
  }
  return { data, height, width };
}

export function averageColor(frame: IPixelFrame): IAverageColor {
  let red = 0;
  let green = 0;
  let blue = 0;
  const total = frame.width * frame.height;
  if (total <= 0) {
    return { blue: 0, green: 0, red: 0 };
  }
  for (let index = 0; index < frame.data.length; index += 4) {
    red += frame.data[index] ?? 0;
    green += frame.data[index + 1] ?? 0;
    blue += frame.data[index + 2] ?? 0;
  }
  return { blue: blue / total / 255, green: green / total / 255, red: red / total / 255 };
}

export function colorDistance(first: IAverageColor, second: IAverageColor): number {
  return Math.hypot(first.red - second.red, first.green - second.green, first.blue - second.blue);
}

export function parseHexColor(hex: string): IAverageColor {
  const trimmed = hex.trim().replace("#", "");
  if (trimmed.length !== 6) {
    return { blue: 0, green: 0, red: 0 };
  }
  const value = Number.parseInt(trimmed, 16);
  return {
    blue: (value & 0xff) / 255,
    green: ((value >> 8) & 0xff) / 255,
    red: ((value >> 16) & 0xff) / 255,
  };
}

export function compareFramesDetailed(
  first: IPixelFrame,
  second: IPixelFrame,
  threshold = defaultDiffThreshold,
): IDetailedFrameComparison {
  const absolute = compareFrames(first, second, threshold);
  if (first.width !== second.width || first.height !== second.height || first.width * first.height <= 0) {
    return {
      ...absolute,
      maxChannelDelta: 1,
      p95ChannelDelta: 1,
      signedAverageBrightnessDelta: 0,
      signedAverageColorDelta: { blue: 0, green: 0, red: 0 },
    };
  }

  const totalPixels = first.width * first.height;
  const perPixelDeltas: number[] = [];
  let signedBrightness = 0;
  let signedRed = 0;
  let signedGreen = 0;
  let signedBlue = 0;
  let maxChannelDelta = 0;
  const length = Math.min(first.data.length, second.data.length);
  for (let index = 0; index < length; index += 4) {
    const firstRed = first.data[index] ?? 0;
    const firstGreen = first.data[index + 1] ?? 0;
    const firstBlue = first.data[index + 2] ?? 0;
    const secondRed = second.data[index] ?? 0;
    const secondGreen = second.data[index + 1] ?? 0;
    const secondBlue = second.data[index + 2] ?? 0;
    const redDelta = Math.abs(firstRed - secondRed);
    const greenDelta = Math.abs(firstGreen - secondGreen);
    const blueDelta = Math.abs(firstBlue - secondBlue);
    maxChannelDelta = Math.max(maxChannelDelta, redDelta, greenDelta, blueDelta);
    perPixelDeltas.push((redDelta + greenDelta + blueDelta) / 3 / 255);
    signedRed += secondRed - firstRed;
    signedGreen += secondGreen - firstGreen;
    signedBlue += secondBlue - firstBlue;
    signedBrightness += (secondRed + secondGreen + secondBlue - firstRed - firstGreen - firstBlue) / 3;
  }

  perPixelDeltas.sort((left, right) => left - right);
  const p95Index = Math.min(perPixelDeltas.length - 1, Math.floor(perPixelDeltas.length * 0.95));
  return {
    ...absolute,
    maxChannelDelta: maxChannelDelta / 255,
    p95ChannelDelta: perPixelDeltas[p95Index] ?? 0,
    signedAverageBrightnessDelta: signedBrightness / totalPixels / 255,
    signedAverageColorDelta: {
      blue: signedBlue / totalPixels / 255,
      green: signedGreen / totalPixels / 255,
      red: signedRed / totalPixels / 255,
    },
  };
}
