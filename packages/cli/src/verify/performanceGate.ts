import type { IPerformanceMetricSummary } from "@threenative/runtime-web-three";
import type { IVerificationDiagnostic } from "./report.js";

interface IPerformanceThreshold {
  max: number;
  warn?: number;
}

interface IPerformanceProfileLike {
  averageFrameMs: IPerformanceThreshold;
  drawCalls: IPerformanceThreshold;
  instancedGroups: IPerformanceThreshold;
  instances: IPerformanceThreshold;
  loadMs: IPerformanceThreshold;
  p95FrameMs: IPerformanceThreshold;
  textureBytes: IPerformanceThreshold;
  triangles: IPerformanceThreshold;
  uninstancedRepeatedProps: IPerformanceThreshold;
  worstFrameMs: IPerformanceThreshold;
}

interface ITargetProfileLike {
  performance?: IPerformanceProfileLike;
}

const metricMap = {
  averageFrameMs: "averageFrameMs",
  drawCalls: "drawCalls",
  instancedGroups: "instancedGroups",
  instances: "instances",
  loadMs: "loadMs",
  p95FrameMs: "p95FrameMs",
  textureBytes: "textureBytes",
  triangles: "triangles",
  uninstancedRepeatedProps: "uninstancedRepeatedProps",
  worstFrameMs: "worstFrameMs",
} as const;

export interface IPerformanceGateResult {
  diagnostics: IVerificationDiagnostic[];
  status: "pass" | "fail";
  warnings: IVerificationDiagnostic[];
}

export function evaluatePerformanceGate(options: {
  artifactPath: string;
  metrics: IPerformanceMetricSummary;
  targetProfile: ITargetProfileLike;
}): IPerformanceGateResult {
  const diagnostics: IVerificationDiagnostic[] = [];
  const warnings: IVerificationDiagnostic[] = [];
  const profile = options.targetProfile.performance;
  if (profile === undefined) {
    diagnostics.push({
      code: "TN_PERFORMANCE_PROFILE_MISSING",
      likelyArea: "compiler",
      message: "V3 target profile does not define performance thresholds.",
      severity: "error",
    });
    return { diagnostics, status: "fail", warnings };
  }

  for (const [metricName, summaryKey] of Object.entries(metricMap)) {
    const threshold = profile[metricName as keyof typeof metricMap];
    const actual = options.metrics[summaryKey as keyof IPerformanceMetricSummary] as number;
    if (actual > threshold.max) {
      diagnostics.push({
        code: "TN_PERFORMANCE_BUDGET_EXCEEDED",
        likelyArea: "runtime-web",
        message: `${metricName} measured ${actual}, exceeding max ${threshold.max}. Artifact: ${options.artifactPath}.`,
        severity: "error",
      });
    } else if (threshold.warn !== undefined && actual > threshold.warn) {
      warnings.push({
        code: "TN_PERFORMANCE_BUDGET_WARNING",
        likelyArea: "runtime-web",
        message: `${metricName} measured ${actual}, exceeding warning ${threshold.warn}. Artifact: ${options.artifactPath}.`,
        severity: "warning",
      });
    }
  }

  return { diagnostics, status: diagnostics.length === 0 ? "pass" : "fail", warnings };
}
