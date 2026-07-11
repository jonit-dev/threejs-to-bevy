import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const VISUAL_CALIBRATION_REPORT_ONLY_FACTORS = new Set([
  "post-advanced",
  "volumetric-report-only",
  "atmospheric-report-only",
]);

interface Frame {
  data: ArrayLike<number>;
  height: number;
  width: number;
}

interface RegionBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface CalibrationRegion {
  factor: string;
  id: string;
  region: RegionBounds;
}

interface CalibrationFixture {
  factorGroup?: string;
  failureHints?: Record<string, string>;
  id?: string;
  regions?: CalibrationRegion[];
  thresholds: Record<string, number | undefined>;
}

interface ImageAnalysis {
  absoluteRegion(frame: Frame, region: RegionBounds): RegionBounds;
  analyzeNonblank(frame: Frame): { changedPixelRatio: number; ok: boolean; threshold?: number };
  compareFramesDetailed(first: Frame, second: Frame): {
    averageBrightnessDelta: number;
    averageColorDelta: { blue: number; green: number; red: number };
    changedPixelRatio: number;
    maxChannelDelta: number;
    p95ChannelDelta: number;
  };
  cropFrame(frame: Frame, region: RegionBounds): Frame;
}

async function loadImageAnalysis(root: string): Promise<ImageAnalysis> {
  const module = await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/imageAnalysis.js")).href);
  return module as ImageAnalysis;
}

export function averageLuminance(frame: Frame, region: RegionBounds): number {
  const xStart = Math.max(0, Math.floor(frame.width * region.x));
  const yStart = Math.max(0, Math.floor(frame.height * region.y));
  const xEnd = Math.min(frame.width, Math.ceil(frame.width * (region.x + region.width)));
  const yEnd = Math.min(frame.height, Math.ceil(frame.height * (region.y + region.height)));
  let total = 0;
  let count = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const index = (y * frame.width + x) * 4;
      const red = frame.data[index] ?? 0;
      const green = frame.data[index + 1] ?? 0;
      const blue = frame.data[index + 2] ?? 0;
      total += (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

export function sampleEdgeEnergy(frame: Frame, region: RegionBounds): number {
  const xStart = Math.max(0, Math.floor(frame.width * region.x));
  const yStart = Math.max(0, Math.floor(frame.height * region.y));
  const xEnd = Math.min(frame.width - 1, Math.ceil(frame.width * (region.x + region.width)) - 1);
  const yEnd = Math.min(frame.height - 1, Math.ceil(frame.height * (region.y + region.height)) - 1);
  let total = 0;
  let count = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const index = (y * frame.width + x) * 4;
      const right = frame.data[index + 4] ?? frame.data[index] ?? 0;
      const down = frame.data[index + frame.width * 4] ?? frame.data[index] ?? 0;
      const current = frame.data[index] ?? 0;
      total += Math.abs(current - right) + Math.abs(current - down);
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count / 255;
}

export function computeLuminanceHistogram(frame: Frame, bins = 8): number[] {
  const histogram = Array.from({ length: bins }, () => 0);
  const total = frame.width * frame.height;
  if (total <= 0) {
    return histogram;
  }
  for (let index = 0; index < frame.data.length; index += 4) {
    const red = frame.data[index] ?? 0;
    const green = frame.data[index + 1] ?? 0;
    const blue = frame.data[index + 2] ?? 0;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const bucket = Math.min(bins - 1, Math.floor((luminance / 255) * bins));
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  }
  return histogram.map((count) => count / total);
}

export function histogramDelta(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  let delta = 0;
  for (let index = 0; index < length; index += 1) {
    delta += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }
  return delta;
}

export function exceedsThreshold(
  thresholds: Record<string, number | undefined>,
  metrics: Record<string, number>,
): Array<{ metric: string; observed: number; threshold: number }> {
  const failures: Array<{ metric: string; observed: number; threshold: number }> = [];
  for (const [metric, threshold] of Object.entries(thresholds)) {
    if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
      continue;
    }
    const observed = metrics[metric];
    if (typeof observed !== "number") {
      continue;
    }
    if (metric === "nonblankRatio" || metric === "minimumLuminance") {
      if (observed < threshold) {
        failures.push({ metric, observed, threshold });
      }
      continue;
    }
    if (observed > threshold) {
      failures.push({ metric, observed, threshold });
    }
  }
  return failures;
}

export function thresholdsForRegion(
  fixture: CalibrationFixture,
  region: CalibrationRegion,
): Record<string, number | undefined> {
  const base = { ...fixture.thresholds };
  if (region.id === "bloom-core") {
    return { luminanceDelta: 0.12, minimumLuminance: 0.6 };
  }
  if (region.id === "bloom-inner-halo") {
    return { luminanceDelta: 0.12, maximumLuminance: 0.7, minimumLuminance: 0.08 };
  }
  if (region.id === "bloom-outer-halo") {
    return { luminanceDelta: 0.12, maximumLuminance: 0.55, minimumLuminance: 0.035 };
  }
  if (region.id === "swatch-white") {
    return { luminanceDelta: 0.08, minimumLuminance: 0.65 };
  }
  if (region.id === "swatch-mid-gray") {
    return { luminanceDelta: 0.08, maximumLuminance: 0.75, minimumLuminance: 0.15 };
  }
  if (region.id === "swatch-black") {
    return { luminanceDelta: 0.05, maximumLuminance: 0.08 };
  }
  if (region.id === "background-alpha") {
    return {
      averageBrightnessDelta: fixture.thresholds.backgroundAlphaBrightnessDelta ?? 0.3,
      changedPixelRatio: 0.3,
      maxChannelDelta: 0.2,
    };
  }
  if (region.factor === "camera") {
    return {
      averageBrightnessDelta: 0.03,
      changedPixelRatio: 0.06,
      edgeDrift: 0.08,
    };
  }
  if (region.id === "emissive") {
    return {
      averageBrightnessDelta: fixture.thresholds.emissiveBrightnessDelta ?? 0.55,
      averageColorDelta: fixture.thresholds.emissiveColorDelta ?? 0.85,
      changedPixelRatio: fixture.thresholds.changedPixelRatio ?? 0.16,
      maxChannelDelta: fixture.thresholds.maxChannelDelta ?? 0.35,
      p95ChannelDelta: fixture.thresholds.p95ChannelDelta ?? 0.25,
    };
  }
  if (region.id === "alpha-mask") {
    return {
      averageBrightnessDelta: 0.08,
      averageColorDelta: 0.08,
      changedPixelRatio: 0.16,
      maxChannelDelta: 0.42,
      p95ChannelDelta: 0.36,
    };
  }
  if (region.id === "unlit-card" || region.id === "texture-slot" || region.id === "uv-transform") {
    return {
      averageBrightnessDelta: 0.06,
      averageColorDelta: 0.08,
      changedPixelRatio: 0.12,
      maxChannelDelta: 0.25,
      p95ChannelDelta: 0.12,
    };
  }
  return base;
}

export function analyzeRegionMetrics(input: {
  bevyFrame: Frame;
  fixture: CalibrationFixture;
  imageAnalysis: ImageAnalysis;
  region: CalibrationRegion;
  webFrame: Frame;
}): {
  failures: Array<{ metric: string; observed: number; threshold: number }>;
  metrics: Record<string, number>;
} {
  const { bevyFrame, fixture, imageAnalysis, region, webFrame } = input;
  const thresholds = thresholdsForRegion(fixture, region);
  const absolute = imageAnalysis.absoluteRegion(webFrame, region.region);
  const webRegion = imageAnalysis.cropFrame(webFrame, absolute);
  const bevyRegion = imageAnalysis.cropFrame(bevyFrame, absolute);
  const comparison = imageAnalysis.compareFramesDetailed(webRegion, bevyRegion);
  const webLuminance = averageLuminance(webFrame, region.region);
  const bevyLuminance = averageLuminance(bevyFrame, region.region);
  const webEdge = sampleEdgeEnergy(webFrame, region.region);
  const bevyEdge = sampleEdgeEnergy(bevyFrame, region.region);
  const webHistogram = computeLuminanceHistogram(webRegion);
  const bevyHistogram = computeLuminanceHistogram(bevyRegion);
  const metrics = {
    averageBrightnessDelta: comparison.averageBrightnessDelta,
    averageColorDelta: Math.max(
      comparison.averageColorDelta.red,
      comparison.averageColorDelta.green,
      comparison.averageColorDelta.blue,
    ),
    changedPixelRatio: comparison.changedPixelRatio,
    edgeDrift: Math.abs(webEdge - bevyEdge),
    histogramDelta: histogramDelta(webHistogram, bevyHistogram),
    luminanceDelta: Math.abs(webLuminance - bevyLuminance),
    maxChannelDelta: comparison.maxChannelDelta,
    maximumLuminance: Math.max(webLuminance, bevyLuminance),
    minimumLuminance: Math.min(webLuminance, bevyLuminance),
    nonblankRatio: Math.min(
      imageAnalysis.analyzeNonblank(webRegion).changedPixelRatio,
      imageAnalysis.analyzeNonblank(bevyRegion).changedPixelRatio,
    ),
    p95ChannelDelta: comparison.p95ChannelDelta,
  };
  const failures = exceedsThreshold(thresholds, metrics);
  return { failures, metrics };
}

export async function analyzeCalibrationFixture(input: {
  bevyFrame: Frame;
  fixture: CalibrationFixture & { id: string; regions: CalibrationRegion[] };
  repoRoot: string;
  webFrame: Frame;
}): Promise<{
  diagnostics: Array<Record<string, unknown>>;
  metrics: Record<string, unknown>;
  status: "fail" | "pass";
}> {
  const { bevyFrame, fixture, repoRoot, webFrame } = input;
  const imageAnalysis = await loadImageAnalysis(repoRoot);
  const diagnostics: Array<Record<string, unknown>> = [];
  const regions = [];
  const webNonblank = imageAnalysis.analyzeNonblank(webFrame);
  const bevyNonblank = imageAnalysis.analyzeNonblank(bevyFrame);
  if (!webNonblank.ok) {
    diagnostics.push({
      code: "TN_VERIFY_VISUAL_CALIBRATION_WEB_BLANK",
      fixtureId: fixture.id,
      message: `Web screenshot is blank or near-blank for fixture '${fixture.id}'.`,
      severity: "error",
    });
  }
  if (!bevyNonblank.ok) {
    diagnostics.push({
      code: "TN_VERIFY_VISUAL_CALIBRATION_BEVY_BLANK",
      fixtureId: fixture.id,
      message: `Bevy screenshot is blank or near-blank for fixture '${fixture.id}'.`,
      severity: "error",
    });
  }

  for (const region of fixture.regions) {
    const { failures, metrics } = analyzeRegionMetrics({
      bevyFrame,
      fixture,
      imageAnalysis,
      region,
      webFrame,
    });
    const reportOnly = VISUAL_CALIBRATION_REPORT_ONLY_FACTORS.has(region.factor);
    const ok = failures.length === 0;
    regions.push({
      factor: region.factor,
      id: region.id,
      metrics,
      ok,
      reportOnly,
    });
    if (!ok) {
      const primary = failures[0]!;
      diagnostics.push({
        artifactPath: undefined,
        code: region.factor === "camera"
          ? "TN_VERIFY_VISUAL_CALIBRATION_CAMERA_FRAMING_DRIFT"
          : "TN_VERIFY_VISUAL_CALIBRATION_REGION_DRIFT",
        factorGroup: fixture.factorGroup,
        fixtureId: fixture.id,
        message: `Region '${region.id}' (${region.factor}) exceeded ${primary.metric}: observed ${primary.observed.toFixed(4)} > threshold ${primary.threshold}.`,
        metric: primary.metric,
        observed: primary.observed,
        regionFactor: region.factor,
        regionId: region.id,
        severity: reportOnly ? "warning" : "error",
        suggestion: fixture.failureHints?.[region.factor] ?? fixture.failureHints?.[fixture.factorGroup ?? ""],
        threshold: primary.threshold,
      });
    }
  }

  const frameComparison = imageAnalysis.compareFramesDetailed(webFrame, bevyFrame);
  return {
    diagnostics,
    metrics: {
      averageBrightnessDelta: frameComparison.averageBrightnessDelta,
      averageColorDelta: Math.max(
        frameComparison.averageColorDelta.red,
        frameComparison.averageColorDelta.green,
        frameComparison.averageColorDelta.blue,
      ),
      changedPixelRatio: frameComparison.changedPixelRatio,
      maxChannelDelta: frameComparison.maxChannelDelta,
      p95ChannelDelta: frameComparison.p95ChannelDelta,
      regions,
    },
    status: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "fail" : "pass",
  };
}

export function detectCameraFramingDrift(
  webFrame: Frame,
  bevyFrame: Frame,
  region: { id: string; region: RegionBounds },
  threshold = 0.05,
): { edgeDrift: number; ok: boolean; regionId: string } {
  const webEdge = sampleEdgeEnergy(webFrame, region.region);
  const bevyEdge = sampleEdgeEnergy(bevyFrame, region.region);
  const edgeDrift = Math.abs(webEdge - bevyEdge);
  return {
    edgeDrift,
    ok: edgeDrift <= threshold,
    regionId: region.id,
  };
}
