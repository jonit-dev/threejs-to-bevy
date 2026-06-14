import type { IVerificationDiagnostic, VerificationStatus } from "./report.js";

export interface IV4EffectLog {
  entries: IV4EffectLogEntry[];
  schema: string;
  version: number;
}

export interface IV4EffectLogEntry {
  command?: string;
  component?: string;
  entity?: string;
  event?: string;
  frame: number;
  kind: string;
  payload?: unknown;
  resource?: string;
  schedule: string;
  service?: string;
  system: string;
  tick: number;
  value?: unknown;
}

export interface IV4LogComparison {
  diagnostics: IVerificationDiagnostic[];
  firstMismatch?: IV4LogMismatch;
  ignoredFields: string[];
  status: VerificationStatus;
  summary: {
    nativeEntries: number;
    comparedEntries: number;
    webEntries: number;
  };
}

export interface IV4LogMismatch {
  actual?: unknown;
  expected?: unknown;
  index: number;
  message: string;
  path: string;
}

export function compareV4EffectLogs(web: IV4EffectLog, native: IV4EffectLog): IV4LogComparison {
  const normalizedWeb = normalizeLog(web);
  const normalizedNative = normalizeLog(native);
  const firstMismatch = findFirstMismatch(normalizedWeb, normalizedNative);
  const diagnostics =
    firstMismatch === undefined
      ? []
      : [
          {
            code: mismatchCode(firstMismatch),
            likelyArea: "runtime-web" as const,
            message: firstMismatch.message,
            severity: "error" as const,
          },
        ];

  return {
    diagnostics,
    firstMismatch,
    ignoredFields: [],
    status: diagnostics.length === 0 ? "pass" : "fail",
    summary: {
      comparedEntries: Math.min(normalizedWeb.entries.length, normalizedNative.entries.length),
      nativeEntries: normalizedNative.entries.length,
      webEntries: normalizedWeb.entries.length,
    },
  };
}

export function normalizeV4EffectLog(log: IV4EffectLog): IV4EffectLog {
  return normalizeLog(log);
}

function findFirstMismatch(web: IV4EffectLog, native: IV4EffectLog): IV4LogMismatch | undefined {
  if (web.schema !== native.schema) {
    return mismatch(0, "schema", web.schema, native.schema);
  }
  if (web.version !== native.version) {
    return mismatch(0, "version", web.version, native.version);
  }
  if (web.entries.length !== native.entries.length) {
    return mismatch(
      Math.min(web.entries.length, native.entries.length),
      "entries.length",
      web.entries.length,
      native.entries.length,
    );
  }

  for (let index = 0; index < web.entries.length; index += 1) {
    const expected = web.entries[index];
    const actual = native.entries[index];
    if (expected === undefined || actual === undefined) {
      return mismatch(index, `entries/${index}`, expected, actual);
    }
    const entryMismatch = compareEntry(index, expected, actual);
    if (entryMismatch !== undefined) {
      return entryMismatch;
    }
  }
  return undefined;
}

function compareEntry(index: number, expected: IV4EffectLogEntry, actual: IV4EffectLogEntry): IV4LogMismatch | undefined {
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)].sort());
  for (const key of keys) {
    const left = (expected as unknown as Record<string, unknown>)[key];
    const right = (actual as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      return mismatch(index, `entries/${index}/${key}`, left, right);
    }
  }
  return undefined;
}

function mismatch(index: number, path: string, expected: unknown, actual: unknown): IV4LogMismatch {
  return {
    actual,
    expected,
    index,
    message: `V4 effect log mismatch at ${path}: expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`,
    path,
  };
}

function mismatchCode(mismatch: IV4LogMismatch): string {
  if (mismatch.path.endsWith("/command")) {
    return "TN_V4_EFFECT_LOG_COMMAND_MISMATCH";
  }
  if (mismatch.path.endsWith("/service")) {
    return "TN_V4_EFFECT_LOG_SERVICE_MISMATCH";
  }
  if (mismatch.path.endsWith("/event")) {
    return "TN_V4_EFFECT_LOG_EVENT_MISMATCH";
  }
  if (mismatch.path.endsWith("/value") || mismatch.path.endsWith("/payload")) {
    return "TN_V4_EFFECT_LOG_PAYLOAD_MISMATCH";
  }
  return "TN_V4_EFFECT_LOG_MISMATCH";
}

function normalizeLog(log: IV4EffectLog): IV4EffectLog {
  return {
    entries: log.entries.map((entry) => sortObjectKeys(entry) as IV4EffectLogEntry).sort(compareEntries),
    schema: log.schema,
    version: log.version,
  };
}

function compareEntries(left: IV4EffectLogEntry, right: IV4EffectLogEntry): number {
  return entryKey(left).localeCompare(entryKey(right));
}

function entryKey(entry: IV4EffectLogEntry): string {
  return [
    String(entry.frame).padStart(12, "0"),
    String(entry.tick).padStart(12, "0"),
    entry.schedule,
    entry.system,
    entry.kind,
    entry.command ?? "",
    entry.entity ?? "",
    entry.component ?? "",
    entry.event ?? "",
    entry.resource ?? "",
    entry.service ?? "",
    JSON.stringify(entry.payload ?? entry.value ?? null),
  ].join("\u0000");
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObjectKeys(value[key])]));
  }
  if (typeof value === "number") {
    return Number(value.toFixed(6));
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
