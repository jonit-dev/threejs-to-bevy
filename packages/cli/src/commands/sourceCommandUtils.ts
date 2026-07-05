import { isAbsolute, resolve } from "node:path";

import { type IAuthoringOperationResult } from "@threenative/authoring";

import { type ICommandResult } from "../diagnostics.js";

export interface ISourceCommandOptions {
  cwd?: string;
}

export function renderAuthoringResult(group: string, result: IAuthoringOperationResult, json: boolean, successMessage: string): ICommandResult {
  const payload = {
    code: result.ok ? `TN_${group.toUpperCase()}_OK` : `TN_${group.toUpperCase()}_FAILED`,
    message: result.ok ? successMessage : `${group} operation failed.`,
    ...result,
  };
  if (json) {
    return { exitCode: result.ok ? 0 : 1, stdout: `${JSON.stringify(payload, null, 2)}\n` };
  }
  if (result.ok) {
    return { exitCode: 0, stdout: `${successMessage}\n` };
  }
  const diagnostics = result.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.file ?? ""}${diagnostic.path ?? ""}: ${diagnostic.message}`).join("\n");
  return { exitCode: 1, stderr: `${payload.message}\n${diagnostics}\n`, stdout: "" };
}

export function renderUsage(json: boolean, code: string, usage: string): ICommandResult {
  const payload = { code, message: usage, severity: "error" };
  return { exitCode: 2, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${usage}\n` };
}

export function normalizeArgv(argv: readonly string[]): readonly string[] {
  return argv[0] === "--" ? argv.slice(1) : argv;
}

export function resolveProjectPath(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): string {
  const project = readFlag(argv, "--project") ?? ".";
  return isAbsolute(project) ? project : resolve(cwd, project);
}

export function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export function readCsvFlag(argv: readonly string[], flag: string): string[] | undefined {
  return readFlag(argv, flag)?.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
}

export function readPositional(argv: readonly string[], index: number): string | undefined {
  const positionals = argv.filter((arg, argIndex) => {
    if (arg.startsWith("--")) {
      return false;
    }
    const previous = argv[argIndex - 1];
    return !flagsWithValues.has(previous ?? "");
  });
  return positionals[index];
}

export function parseJsonFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: unknown } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { diagnostic: "TN_AUTHORING_JSON_VALUE_INVALID" };
  }
}

export function parseJsonArrayFlag(argv: readonly string[], flag: string, diagnosticCode: string): { diagnostic?: string; value?: Record<string, unknown>[] } {
  const parsed = parseJsonFlag(argv, flag);
  if (parsed.diagnostic !== undefined || parsed.value === undefined) {
    return parsed as { diagnostic?: string; value?: Record<string, unknown>[] };
  }
  if (!Array.isArray(parsed.value) || !parsed.value.every(isRecord)) {
    return { diagnostic: diagnosticCode };
  }
  return { value: parsed.value };
}

export function parseJsonObjectFlag(argv: readonly string[], flag: string, diagnosticCode: string): { diagnostic?: string; value?: Record<string, unknown> } {
  const parsed = parseJsonFlag(argv, flag);
  if (parsed.diagnostic !== undefined || parsed.value === undefined) {
    return parsed as { diagnostic?: string; value?: Record<string, unknown> };
  }
  if (!isRecord(parsed.value)) {
    return { diagnostic: diagnosticCode };
  }
  return { value: parsed.value };
}

export function stringRecord(value: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export function parseJsonNumberArrayFlag(argv: readonly string[], flag: string, diagnosticCode: string): { diagnostic?: string; value?: number[] } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  if (!raw.trim().startsWith("[")) {
    const values = raw.split(",").map((entry) => Number(entry.trim()));
    return values.length > 0 && values.every((entry) => Number.isFinite(entry)) ? { value: values } : { diagnostic: diagnosticCode };
  }
  const parsed = parseJsonFlag(argv, flag);
  if (parsed.diagnostic !== undefined || parsed.value === undefined) {
    return parsed as { diagnostic?: string; value?: number[] };
  }
  if (!Array.isArray(parsed.value) || !parsed.value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    return { diagnostic: diagnosticCode };
  }
  return { value: parsed.value };
}

export function parseOptionalNumber(argv: readonly string[], flag: string): { diagnostic?: string; value?: number } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const value = Number(raw);
  return Number.isFinite(value) ? { value } : { diagnostic: "TN_AUTHORING_NUMBER_INVALID" };
}

export function parseNumberFlags(argv: readonly string[], flags: readonly string[]): { diagnostic?: string; values: Record<string, number | undefined> } {
  const values: Record<string, number | undefined> = {};
  for (const flag of flags) {
    const parsed = parseOptionalNumber(argv, flag);
    if (parsed.diagnostic !== undefined) {
      return { diagnostic: parsed.diagnostic, values };
    }
    values[flag] = parsed.value;
  }
  return { values };
}

export function parseOptionalBoolean(argv: readonly string[], flag: string): { diagnostic?: string; value?: boolean } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  if (raw !== "true" && raw !== "false") {
    return { diagnostic: "TN_AUTHORING_BOOLEAN_INVALID" };
  }
  return { value: raw === "true" };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const flagsWithValues = new Set([
  "--align",
  "--alpha-cutoff",
  "--alpha-mode",
  "--asset",
  "--authoring-version",
  "--action",
  "--antialias",
  "--background-color",
  "--base-color-texture",
  "--border-color",
  "--border-radius",
  "--border-width",
  "--bloom",
  "--bloom-intensity",
  "--bloom-threshold",
  "--budgets",
  "--clearcoat",
  "--clearcoat-roughness",
  "--clearcoat-roughness-texture",
  "--clearcoat-texture",
  "--clip",
  "--color",
  "--component",
  "--emissive",
  "--emissive-intensity",
  "--emissive-texture",
  "--export",
  "--file",
  "--height",
  "--height-mode",
  "--heightmap",
  "--id",
  "--keys",
  "--kind",
  "--label",
  "--lifetime",
  "--loop",
  "--max",
  "--metallic-roughness-texture",
  "--metalness",
  "--module",
  "--mode",
  "--negative-keys",
  "--normal-texture",
  "--occlusion-texture",
  "--opacity",
  "--positive-keys",
  "--props",
  "--project",
  "--rate",
  "--build-targets",
  "--resource",
  "--roughness",
  "--schedule",
  "--shape",
  "--size",
  "--render-look-bloom-intensity",
  "--render-look-contrast",
  "--render-look-environment-intensity",
  "--render-look-exposure",
  "--render-look-saturation",
  "--render-look-shadow-quality",
  "--render-path",
  "--render-profile",
  "--src",
  "--source-clip",
  "--source-roots",
  "--storage",
  "--type",
  "--text-align",
  "--text-decoration",
  "--text",
  "--top",
  "--title",
  "--targets",
  "--transmission",
  "--transmission-texture",
  "--value",
  "--width",
  "--wrap",
  "--justify",
  "--performance",
]);
