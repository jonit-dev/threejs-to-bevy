import { isAbsolute, resolve } from "node:path";
import { realpathSync } from "node:fs";

export function resolveProjectPath(argv: readonly string[]): string {
  const explicitProject = readFlag(argv, "--project");
  const project = explicitProject ?? ".";
  const cwd = explicitProject === undefined ? process.env.INIT_CWD ?? process.cwd() : process.cwd();
  const resolved = isAbsolute(project) ? resolve(project) : resolve(cwd, project);
  try {
    return realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

export function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.lastIndexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(hasNonEmptyString);
}

export function isPlayerLikeEntityId(id: string): boolean {
  const lower = id.toLowerCase();
  if (lower.includes("camera")) {
    return false;
  }
  return lower.includes("player") || lower.includes("runner") || lower.includes("hero") || lower.includes("avatar") || lower.includes("boat") || lower.includes("car");
}
