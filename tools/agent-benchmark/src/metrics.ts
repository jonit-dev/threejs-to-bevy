import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

import { analyzeScreenshotComposition } from "@threenative/cli/screenshotMetrics";

import { type IBenchmarkDiagnostic } from "./types.js";

export async function readPngComposition(path: string): Promise<ReturnType<typeof analyzeScreenshotComposition>> {
  const png = PNG.sync.read(await readFile(path));
  return analyzeScreenshotComposition({ data: png.data, height: png.height, width: png.width });
}

export async function comparePngMovement(firstPath: string, secondPath: string): Promise<{ averageBrightnessDelta: number; changedPixelRatio: number; threshold: number }> {
  const first = PNG.sync.read(await readFile(firstPath));
  const second = PNG.sync.read(await readFile(secondPath));
  const width = Math.min(first.width, second.width);
  const height = Math.min(first.height, second.height);
  const totalPixels = width * height;
  const threshold = 0.001;
  if (totalPixels <= 0) {
    return { averageBrightnessDelta: 0, changedPixelRatio: 0, threshold };
  }
  let changedPixels = 0;
  let brightnessDelta = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const firstIndex = (y * first.width + x) * 4;
      const secondIndex = (y * second.width + x) * 4;
      const firstBrightness = ((first.data[firstIndex] ?? 0) + (first.data[firstIndex + 1] ?? 0) + (first.data[firstIndex + 2] ?? 0)) / 3;
      const secondBrightness = ((second.data[secondIndex] ?? 0) + (second.data[secondIndex + 1] ?? 0) + (second.data[secondIndex + 2] ?? 0)) / 3;
      const delta = Math.abs(firstBrightness - secondBrightness);
      brightnessDelta += delta;
      if (delta > 12) {
        changedPixels += 1;
      }
    }
  }
  return {
    averageBrightnessDelta: brightnessDelta / totalPixels / 255,
    changedPixelRatio: changedPixels / totalPixels,
    threshold,
  };
}

export function visualDiagnostics(metrics: ReturnType<typeof analyzeScreenshotComposition>): IBenchmarkDiagnostic[] {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (!metrics.nonblank.ok) {
    diagnostics.push({
      code: "TN_BENCH_BLANK_CAPTURE",
      message: `Screenshot nonblank ratio ${metrics.nonblank.changedPixelRatio.toFixed(4)} is below ${metrics.nonblank.threshold}.`,
      severity: "error",
      suggestedFix: "Fix candidate startup, scene loading, camera, or lighting before scoring this run.",
    });
  }
  if (metrics.colorBucketCount < 8) {
    diagnostics.push({
      code: "TN_BENCH_LOW_COLOR_VARIETY",
      message: `Screenshot contains ${metrics.colorBucketCount} coarse color buckets.`,
      severity: "warning",
    });
  }
  return diagnostics;
}
