import { analyzeNonblank, analyzeProjectedBounds, averageColor, type IPixelFrame } from "../verify/imageAnalysis.js";

export interface IScreenshotCompositionMetrics {
  averageColor: { blue: number; green: number; red: number };
  colorBucketCount: number;
  colorBucketRatio: number;
  height: number;
  localContrastRatio: number;
  nonblank: ReturnType<typeof analyzeNonblank>;
  projectedBounds: ReturnType<typeof analyzeProjectedBounds>;
  visibleBoundsAreaRatio: number;
  width: number;
}

export function analyzeScreenshotComposition(frame: IPixelFrame): IScreenshotCompositionMetrics {
  const projectedBounds = analyzeProjectedBounds(frame);
  const totalPixels = frame.width * frame.height;
  const visibleBoundsAreaRatio = totalPixels <= 0 ? 0 : (projectedBounds.width * projectedBounds.height) / totalPixels;
  const buckets = new Set<string>();
  let contrastEdges = 0;
  let contrastSamples = 0;
  for (let y = 0; y < frame.height; y += 2) {
    for (let x = 0; x < frame.width; x += 2) {
      const index = (y * frame.width + x) * 4;
      const red = frame.data[index] ?? 0;
      const green = frame.data[index + 1] ?? 0;
      const blue = frame.data[index + 2] ?? 0;
      buckets.add(`${red >> 5}:${green >> 5}:${blue >> 5}`);
      if (x + 2 < frame.width) {
        const neighbor = (y * frame.width + x + 2) * 4;
        const delta = Math.abs(red - (frame.data[neighbor] ?? 0)) + Math.abs(green - (frame.data[neighbor + 1] ?? 0)) + Math.abs(blue - (frame.data[neighbor + 2] ?? 0));
        contrastEdges += delta > 36 ? 1 : 0;
        contrastSamples += 1;
      }
    }
  }
  return {
    averageColor: averageColor(frame),
    colorBucketCount: buckets.size,
    colorBucketRatio: totalPixels <= 0 ? 0 : buckets.size / Math.max(1, Math.ceil(frame.width / 2) * Math.ceil(frame.height / 2)),
    height: frame.height,
    localContrastRatio: contrastSamples <= 0 ? 0 : contrastEdges / contrastSamples,
    nonblank: analyzeNonblank(frame),
    projectedBounds,
    visibleBoundsAreaRatio,
    width: frame.width,
  };
}
