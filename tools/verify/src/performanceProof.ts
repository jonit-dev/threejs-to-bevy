import type { VerificationDiagnostic } from "./runner.js";

export const PERFORMANCE_PROOF_SCHEMA = "threenative.performance-proof";
export const PERFORMANCE_PROOF_VERSION = "0.1.0";

export type PerformanceMetricName =
  | "activeLodBands"
  | "drawCalls"
  | "drawGroups"
  | "entityCount"
  | "frameTimeMs"
  | "loadedTextureBytes"
  | "textureVariants"
  | "visibleInstances";

export interface PerformanceMetricUnsupported {
  diagnostic: {
    code: string;
    message: string;
    severity: "error" | "warning";
  };
  status: "unsupported";
}

export interface PerformanceMetricMeasured<TValue> {
  status: "measured";
  value: TValue;
}

export type PerformanceMetric<TValue> = PerformanceMetricMeasured<TValue> | PerformanceMetricUnsupported;

export interface FrameTimePercentiles {
  p50: number;
  p95: number;
  p99: number;
  sampleCount: number;
}

export interface TextureVariantMeasurement {
  loadedBytes: number;
  selectedVariantCount: number;
}

export interface PerformanceProofMetrics {
  activeLodBands: PerformanceMetric<string[]>;
  drawCalls: PerformanceMetric<number>;
  drawGroups: PerformanceMetric<number>;
  entityCount: PerformanceMetric<number>;
  frameTimeMs: PerformanceMetric<FrameTimePercentiles>;
  loadedTextureBytes: PerformanceMetric<number>;
  textureVariants: PerformanceMetric<TextureVariantMeasurement>;
  visibleInstances: PerformanceMetric<number>;
}

export interface PerformanceProofBudgets {
  activeLodBands: number;
  drawCalls: number;
  drawGroups: number;
  entityCount: number;
  frameTimeMsP95: number;
  frameTimeMsP99: number;
  loadedTextureBytes: number;
  textureVariantBytes: number;
  visibleInstances: number;
}

export interface PerformanceProofSidecar {
  budgets: PerformanceProofBudgets;
  generatedBy: string;
  metrics: PerformanceProofMetrics;
  runtime: {
    adapter: "bevy" | "web-three" | "webview";
    target: "desktop" | "native" | "web";
  };
  schema: typeof PERFORMANCE_PROOF_SCHEMA;
  status: "fail" | "pass";
  targetProfile: string;
  version: typeof PERFORMANCE_PROOF_VERSION;
}

const REQUIRED_METRICS: readonly PerformanceMetricName[] = [
  "frameTimeMs",
  "drawCalls",
  "drawGroups",
  "visibleInstances",
  "activeLodBands",
  "loadedTextureBytes",
  "entityCount",
  "textureVariants",
];

export function validatePerformanceProofSidecar(proof: unknown, options: { path?: string } = {}): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  const path = options.path;
  if (!isRecord(proof)) {
    return [diagnostic("TN_PERFORMANCE_PROOF_INVALID", "Performance proof sidecar must be a JSON object.", path)];
  }
  if (proof.schema !== PERFORMANCE_PROOF_SCHEMA) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_SCHEMA_INVALID", `Performance proof schema must be '${PERFORMANCE_PROOF_SCHEMA}'.`, joinPath(path, "schema")));
  }
  if (proof.version !== PERFORMANCE_PROOF_VERSION) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_VERSION_UNSUPPORTED", `Performance proof version must be '${PERFORMANCE_PROOF_VERSION}'.`, joinPath(path, "version")));
  }
  if (proof.status !== "pass" && proof.status !== "fail") {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_STATUS_INVALID", "Performance proof status must be 'pass' or 'fail'.", joinPath(path, "status")));
  }
  if (typeof proof.generatedBy !== "string" || proof.generatedBy.trim().length === 0) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_GENERATOR_MISSING", "Performance proof must identify the generator.", joinPath(path, "generatedBy")));
  }
  if (typeof proof.targetProfile !== "string" || proof.targetProfile.trim().length === 0) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_TARGET_PROFILE_MISSING", "Performance proof must identify the target profile.", joinPath(path, "targetProfile")));
  }
  validateRuntime(proof.runtime, diagnostics, joinPath(path, "runtime"));
  const budgets = validateBudgets(proof.budgets, diagnostics, joinPath(path, "budgets"));
  const metrics = validateMetrics(proof.metrics, diagnostics, joinPath(path, "metrics"));

  if (budgets !== undefined && metrics !== undefined) {
    diagnostics.push(...budgetDiagnostics(metrics, budgets, path));
  }
  const hasErrors = diagnostics.some((item) => item.severity === "error");
  if (proof.status === "pass" && hasErrors) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_STATUS_MISMATCH", "Performance proof status is 'pass' but one or more budget or schema errors were found.", joinPath(path, "status")));
  }
  if (proof.status === "fail" && !hasErrors) {
    diagnostics.push({
      code: "TN_PERFORMANCE_PROOF_STATUS_STALE",
      message: "Performance proof status is 'fail' but the sidecar validates within budget.",
      path: joinPath(path, "status"),
      severity: "warning",
      suggestedFix: "Regenerate the proof sidecar so status matches the measured metrics.",
    });
  }
  return diagnostics;
}

export function isPerformanceProofSidecarPassing(proof: unknown): boolean {
  return isRecord(proof)
    && proof.status === "pass"
    && validatePerformanceProofSidecar(proof).every((diagnostic) => diagnostic.severity !== "error");
}

function validateRuntime(value: unknown, diagnostics: VerificationDiagnostic[], path?: string): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_RUNTIME_MISSING", "Performance proof must include runtime target and adapter.", path));
    return;
  }
  if (value.target !== "desktop" && value.target !== "native" && value.target !== "web") {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_RUNTIME_TARGET_INVALID", "Performance proof runtime target must be 'web', 'desktop', or 'native'.", joinPath(path, "target")));
  }
  if (value.adapter !== "bevy" && value.adapter !== "web-three" && value.adapter !== "webview") {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_RUNTIME_ADAPTER_INVALID", "Performance proof runtime adapter must be 'web-three', 'webview', or 'bevy'.", joinPath(path, "adapter")));
  }
}

function validateBudgets(value: unknown, diagnostics: VerificationDiagnostic[], path?: string): PerformanceProofBudgets | undefined {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_BUDGETS_MISSING", "Performance proof must include target-profile budgets.", path));
    return undefined;
  }
  const budget: Partial<PerformanceProofBudgets> = {};
  for (const key of ["activeLodBands", "drawCalls", "drawGroups", "entityCount", "frameTimeMsP95", "frameTimeMsP99", "loadedTextureBytes", "textureVariantBytes", "visibleInstances"] as const) {
    const metric = value[key];
    if (!isNonNegativeNumber(metric)) {
      diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_BUDGET_INVALID", `Budget '${key}' must be a finite non-negative number.`, joinPath(path, key)));
      continue;
    }
    budget[key] = metric;
  }
  return diagnostics.some((item) => item.code === "TN_PERFORMANCE_PROOF_BUDGET_INVALID" || item.code === "TN_PERFORMANCE_PROOF_BUDGETS_MISSING")
    ? undefined
    : budget as PerformanceProofBudgets;
}

function validateMetrics(value: unknown, diagnostics: VerificationDiagnostic[], path?: string): PerformanceProofMetrics | undefined {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_METRICS_MISSING", "Performance proof must include required runtime metrics.", path));
    return undefined;
  }
  for (const name of REQUIRED_METRICS) {
    if (!(name in value)) {
      diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_METRIC_MISSING", `Performance proof is missing required metric '${name}'.`, joinPath(path, name)));
      continue;
    }
    validateMetric(name, value[name], diagnostics, joinPath(path, name));
  }
  return diagnostics.some((item) => item.code.startsWith("TN_PERFORMANCE_PROOF_METRIC")) ? undefined : value as unknown as PerformanceProofMetrics;
}

function validateMetric(name: PerformanceMetricName, metric: unknown, diagnostics: VerificationDiagnostic[], path?: string): void {
  if (!isRecord(metric)) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_METRIC_INVALID", `Metric '${name}' must be an object.`, path));
    return;
  }
  if (metric.status === "unsupported") {
    validateUnsupportedMetric(name, metric, diagnostics, path);
    return;
  }
  if (metric.status !== "measured") {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_METRIC_STATUS_INVALID", `Metric '${name}' status must be 'measured' or 'unsupported'.`, joinPath(path, "status")));
    return;
  }
  switch (name) {
    case "frameTimeMs":
      validateFrameTime(metric.value, diagnostics, joinPath(path, "value"));
      break;
    case "activeLodBands":
      if (!Array.isArray(metric.value) || metric.value.some((band) => typeof band !== "string" || band.trim().length === 0)) {
        diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_METRIC_INVALID", "Metric 'activeLodBands' value must be a string array.", joinPath(path, "value")));
      }
      break;
    case "textureVariants":
      validateTextureVariants(metric.value, diagnostics, joinPath(path, "value"));
      break;
    default:
      if (!isNonNegativeNumber(metric.value)) {
        diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_METRIC_INVALID", `Metric '${name}' value must be a finite non-negative number.`, joinPath(path, "value")));
      }
  }
}

function validateUnsupportedMetric(name: string, metric: Record<string, unknown>, diagnostics: VerificationDiagnostic[], path?: string): void {
  const unsupported = metric.diagnostic;
  if (!isRecord(unsupported) || typeof unsupported.code !== "string" || unsupported.code.trim().length === 0 || typeof unsupported.message !== "string" || unsupported.message.trim().length === 0 || (unsupported.severity !== "warning" && unsupported.severity !== "error")) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_UNSUPPORTED_DIAGNOSTIC_INVALID", `Unsupported metric '${name}' must include stable diagnostic code, severity, and message.`, joinPath(path, "diagnostic")));
  }
}

function validateFrameTime(value: unknown, diagnostics: VerificationDiagnostic[], path?: string): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_METRIC_INVALID", "Metric 'frameTimeMs' value must include p50, p95, p99, and sampleCount.", path));
    return;
  }
  for (const key of ["p50", "p95", "p99", "sampleCount"] as const) {
    if (!isNonNegativeNumber(value[key])) {
      diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_METRIC_INVALID", `Frame-time percentile '${key}' must be a finite non-negative number.`, joinPath(path, key)));
    }
  }
}

function validateTextureVariants(value: unknown, diagnostics: VerificationDiagnostic[], path?: string): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_METRIC_INVALID", "Metric 'textureVariants' value must include selectedVariantCount and loadedBytes.", path));
    return;
  }
  if (!isNonNegativeNumber(value.selectedVariantCount)) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_METRIC_INVALID", "Metric 'textureVariants.selectedVariantCount' must be a finite non-negative number.", joinPath(path, "selectedVariantCount")));
  }
  if (!isNonNegativeNumber(value.loadedBytes)) {
    diagnostics.push(diagnostic("TN_PERFORMANCE_PROOF_METRIC_INVALID", "Metric 'textureVariants.loadedBytes' must be a finite non-negative number.", joinPath(path, "loadedBytes")));
  }
}

function budgetDiagnostics(metrics: PerformanceProofMetrics, budgets: PerformanceProofBudgets, path?: string): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  const checks: Array<[name: PerformanceMetricName, actual: number | undefined, budget: number, label: string]> = [
    ["drawCalls", measuredNumber(metrics.drawCalls), budgets.drawCalls, "draw calls"],
    ["drawGroups", measuredNumber(metrics.drawGroups), budgets.drawGroups, "draw groups"],
    ["visibleInstances", measuredNumber(metrics.visibleInstances), budgets.visibleInstances, "visible instances"],
    ["entityCount", measuredNumber(metrics.entityCount), budgets.entityCount, "entity count"],
    ["loadedTextureBytes", measuredNumber(metrics.loadedTextureBytes), budgets.loadedTextureBytes, "loaded texture bytes"],
    ["activeLodBands", metrics.activeLodBands.status === "measured" ? metrics.activeLodBands.value.length : undefined, budgets.activeLodBands, "active LOD bands"],
    ["textureVariants", metrics.textureVariants.status === "measured" ? metrics.textureVariants.value.loadedBytes : undefined, budgets.textureVariantBytes, "texture variant loaded bytes"],
  ];
  for (const [name, actual, budget, label] of checks) {
    if (actual !== undefined && actual > budget) {
      diagnostics.push(overBudgetDiagnostic(name, actual, budget, label, path));
    }
  }
  if (metrics.frameTimeMs.status === "measured") {
    if (metrics.frameTimeMs.value.p95 > budgets.frameTimeMsP95) {
      diagnostics.push(overBudgetDiagnostic("frameTimeMs", metrics.frameTimeMs.value.p95, budgets.frameTimeMsP95, "frame time p95", path));
    }
    if (metrics.frameTimeMs.value.p99 > budgets.frameTimeMsP99) {
      diagnostics.push(overBudgetDiagnostic("frameTimeMs", metrics.frameTimeMs.value.p99, budgets.frameTimeMsP99, "frame time p99", path));
    }
  }
  return diagnostics;
}

function measuredNumber(metric: PerformanceMetric<number>): number | undefined {
  return metric.status === "measured" ? metric.value : undefined;
}

function overBudgetDiagnostic(name: PerformanceMetricName, actual: number, budget: number, label: string, path?: string): VerificationDiagnostic {
  return {
    code: "TN_PERFORMANCE_PROOF_BUDGET_EXCEEDED",
    message: `Performance proof ${label} ${actual} exceeds budget ${budget}.`,
    path: joinPath(path, `metrics/${name}`),
    severity: "error",
    suggestedFix: "Reduce scene/runtime cost or update the target profile only with matching release evidence.",
  };
}

function diagnostic(code: string, message: string, path?: string): VerificationDiagnostic {
  return {
    code,
    message,
    path,
    severity: "error",
    suggestedFix: "Regenerate the performance proof sidecar with the current verifier contract.",
  };
}

function joinPath(path: string | undefined, suffix: string): string | undefined {
  return path === undefined ? undefined : `${path}/${suffix}`;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
