import type { IInstancingPlan } from "./instancing.js";

export interface IRendererInfoLike {
  memory?: { geometries?: number; textures?: number };
  programs?: unknown[] | null;
  render?: { calls?: number; triangles?: number };
}

export interface IPerformanceMetricSummary {
  averageFrameMs: number;
  drawCalls: number;
  geometries: number;
  instancedGroups: number;
  instances: number;
  loadMs: number;
  p95FrameMs: number;
  programs: number;
  textures: number;
  textureBytes: number;
  triangles: number;
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
  frameSamples: readonly number[];
  instancingPlan: IInstancingPlan;
  loadMs: number;
  rendererInfo: IRendererInfoLike;
  textureBytes: number;
}): IPerformanceMetricSummary {
  return {
    ...summarizeFrameTimings(options.frameSamples),
    drawCalls: options.rendererInfo.render?.calls ?? 0,
    geometries: options.rendererInfo.memory?.geometries ?? 0,
    instancedGroups: options.instancingPlan.groups.length,
    instances: options.instancingPlan.instanceCount,
    loadMs: options.loadMs,
    programs: options.rendererInfo.programs?.length ?? 0,
    textures: options.rendererInfo.memory?.textures ?? 0,
    textureBytes: options.textureBytes,
    triangles: options.rendererInfo.render?.triangles ?? 0,
    uninstancedRepeatedProps: options.instancingPlan.uninstancedRepeatedPropCount,
  };
}
