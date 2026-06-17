export interface IRuntimeDiagnostic {
  code: string;
  message: string;
  path: string;
  severity: "error" | "warning";
  suggestion?: string;
}

export type RuntimeDiagnosticSeverity = "error" | "warning";

export interface IRuntimeDiagnosticReport {
  diagnostics: readonly IRuntimeDiagnostic[];
  schema: "threenative.runtime-diagnostics";
  version: "0.1.0";
}

export interface IRuntimeDiagnosticsValidationResult {
  diagnostics: IRuntimeDiagnostic[];
  ok: boolean;
}

const UNSUPPORTED_NETWORKING = [
  "multiplayer",
  "onlinePresence",
  "prediction",
  "replication",
  "serverAuthority",
  "websocket",
] as const;

const UNSUPPORTED_FEATURES = [
  "advancedRenderer",
  "customLoader",
  "dom",
  "filesystem",
  "material",
  "rawPlatformApi",
  "runtimeDeclaration",
] as const;

export function validateRuntimeDiagnosticReport(report: unknown, path = "runtime-diagnostics.json"): IRuntimeDiagnosticsValidationResult {
  const diagnostics: IRuntimeDiagnostic[] = [];
  if (!isRecord(report)) {
    return {
      diagnostics: [diagnostic("TN_RUNTIME_DIAGNOSTICS_INVALID", "Runtime diagnostics report must be an object.", path, "error")],
      ok: false,
    };
  }
  if (report.schema !== "threenative.runtime-diagnostics" || report.version !== "0.1.0") {
    diagnostics.push(diagnostic("TN_RUNTIME_DIAGNOSTICS_VERSION_UNSUPPORTED", "Runtime diagnostics report must use threenative.runtime-diagnostics version 0.1.0.", path, "error"));
  }
  if (!Array.isArray(report.diagnostics)) {
    diagnostics.push(diagnostic("TN_RUNTIME_DIAGNOSTICS_LIST_INVALID", "Runtime diagnostics must be an array.", `${path}/diagnostics`, "error"));
  } else {
    report.diagnostics.forEach((entry, index) => validateRuntimeDiagnostic(entry, `${path}/diagnostics/${index}`, diagnostics));
  }
  return { diagnostics, ok: diagnostics.length === 0 };
}

export function diagnoseUnsupportedRuntimeDeclarations(declarations: unknown, path = "runtime-declarations.json"): IRuntimeDiagnostic[] {
  if (!isRecord(declarations)) {
    return [diagnostic("TN_RUNTIME_DECLARATIONS_INVALID", "Runtime declarations must be an object.", path, "error")];
  }
  const diagnostics: IRuntimeDiagnostic[] = [];
  const networking = isRecord(declarations.networking) ? declarations.networking : {};
  for (const feature of UNSUPPORTED_NETWORKING) {
    if (networking[feature] !== undefined) {
      diagnostics.push(diagnostic(
        `TN_UNSUPPORTED_NETWORKING_${constantName(feature)}`,
        `Networking feature '${feature}' is outside the portable runtime scope.`,
        `${path}/networking/${feature}`,
        "error",
        "Remove the networking declaration or implement it in a target-specific adapter outside portable IR.",
      ));
    }
  }
  const unsupported = isRecord(declarations.unsupportedFeatures) ? declarations.unsupportedFeatures : {};
  for (const feature of UNSUPPORTED_FEATURES) {
    if (unsupported[feature] !== undefined) {
      diagnostics.push(diagnostic(
        `TN_UNSUPPORTED_FEATURE_${constantName(feature)}`,
        `Feature '${feature}' is outside the portable runtime scope.`,
        `${path}/unsupportedFeatures/${feature}`,
        "error",
        "Remove the unsupported declaration or replace it with a portable SDK/IR declaration.",
      ));
    }
  }
  return diagnostics;
}

function validateRuntimeDiagnostic(value: unknown, path: string, diagnostics: IRuntimeDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("TN_RUNTIME_DIAGNOSTIC_INVALID", "Runtime diagnostic entries must be objects.", path, "error"));
    return;
  }
  for (const key of ["code", "message", "path"]) {
    if (typeof value[key] !== "string" || String(value[key]).trim() === "") {
      diagnostics.push(diagnostic("TN_RUNTIME_DIAGNOSTIC_FIELD_INVALID", `Runtime diagnostic '${key}' must be a non-empty string.`, `${path}/${key}`, "error"));
    }
  }
  if (!["error", "warning"].includes(String(value.severity))) {
    diagnostics.push(diagnostic("TN_RUNTIME_DIAGNOSTIC_SEVERITY_INVALID", "Runtime diagnostic severity must be error or warning.", `${path}/severity`, "error"));
  }
  if (value.suggestion !== undefined && (typeof value.suggestion !== "string" || value.suggestion.trim() === "")) {
    diagnostics.push(diagnostic("TN_RUNTIME_DIAGNOSTIC_SUGGESTION_INVALID", "Runtime diagnostic suggestion must be a non-empty string when provided.", `${path}/suggestion`, "error"));
  }
}

function diagnostic(code: string, message: string, path: string, severity: RuntimeDiagnosticSeverity, suggestion?: string): IRuntimeDiagnostic {
  return { code, message, path, severity, ...(suggestion === undefined ? {} : { suggestion }) };
}

function constantName(value: string): string {
  return value.replace(/[A-Z]/g, (part) => `_${part}`).toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
