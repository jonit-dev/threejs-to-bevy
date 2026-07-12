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

export type RuntimeWriteWriter = "animation" | "initial-ir" | "physics" | "runtime-sync" | "scheduler" | "script";
export type RuntimeWriteDisposition = "accepted" | "composed" | "conflict" | "dropped" | "overwritten";
export type RuntimeWriteTargetKind = "component" | "resource" | "state";
export type RuntimeWriteInlineValue = boolean | number | string | readonly number[];

export interface IRuntimeWriteObservation {
  disposition: RuntimeWriteDisposition;
  fingerprint: string;
  inlineValue?: RuntimeWriteInlineValue;
  newFingerprint?: string;
  oldFingerprint?: string;
  path: string;
  schedule?: string;
  system?: string;
  targetId: string;
  targetKind: RuntimeWriteTargetKind;
  tick: number;
  writer: RuntimeWriteWriter;
}

export interface IRuntimeWriteAuditReport {
  observations: IRuntimeWriteObservation[];
  schema: "threenative.runtime-write-audit";
  version: "0.1.0";
}

export interface IRuntimeWriteAuditValidationResult {
  diagnostics: IRuntimeDiagnostic[];
  ok: boolean;
}

export function createRuntimeWriteObservation(input: {
  disposition: RuntimeWriteDisposition;
  newValue?: unknown;
  oldValue?: unknown;
  path: string;
  schedule?: string;
  system?: string;
  targetId: string;
  targetKind: RuntimeWriteTargetKind;
  tick: number;
  writer: RuntimeWriteWriter;
}): IRuntimeWriteObservation {
  const fingerprint = runtimeWriteValueFingerprint(input.newValue);
  const observation: IRuntimeWriteObservation = {
    disposition: input.disposition,
    fingerprint,
    path: input.path,
    targetId: input.targetId,
    targetKind: input.targetKind,
    tick: Math.max(0, Math.floor(Number.isFinite(input.tick) ? input.tick : 0)),
    writer: input.writer,
  };
  const inlineValue = runtimeWriteInlineValue(input.newValue);
  if (inlineValue !== undefined) {
    observation.inlineValue = inlineValue;
  }
  if (input.oldValue !== undefined) {
    observation.oldFingerprint = runtimeWriteValueFingerprint(input.oldValue);
  }
  observation.newFingerprint = fingerprint;
  if (input.schedule !== undefined) {
    observation.schedule = input.schedule;
  }
  if (input.system !== undefined) {
    observation.system = input.system;
  }
  return observation;
}

export function runtimeWriteValueFingerprint(value: unknown): string {
  const normalized = stableRuntimeWriteValue(value);
  let hash = 2166136261;
  for (const character of normalized) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function serializeRuntimeWriteAudit(observations: readonly IRuntimeWriteObservation[]): IRuntimeWriteAuditReport {
  return {
    observations: [...observations]
      .map((observation) => ({ ...observation, ...(observation.inlineValue === undefined ? {} : { inlineValue: cloneRuntimeWriteValue(observation.inlineValue) }) }))
      .sort(runtimeWriteObservationSort),
    schema: "threenative.runtime-write-audit",
    version: "0.1.0",
  };
}

export function validateRuntimeWriteAuditReport(report: unknown, path = "runtime-write-audit.json"): IRuntimeWriteAuditValidationResult {
  const diagnostics: IRuntimeDiagnostic[] = [];
  if (!isRecord(report)) {
    return { diagnostics: [diagnostic("TN_RUNTIME_WRITE_AUDIT_INVALID", "Runtime write audit must be an object.", path, "error")], ok: false };
  }
  if (report.schema !== "threenative.runtime-write-audit" || report.version !== "0.1.0") {
    diagnostics.push(diagnostic("TN_RUNTIME_WRITE_AUDIT_VERSION_UNSUPPORTED", "Runtime write audit must use version 0.1.0.", path, "error"));
  }
  if (!Array.isArray(report.observations)) {
    diagnostics.push(diagnostic("TN_RUNTIME_WRITE_AUDIT_OBSERVATIONS_INVALID", "Runtime write audit observations must be an array.", `${path}/observations`, "error"));
  } else {
    report.observations.forEach((entry, index) => validateRuntimeWriteObservation(entry, `${path}/observations/${index}`, diagnostics));
  }
  return { diagnostics, ok: diagnostics.length === 0 };
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
  "promise",
  "rawPlatformApi",
  "rawRuntimeHandle",
  "runtimePlugin",
  "runtimeDeclaration",
  "timer",
  "worker",
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

function validateRuntimeWriteObservation(value: unknown, path: string, diagnostics: IRuntimeDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("TN_RUNTIME_WRITE_OBSERVATION_INVALID", "Runtime write observations must be objects.", path, "error"));
    return;
  }
  for (const key of ["fingerprint", "path", "targetId"]) {
    if (typeof value[key] !== "string" || String(value[key]).trim() === "") {
      diagnostics.push(diagnostic("TN_RUNTIME_WRITE_OBSERVATION_FIELD_INVALID", `Runtime write observation '${key}' must be a non-empty string.`, `${path}/${key}`, "error"));
    }
  }
  if (!["component", "resource", "state"].includes(String(value.targetKind))) {
    diagnostics.push(diagnostic("TN_RUNTIME_WRITE_OBSERVATION_TARGET_INVALID", "Runtime write observation targetKind is unsupported.", `${path}/targetKind`, "error"));
  }
  if (!["accepted", "composed", "conflict", "dropped", "overwritten"].includes(String(value.disposition))) {
    diagnostics.push(diagnostic("TN_RUNTIME_WRITE_OBSERVATION_DISPOSITION_INVALID", "Runtime write observation disposition is unsupported.", `${path}/disposition`, "error"));
  }
  if (!["animation", "initial-ir", "physics", "runtime-sync", "scheduler", "script"].includes(String(value.writer))) {
    diagnostics.push(diagnostic("TN_RUNTIME_WRITE_OBSERVATION_WRITER_INVALID", "Runtime write observation writer is unsupported.", `${path}/writer`, "error"));
  }
  if (!Number.isInteger(value.tick) || Number(value.tick) < 0) {
    diagnostics.push(diagnostic("TN_RUNTIME_WRITE_OBSERVATION_TICK_INVALID", "Runtime write observation tick must be a non-negative integer.", `${path}/tick`, "error"));
  }
  if (value.inlineValue !== undefined && !isInlineValue(value.inlineValue)) {
    diagnostics.push(diagnostic("TN_RUNTIME_WRITE_OBSERVATION_VALUE_UNBOUNDED", "Runtime write inlineValue must be a scalar or numeric tuple.", `${path}/inlineValue`, "error"));
  }
}

function diagnostic(code: string, message: string, path: string, severity: RuntimeDiagnosticSeverity, suggestion?: string): IRuntimeDiagnostic {
  return { code, message, path, severity, ...(suggestion === undefined ? {} : { suggestion }) };
}

function runtimeWriteObservationSort(left: IRuntimeWriteObservation, right: IRuntimeWriteObservation): number {
  return [left.tick, left.targetKind, left.targetId, left.path, left.writer, left.schedule ?? "", left.system ?? "", left.disposition, left.fingerprint]
    .map(String)
    .join("\0")
    .localeCompare([right.tick, right.targetKind, right.targetId, right.path, right.writer, right.schedule ?? "", right.system ?? "", right.disposition, right.fingerprint].map(String).join("\0"));
}

function runtimeWriteInlineValue(value: unknown): RuntimeWriteInlineValue | undefined {
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length <= 4 && value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return [...value];
  }
  return undefined;
}

function isInlineValue(value: unknown): value is RuntimeWriteInlineValue {
  return runtimeWriteInlineValue(value) !== undefined;
}

function stableRuntimeWriteValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "number:non-finite";
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return `${typeof value}:${JSON.stringify(value)}`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableRuntimeWriteValue).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableRuntimeWriteValue(value[key])}`).join(",")}}`;
  }
  return `${typeof value}:${String(value)}`;
}

function cloneRuntimeWriteValue<T>(value: T): T {
  return Array.isArray(value) ? [...value] as T : value;
}

function constantName(value: string): string {
  return value.replace(/[A-Z]/g, (part) => `_${part}`).toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
