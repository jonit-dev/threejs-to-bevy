import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { PNG } from "pngjs";

export const img2ThreejsVisualThresholds = {
  meanNormalizedRgbDelta: 3 / 255,
  silhouetteIou: 0.995,
  ssim: 0.98,
} as const;

export interface IImg2ThreejsPixelFrame {
  data: Uint8Array;
  height: number;
  width: number;
}

export interface IImg2ThreejsVisualMetrics {
  meanNormalizedRgbDelta: number;
  passed: boolean;
  silhouetteIou: number;
  ssim: number;
  thresholds: typeof img2ThreejsVisualThresholds;
}

export function measureImg2ThreejsVisualParity(source: IImg2ThreejsPixelFrame, reloaded: IImg2ThreejsPixelFrame): { diff: Uint8Array; metrics: IImg2ThreejsVisualMetrics } {
  if (source.width !== reloaded.width || source.height !== reloaded.height || source.data.length !== reloaded.data.length) {
    throw new Error("Visual parity frames must have identical dimensions.");
  }
  if (source.width % 8 !== 0 || source.height % 8 !== 0) throw new Error("Visual parity frame dimensions must be divisible by the fixed 8x8 SSIM window.");
  const pixels = source.width * source.height;
  const diff = new Uint8Array(source.data.length);
  const sourceMask = new Uint8Array(pixels);
  const reloadMask = new Uint8Array(pixels);
  let intersection = 0;
  let union = 0;
  let rgbDelta = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const left = source.data[offset + 3]! >= 16;
    const right = reloaded.data[offset + 3]! >= 16;
    sourceMask[pixel] = left ? 1 : 0;
    reloadMask[pixel] = right ? 1 : 0;
    if (left && right) intersection += 1;
    if (left || right) {
      union += 1;
      rgbDelta += Math.abs(source.data[offset]! - reloaded.data[offset]!) + Math.abs(source.data[offset + 1]! - reloaded.data[offset + 1]!) + Math.abs(source.data[offset + 2]! - reloaded.data[offset + 2]!);
    }
    diff[offset] = Math.abs(source.data[offset]! - reloaded.data[offset]!);
    diff[offset + 1] = Math.abs(source.data[offset + 1]! - reloaded.data[offset + 1]!);
    diff[offset + 2] = Math.abs(source.data[offset + 2]! - reloaded.data[offset + 2]!);
    diff[offset + 3] = 255;
  }
  if (union === 0) throw new Error("Visual parity proof has an empty silhouette.");
  const silhouetteIou = intersection / union;
  const meanNormalizedRgbDelta = rgbDelta / (union * 3 * 255);
  const ssim = windowedSsim(source, reloaded, sourceMask, reloadMask);
  const metrics = {
    meanNormalizedRgbDelta,
    passed: silhouetteIou >= img2ThreejsVisualThresholds.silhouetteIou && ssim >= img2ThreejsVisualThresholds.ssim && meanNormalizedRgbDelta <= img2ThreejsVisualThresholds.meanNormalizedRgbDelta,
    silhouetteIou,
    ssim,
    thresholds: img2ThreejsVisualThresholds,
  };
  return { diff, metrics };
}

export async function writeImg2ThreejsVisualProof(directory: string, source: IImg2ThreejsPixelFrame, reloaded: IImg2ThreejsPixelFrame, diff: Uint8Array, metrics: IImg2ThreejsVisualMetrics): Promise<string[]> {
  await mkdir(directory, { recursive: true });
  const files = ["source.png", "reloaded.png", "diff.png", "metrics.json"];
  await Promise.all([
    writeFile(join(directory, files[0]!), encodePng(source)),
    writeFile(join(directory, files[1]!), encodePng(reloaded)),
    writeFile(join(directory, files[2]!), encodePng({ ...source, data: diff })),
    writeFile(join(directory, files[3]!), `${JSON.stringify(metrics, null, 2)}\n`),
  ]);
  return files.map((file) => join(directory, file));
}

function encodePng(frame: IImg2ThreejsPixelFrame): Buffer {
  const png = new PNG({ height: frame.height, width: frame.width });
  png.data = Buffer.from(frame.data);
  return PNG.sync.write(png);
}

function windowedSsim(left: IImg2ThreejsPixelFrame, right: IImg2ThreejsPixelFrame, leftMask: Uint8Array, rightMask: Uint8Array): number {
  const values: number[] = [];
  let minX = left.width;
  let minY = left.height;
  let maxX = -1;
  let maxY = -1;
  for (let pixel = 0; pixel < leftMask.length; pixel += 1) if (leftMask[pixel] || rightMask[pixel]) {
    const x = pixel % left.width;
    const y = Math.floor(pixel / left.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const startX = Math.floor(minX / 8) * 8;
  const startY = Math.floor(minY / 8) * 8;
  const endX = Math.floor(maxX / 8) * 8;
  const endY = Math.floor(maxY / 8) * 8;
  for (let y = startY; y <= endY; y += 8) for (let x = startX; x <= endX; x += 8) {
    const a: number[] = [];
    const b: number[] = [];
    for (let dy = 0; dy < 8; dy += 1) for (let dx = 0; dx < 8; dx += 1) {
      const pixel = (y + dy) * left.width + x + dx;
      const offset = pixel * 4;
      a.push(luma(left.data, offset));
      b.push(luma(right.data, offset));
    }
    const meanA = average(a);
    const meanB = average(b);
    let varianceA = 0;
    let varianceB = 0;
    let covariance = 0;
    for (let index = 0; index < a.length; index += 1) {
      const deltaA = a[index]! - meanA;
      const deltaB = b[index]! - meanB;
      varianceA += deltaA * deltaA;
      varianceB += deltaB * deltaB;
      covariance += deltaA * deltaB;
    }
    const divisor = Math.max(1, a.length - 1);
    varianceA /= divisor;
    varianceB /= divisor;
    covariance /= divisor;
    const c1 = 0.01 ** 2;
    const c2 = 0.03 ** 2;
    values.push(((2 * meanA * meanB + c1) * (2 * covariance + c2)) / ((meanA ** 2 + meanB ** 2 + c1) * (varianceA + varianceB + c2)));
  }
  return average(values);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function luma(data: Uint8Array, offset: number): number {
  return (0.2126 * data[offset]! + 0.7152 * data[offset + 1]! + 0.0722 * data[offset + 2]!) / 255;
}
