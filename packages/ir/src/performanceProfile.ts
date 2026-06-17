import type { IPerformanceProfile, ISupportRepairHint } from "./types.js";
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
  if (profile.support !== undefined) {
    validateSupportProfile(profile.support, `${path}/support`, diagnostics);
  }
  if (profile.profiler !== undefined) {
    validateProfilerMetadata(profile.profiler, `${path}/profiler`, diagnostics);
  }
  return diagnostics;
}

function validateSupportProfile(support: IPerformanceProfile["support"], path: string, diagnostics: IIrDiagnostic[]): void {
  if (support === undefined || !Array.isArray(support.requirements)) {
    diagnostics.push({
      code: "TN_IR_SUPPORT_PROFILE_INVALID",
      message: "Support profile must include requirements.",
      path,
      severity: "error",
    });
    return;
  }
  for (const [index, requirement] of support.requirements.entries()) {
    const available = new Set(requirement.availableCapabilities ?? []);
    for (const capability of requirement.requiredCapabilities ?? []) {
      if (available.has(capability)) {
        continue;
      }
      const hint = requirement.repairHints?.find((candidate: ISupportRepairHint) => candidate.missingCapability === capability);
      diagnostics.push({
        code: "TN_IR_SUPPORT_PROFILE_CAPABILITY_MISSING",
        message: `Support target '${requirement.category}' is missing capability '${capability}'.`,
        path: `${path}/requirements/${index}/requiredCapabilities`,
        severity: "warning",
        suggestion: hint?.suggestion ?? "Add the missing support capability or remove it from requiredCapabilities.",
        value: capability,
      });
    }
  }
}

function validateProfilerMetadata(profiler: NonNullable<IPerformanceProfile["profiler"]>, path: string, diagnostics: IIrDiagnostic[]): void {
  for (const [key, value] of Object.entries(profiler)) {
    if (typeof value === "boolean") {
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      diagnostics.push({
        code: "TN_IR_SUPPORT_PROFILER_FIELD_INVALID",
        message: `Support profiler field '${key}' must be a non-negative finite number.`,
        path: `${path}/${key}`,
        severity: "error",
      });
    }
  }
}
