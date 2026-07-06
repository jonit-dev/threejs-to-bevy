import type { IrSystemSchedule } from "@threenative/ir";

export type SystemEffectKind = "command" | "event" | "patch" | "resource" | "service";

export interface ISystemEffectLogEntry {
  command?: string;
  component?: string;
  entity?: string;
  event?: string;
  frame: number;
  kind: SystemEffectKind;
  payload?: unknown;
  resource?: string;
  schedule: IrSystemSchedule;
  service?: string;
  system: string;
  tick: number;
  value?: unknown;
}

export interface ISystemEffectLog {
  entries: ISystemEffectLogEntry[];
  schema: "threenative.web-system-effects";
  version: 1;
}

const maxEffectLogEntries = 2000;

export function createSystemEffectLog(): ISystemEffectLog {
  return { entries: [], schema: "threenative.web-system-effects", version: 1 };
}

export function appendSystemEffectLog(log: ISystemEffectLog, entries: ReadonlyArray<ISystemEffectLogEntry>): void {
  log.entries.push(...entries);
  if (log.entries.length > maxEffectLogEntries) {
    log.entries.splice(0, log.entries.length - maxEffectLogEntries);
  }
}

export function stableSystemEffectLog(log: ISystemEffectLog): ISystemEffectLog {
  return {
    entries: [...log.entries].map((entry) => normalizeEntry(entry)).sort(compareEntries),
    schema: log.schema,
    version: log.version,
  };
}

export function serializeSystemEffectLog(log: ISystemEffectLog): string {
  return `${JSON.stringify(stableSystemEffectLog(log), null, 2)}\n`;
}

function compareEntries(left: ISystemEffectLogEntry, right: ISystemEffectLogEntry): number {
  return entryKey(left).localeCompare(entryKey(right));
}

function entryKey(entry: ISystemEffectLogEntry): string {
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

function normalizeEntry(entry: ISystemEffectLogEntry): ISystemEffectLogEntry {
  return sortObjectKeys(entry) as ISystemEffectLogEntry;
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
