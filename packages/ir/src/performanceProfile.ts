import type { IPerformanceProfile } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

const metricNames = [
  "averageFrameMs",
  "drawCalls",
  "instancedGroups",
  "instances",
  "loadMs",
  "p95FrameMs",
  "textureBytes",
  "triangles",
  "uninstancedRepeatedProps",
  "worstFrameMs",
] as const;

export type PerformanceMetricName = (typeof metricNames)[number];

export function validatePerformanceProfile(
  profile: IPerformanceProfile | undefined,
  path = "target.profile.json/performance",
): IIrDiagnostic[] {
  if (profile === undefined) {
    return [];
  }
  const diagnostics: IIrDiagnostic[] = [];
  if (profile.requiredTarget !== "web") {
    diagnostics.push({
      code: "TN_IR_PERFORMANCE_TARGET_UNSUPPORTED",
      message: "Performance profile must require the web target.",
      path: `${path}/requiredTarget`,
    });
  }
  for (const metric of metricNames) {
    const threshold = profile[metric];
    const min = metric === "uninstancedRepeatedProps" ? 0 : Number.MIN_VALUE;
    if (!Number.isFinite(threshold.max) || threshold.max < min) {
      diagnostics.push({
        code: "TN_IR_PERFORMANCE_THRESHOLD_INVALID",
        message: `Performance metric '${metric}' must define a finite max threshold${min === 0 ? " of at least 0" : " above 0"}.`,
        path: `${path}/${metric}/max`,
      });
    }
    if (threshold.warn !== undefined) {
      if (!Number.isFinite(threshold.warn) || threshold.warn < min) {
        diagnostics.push({
          code: "TN_IR_PERFORMANCE_THRESHOLD_INVALID",
          message: `Performance metric '${metric}' must define a positive finite warn threshold.`,
          path: `${path}/${metric}/warn`,
        });
      } else if (Number.isFinite(threshold.max) && threshold.warn > threshold.max) {
        diagnostics.push({
          code: "TN_IR_PERFORMANCE_WARN_EXCEEDS_MAX",
          message: `Performance metric '${metric}' has warn threshold ${threshold.warn} above max ${threshold.max}.`,
          path: `${path}/${metric}/warn`,
        });
      }
    }
  }
  return diagnostics;
}
