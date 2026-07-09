import {
  absoluteRegion,
  analyzeNonblank,
  analyzeProjectedBounds,
  analyzeVisualQuality,
  compareFrames,
  cropFrame,
  type IFrameComparison,
  type INormalizedRegion,
  type IPixelFrame,
} from "./imageAnalysis.js";

export interface IVisualMetricBundle {
  id: string;
  metrics: Record<string, number | string>;
  ok: boolean;
  regions?: IVisualRegionMetric[];
  thresholds: Record<string, number | string>;
}

export interface IVisualRegionMetric {
  comparison: IFrameComparison;
  name: string;
  ok: boolean;
  thresholds: {
    maxAverageBrightnessDelta: number;
    maxAverageColorDelta: number;
    maxChangedPixelRatio?: number;
  };
}

export interface IGameQualityMetricSource {
  colorBucketCount: number;
  localContrastRatio: number;
  nonblank: {
    changedPixelRatio: number;
  };
  visibleBoundsAreaRatio: number;
}

export function gameQualityMetricBundle(frame: IPixelFrame): IVisualMetricBundle {
  const nonblank = analyzeNonblank(frame);
  const bounds = analyzeProjectedBounds(frame);
  const quality = analyzeVisualQuality(frame, { minColorBuckets: 12, minLocalContrast: 0.01 });
  const visibleBoundsAreaRatio = frame.width * frame.height <= 0 ? 0 : (bounds.width * bounds.height) / (frame.width * frame.height);
  return gameQualityMetricBundleFromMetrics({
    colorBucketCount: quality.colorBucketCount,
    localContrastRatio: quality.localContrast,
    nonblank,
    visibleBoundsAreaRatio,
  });
}

export function gameQualityMetricBundleFromMetrics(metrics: IGameQualityMetricSource): IVisualMetricBundle {
  return {
    id: "game-quality",
    metrics: {
      colorBucketCount: metrics.colorBucketCount,
      localContrastRatio: metrics.localContrastRatio,
      nonblankRatio: metrics.nonblank.changedPixelRatio,
      visibleBoundsAreaRatio: metrics.visibleBoundsAreaRatio,
    },
    ok:
      metrics.nonblank.changedPixelRatio >= 0.55
      && metrics.visibleBoundsAreaRatio >= 0.08
      && metrics.colorBucketCount >= 12
      && metrics.localContrastRatio >= 0.01,
    thresholds: {
      minColorBucketCount: 12,
      minLocalContrastRatio: 0.01,
      minNonblankRatio: 0.55,
      minVisibleBoundsAreaRatio: 0.08,
    },
  };
}

export function namedRegionMetricBundle(
  id: string,
  web: IPixelFrame,
  bevy: IPixelFrame,
  regions: Array<{
    name: string;
    region: INormalizedRegion;
    thresholds: IVisualRegionMetric["thresholds"];
  }>,
): IVisualMetricBundle {
  const sampled = regions.map((item): IVisualRegionMetric => {
    const region = absoluteRegion(web, item.region);
    const comparison = compareFrames(cropFrame(web, region), cropFrame(bevy, region));
    const maxColorDelta = Math.max(comparison.averageColorDelta.red, comparison.averageColorDelta.green, comparison.averageColorDelta.blue);
    return {
      comparison,
      name: item.name,
      ok:
        comparison.averageBrightnessDelta <= item.thresholds.maxAverageBrightnessDelta
        && maxColorDelta <= item.thresholds.maxAverageColorDelta
        && (item.thresholds.maxChangedPixelRatio === undefined || comparison.changedPixelRatio <= item.thresholds.maxChangedPixelRatio),
      thresholds: item.thresholds,
    };
  });
  return {
    id,
    metrics: {
      regionCount: sampled.length,
    },
    ok: sampled.every((region) => region.ok),
    regions: sampled,
    thresholds: {
      requiredRegionCount: regions.length,
    },
  };
}
