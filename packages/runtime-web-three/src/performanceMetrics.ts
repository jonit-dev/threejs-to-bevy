import type { IInstancingPlan } from "./instancing.js";

export interface IRendererInfoLike {
  memory?: { geometries?: number; textures?: number };
  programs?: unknown[] | null;
  render?: { calls?: number; triangles?: number };
}

export interface IPerformanceMetricSummary {
  averageFrameMs: number;
  averageFps?: number;
  audioVoiceCount?: number;
  budgetFrameMs?: number;
  bundleBytes: number;
  debugDrawCount?: number;
  drawCalls: number;
  drawEstimate: number;
  environmentInstances: number;
  framesOverBudget?: number;
  geometries: number;
  instancedGroups: number;
  instances: number;
  instancingGroupCount: number;
  jankFramePercent?: number;
  loadMs: number;
  localDataSlotCount?: number;
  memoryEstimateBytes?: number;
  minFps?: number;
  p95FrameMs: number;
  p95Fps?: number;
  programs: number;
  saveLatencyMs?: number;
  sampleCount?: number;
  sourceAssets: number;
  textures: number;
  textureBytes: number;
  textureEstimate: number;
  triangles: number;
  triangleEstimate: number;
  uninstancedRepeatedProps: number;
  uiNodeCount?: number;
  worstFrameMs: number;
}

export interface IFrameTimingSummary {
  averageFrameMs: number;
  averageFps: number;
  budgetFrameMs: number;
  framesOverBudget: number;
  jankFramePercent: number;
  minFps: number;
  p95FrameMs: number;
  p95Fps: number;
  sampleCount: number;
  worstFrameMs: number;
}

export interface IFrameTimingTrace {
  readonly samples: readonly number[];
  record(timeMs: number): { deltaMs: number; sampled: boolean };
  reset(): void;
}

export function createFrameTimingTrace(maxSamples = 600): IFrameTimingTrace {
  const samples: number[] = [];
  let lastTimeMs: number | undefined;
  return {
    get samples() {
      return samples;
    },
    record(timeMs: number) {
      const previousTimeMs = lastTimeMs;
      lastTimeMs = timeMs;
      if (previousTimeMs === undefined) {
        return { deltaMs: 0, sampled: false };
      }
      const deltaMs = Math.max(0, timeMs - previousTimeMs);
      samples.push(deltaMs);
      if (samples.length > maxSamples) {
        samples.splice(0, samples.length - maxSamples);
      }
      return { deltaMs, sampled: true };
    },
    reset() {
      samples.length = 0;
      lastTimeMs = undefined;
    },
  };
}

export function summarizeFrameTimings(samples: readonly number[], budgetFrameMs = 1000 / 60): IFrameTimingSummary {
  if (samples.length === 0) {
    return { averageFrameMs: 0, averageFps: 0, budgetFrameMs, framesOverBudget: 0, jankFramePercent: 0, minFps: 0, p95FrameMs: 0, p95Fps: 0, sampleCount: 0, worstFrameMs: 0 };
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const averageFrameMs = samples.reduce((total, sample) => total + sample, 0) / samples.length;
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  const p95FrameMs = sorted[p95Index] ?? 0;
  const worstFrameMs = sorted[sorted.length - 1] ?? 0;
  const framesOverBudget = samples.filter((sample) => sample > budgetFrameMs).length;
  return {
    averageFrameMs,
    averageFps: fpsFromFrameMs(averageFrameMs),
    budgetFrameMs,
    framesOverBudget,
    jankFramePercent: (framesOverBudget / samples.length) * 100,
    minFps: fpsFromFrameMs(worstFrameMs),
    p95FrameMs,
    p95Fps: fpsFromFrameMs(p95FrameMs),
    sampleCount: samples.length,
    worstFrameMs,
  };
}

export function collectPerformanceSummary(options: {
  bundleBytes?: number;
  environmentInstanceCount?: number;
  frameSamples: readonly number[];
  instancingPlan: IInstancingPlan;
  loadMs: number;
  rendererInfo: IRendererInfoLike;
  sourceAssetCount?: number;
  supportMetrics?: {
    audioVoiceCount?: number;
    debugDrawCount?: number;
    localDataSlotCount?: number;
    memoryEstimateBytes?: number;
    saveLatencyMs?: number;
    uiNodeCount?: number;
  };
  textureBytes: number;
}): IPerformanceMetricSummary {
  const drawCalls = options.rendererInfo.render?.calls ?? 0;
  const textures = options.rendererInfo.memory?.textures ?? 0;
  const triangles = options.rendererInfo.render?.triangles ?? 0;
  return {
    ...summarizeFrameTimings(options.frameSamples),
    audioVoiceCount: options.supportMetrics?.audioVoiceCount ?? 0,
    bundleBytes: options.bundleBytes ?? 0,
    debugDrawCount: options.supportMetrics?.debugDrawCount ?? 0,
    drawCalls,
    drawEstimate: drawCalls,
    environmentInstances: options.environmentInstanceCount ?? options.instancingPlan.instanceCount + options.instancingPlan.uninstanced.length,
    geometries: options.rendererInfo.memory?.geometries ?? 0,
    instancedGroups: options.instancingPlan.groups.length,
    instances: options.instancingPlan.instanceCount,
    instancingGroupCount: options.instancingPlan.groups.length,
    loadMs: options.loadMs,
    localDataSlotCount: options.supportMetrics?.localDataSlotCount ?? 0,
    memoryEstimateBytes: options.supportMetrics?.memoryEstimateBytes ?? 0,
    programs: options.rendererInfo.programs?.length ?? 0,
    saveLatencyMs: options.supportMetrics?.saveLatencyMs ?? 0,
    sourceAssets: options.sourceAssetCount ?? 0,
    textures,
    textureBytes: options.textureBytes,
    textureEstimate: textures,
    triangles,
    triangleEstimate: triangles,
    uninstancedRepeatedProps: options.instancingPlan.uninstancedRepeatedPropCount,
    uiNodeCount: options.supportMetrics?.uiNodeCount ?? 0,
  };
}

function fpsFromFrameMs(frameMs: number): number {
  return frameMs <= 0 ? 0 : 1000 / frameMs;
}
