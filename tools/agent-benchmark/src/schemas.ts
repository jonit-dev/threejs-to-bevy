import { readFile } from "node:fs/promises";

import { type BenchmarkCondition, type IBenchmarkDiagnostic, type IBenchmarkReport, type IBenchmarkRunReport, type IBenchmarkSession } from "./types.js";

export interface ISchemaValidationResult {
  diagnostics: IBenchmarkDiagnostic[];
  ok: boolean;
}

const conditions = new Set<BenchmarkCondition>(["threenative", "vanilla"]);
const stopReasons = new Set(["claimed-playable", "token-cap", "operator-stopped", "failed-setup"]);

export function validateSession(value: unknown): ISchemaValidationResult {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (!isRecord(value)) {
    return { diagnostics: [{ code: "TN_BENCH_SCHEMA_OBJECT", message: "Session must be a JSON object.", severity: "error" }], ok: false };
  }
  requireLiteral(value, "schema", "threenative.agent-benchmark-session", diagnostics);
  requireLiteral(value, "version", 2, diagnostics);
  requireString(value, "runId", diagnostics);
  requireString(value, "promptId", diagnostics);
  requireEnum(value, "condition", conditions, "TN_BENCH_SCHEMA_CONDITION", diagnostics);
  requireEnum(value, "stopReason", stopReasons, "TN_BENCH_SCHEMA_STOP_REASON", diagnostics);
  requireNonNegativeNumber(value, "tokenCount", diagnostics);
  requireNonNegativeNumber(value, "iterationCount", diagnostics);
  requireOptionalNonNegativeNumber(value, "inputTokens", diagnostics);
  requireOptionalNonNegativeNumber(value, "cachedInputTokens", diagnostics);
  requireOptionalNonNegativeNumber(value, "uncachedInputTokens", diagnostics);
  requireOptionalNonNegativeNumber(value, "outputTokens", diagnostics);
  requireOptionalNonNegativeNumber(value, "costWeightedTokens", diagnostics);
  requireOptionalNonNegativeNumber(value, "toolOutputBytes", diagnostics);
  requireOptionalNonNegativeNumber(value, "failedCommandCount", diagnostics);
  requireOptionalNonNegativeNumber(value, "toolStepCount", diagnostics);
  if (!isRecord(value.humanRubric)) {
    diagnostics.push({ code: "TN_BENCH_SCHEMA_HUMAN_RUBRIC", message: "Session humanRubric must be an object.", severity: "error" });
  } else {
    requireRangeNumber(value.humanRubric, "playability", 0, 3, diagnostics);
    requireRangeNumber(value.humanRubric, "visual", 0, 3, diagnostics);
  }
  return { diagnostics, ok: diagnostics.length === 0 };
}

export function validateRunReport(value: unknown): ISchemaValidationResult {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (!isRecord(value)) {
    return { diagnostics: [{ code: "TN_BENCH_SCHEMA_OBJECT", message: "Run report must be a JSON object.", severity: "error" }], ok: false };
  }
  requireLiteral(value, "schema", "threenative.agent-benchmark-run", diagnostics);
  requireLiteral(value, "version", 2, diagnostics);
  requireString(value, "runId", diagnostics);
  requireString(value, "promptId", diagnostics);
  requireString(value, "candidate", diagnostics);
  requireEnum(value, "condition", conditions, "TN_BENCH_SCHEMA_CONDITION", diagnostics);
  if (typeof value.ok !== "boolean") {
    diagnostics.push({ code: "TN_BENCH_SCHEMA_OK", message: "Run report ok must be boolean.", severity: "error" });
  }
  diagnostics.push(...validateSession(value.session).diagnostics);
  return { diagnostics, ok: diagnostics.length === 0 };
}

export function validateAggregateReport(value: unknown): ISchemaValidationResult {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (!isRecord(value)) {
    return { diagnostics: [{ code: "TN_BENCH_SCHEMA_OBJECT", message: "Aggregate report must be a JSON object.", severity: "error" }], ok: false };
  }
  requireLiteral(value, "schema", "threenative.agent-benchmark-report", diagnostics);
  requireLiteral(value, "version", 2, diagnostics);
  requireNonNegativeNumber(value, "runCount", diagnostics);
  if (!Array.isArray(value.promptSummaries)) {
    diagnostics.push({ code: "TN_BENCH_SCHEMA_PROMPT_SUMMARIES", message: "Aggregate report promptSummaries must be an array.", severity: "error" });
  }
  if (!isRecord(value.verdict)) {
    diagnostics.push({ code: "TN_BENCH_SCHEMA_VERDICT", message: "Aggregate report verdict must be an object.", severity: "error" });
  } else if (value.verdict.threshold !== "threenative-median-tokens <= 0.5x vanilla-median-tokens") {
    diagnostics.push({ code: "TN_BENCH_SCHEMA_THRESHOLD", message: "Aggregate report threshold must use the <=0.5x raw-token gate.", severity: "error" });
  }
  return { diagnostics, ok: diagnostics.length === 0 };
}

export async function readSession(path: string): Promise<{ diagnostics: IBenchmarkDiagnostic[]; session?: IBenchmarkSession }> {
  try {
    const session = JSON.parse(await readFile(path, "utf8")) as unknown;
    const validation = validateSession(session);
    return validation.ok ? { diagnostics: [], session: session as IBenchmarkSession } : { diagnostics: validation.diagnostics };
  } catch (error) {
    return {
      diagnostics: [{
        code: "TN_BENCH_SESSION_READ_FAILED",
        message: `Unable to read benchmark session file: ${error instanceof Error ? error.message : String(error)}.`,
        severity: "error",
        suggestedFix: "Write session.json using tools/agent-benchmark/schemas/session.schema.json before scoring.",
      }],
    };
  }
}

export function isBenchmarkRunReport(value: unknown): value is IBenchmarkRunReport {
  return validateRunReport(value).ok;
}

export function isBenchmarkReport(value: unknown): value is IBenchmarkReport {
  return validateAggregateReport(value).ok;
}

function requireLiteral(record: Record<string, unknown>, key: string, expected: unknown, diagnostics: IBenchmarkDiagnostic[]): void {
  if (record[key] !== expected) {
    diagnostics.push({ code: "TN_BENCH_SCHEMA_LITERAL", message: `${key} must be ${JSON.stringify(expected)}.`, severity: "error" });
  }
}

function requireString(record: Record<string, unknown>, key: string, diagnostics: IBenchmarkDiagnostic[]): void {
  if (typeof record[key] !== "string" || record[key] === "") {
    diagnostics.push({ code: "TN_BENCH_SCHEMA_STRING", message: `${key} must be a non-empty string.`, severity: "error" });
  }
}

function requireNonNegativeNumber(record: Record<string, unknown>, key: string, diagnostics: IBenchmarkDiagnostic[]): void {
  if (typeof record[key] !== "number" || !Number.isFinite(record[key]) || record[key] < 0) {
    diagnostics.push({ code: "TN_BENCH_SCHEMA_NUMBER", message: `${key} must be a non-negative number.`, severity: "error" });
  }
}

function requireOptionalNonNegativeNumber(record: Record<string, unknown>, key: string, diagnostics: IBenchmarkDiagnostic[]): void {
  if (record[key] !== undefined) {
    requireNonNegativeNumber(record, key, diagnostics);
  }
}

function requireRangeNumber(record: Record<string, unknown>, key: string, min: number, max: number, diagnostics: IBenchmarkDiagnostic[]): void {
  if (typeof record[key] !== "number" || !Number.isFinite(record[key]) || record[key] < min || record[key] > max) {
    diagnostics.push({ code: "TN_BENCH_SCHEMA_RUBRIC_RANGE", message: `${key} must be a number from ${min} to ${max}.`, severity: "error" });
  }
}

function requireEnum(record: Record<string, unknown>, key: string, allowed: Set<string>, code: string, diagnostics: IBenchmarkDiagnostic[]): void {
  if (typeof record[key] !== "string" || !allowed.has(record[key])) {
    diagnostics.push({ code, message: `${key} must be one of: ${Array.from(allowed).join(", ")}.`, severity: "error" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
