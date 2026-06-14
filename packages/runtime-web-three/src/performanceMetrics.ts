import type { IInstancingPlan } from "./instancing.js";

export interface IRendererInfoLike {
  memory?: { geometries?: number; textures?: number };
  programs?: unknown[] | null;
  render?: { calls?: number; triangles?: number };
}

export interface IPerformanceMetricSummary {
  averageFrameMs: number;
  bundleBytes: number;
  drawCalls: number;
  drawEstimate: number;
  environmentInstances: number;
  geometries: number;
  instancedGroups: number;
  instances: number;
  instancingGroupCount: number;
  loadMs: number;
  p95FrameMs: number;
  programs: number;
  sourceAssets: number;
  textures: number;
  textureBytes: number;
  textureEstimate: number;
  triangles: number;
  triangleEstimate: number;
  uninstancedRepeatedProps: number;
  worstFrameMs: number;
}

export function summarizeFrameTimings(samples: readonly number[]): Pick<IPerformanceMetricSummary, "averageFrameMs" | "p95FrameMs" | "worstFrameMs"> {
  if (samples.length === 0) {
    return { averageFrameMs: 0, p95FrameMs: 0, worstFrameMs: 0 };
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const averageFrameMs = samples.reduce((total, sample) => total + sample, 0) / samples.length;
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    averageFrameMs,
    p95FrameMs: sorted[p95Index] ?? 0,
    worstFrameMs: sorted[sorted.length - 1] ?? 0,
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
  textureBytes: number;
}): IPerformanceMetricSummary {
  const drawCalls = options.rendererInfo.render?.calls ?? 0;
  const textures = options.rendererInfo.memory?.textures ?? 0;
  const triangles = options.rendererInfo.render?.triangles ?? 0;
  return {
    ...summarizeFrameTimings(options.frameSamples),
    bundleBytes: options.bundleBytes ?? 0,
    drawCalls,
    drawEstimate: drawCalls,
    environmentInstances: options.environmentInstanceCount ?? options.instancingPlan.instanceCount + options.instancingPlan.uninstanced.length,
    geometries: options.rendererInfo.memory?.geometries ?? 0,
    instancedGroups: options.instancingPlan.groups.length,
    instances: options.instancingPlan.instanceCount,
    instancingGroupCount: options.instancingPlan.groups.length,
    loadMs: options.loadMs,
    programs: options.rendererInfo.programs?.length ?? 0,
    sourceAssets: options.sourceAssetCount ?? 0,
    textures,
    textureBytes: options.textureBytes,
    textureEstimate: textures,
    triangles,
    triangleEstimate: triangles,
    uninstancedRepeatedProps: options.instancingPlan.uninstancedRepeatedPropCount,
  };
}
