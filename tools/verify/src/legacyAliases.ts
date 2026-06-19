import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FOCUSED_GATES, runFocusedGate } from "./cli/run.js";

export interface ScriptAliasResolution {
  canonical: string;
  deprecated: boolean;
  legacy: string;
  message?: string;
}

export const SCRIPT_ALIASES: Record<string, string> = {
  "check:docs:v1": "check:docs",
  "check:docs:v2": "check:docs",
  "check:docs:v3": "check:docs",
  "check:docs:v4": "check:docs",
  "check:docs:v5": "check:docs",
  "check:docs:v6": "check:docs",
  "check:docs:v7": "check:docs",
  "check:docs:v8": "check:docs",
  "check:docs:v9": "check:docs",
  "check:quality:v9": "check:quality:v9",
  "verify:v2": "verify:release",
  "verify:v3": "verify:release",
  "verify:v4": "verify:release",
  "verify:v5": "verify:release",
  "verify:v6": "verify:release",
  "verify:v7": "verify:release",
  "verify:v9": "verify:release",
  "verify:v10": "verify:release",
};

export const LEGACY_SCRIPT_COMMANDS: Record<string, readonly [string, ...string[]]> = {};

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export function resolveScriptAlias(scriptName: string): ScriptAliasResolution {
  const canonical = SCRIPT_ALIASES[scriptName] ?? scriptName;
  if (canonical === scriptName) {
    return { canonical, deprecated: false, legacy: scriptName };
  }
  return {
    canonical,
    deprecated: true,
    legacy: scriptName,
    message: `'${scriptName}' is a legacy milestone alias. Use 'pnpm ${canonical}' instead.`,
  };
}

export function formatDeprecationDiagnostic(resolution: ScriptAliasResolution): string {
  if (!resolution.deprecated || !resolution.message) {
    return "";
  }
  return `TN_SCRIPT_ALIAS_DEPRECATED: ${resolution.message}\n`;
}

export function listDeprecatedScriptAliases(): ScriptAliasResolution[] {
  return Object.keys(SCRIPT_ALIASES).map((legacy) => resolveScriptAlias(legacy)).filter((entry) => entry.deprecated);
}

export function isRegisteredGate(scriptName: string): boolean {
  return FOCUSED_GATES[scriptName] !== undefined || LEGACY_SCRIPT_COMMANDS[scriptName] !== undefined;
}

export function runLegacyScriptAlias(scriptName: string, forwardedArgs: readonly string[] = []): number {
  const resolution = resolveScriptAlias(scriptName);
  process.stderr.write(formatDeprecationDiagnostic(resolution));

  if (FOCUSED_GATES[scriptName]) {
    return runFocusedGate(scriptName, { forwardedArgs });
  }

  const legacyCommand = LEGACY_SCRIPT_COMMANDS[scriptName];
  if (legacyCommand) {
    const command = legacyCommand[0];
    const scriptPath = legacyCommand[1];
    const rest = legacyCommand.slice(2);
    if (!command || !scriptPath) {
      return 1;
    }
    const result = spawnSync(command, [resolve(repoRoot, scriptPath), ...rest, ...forwardedArgs], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "inherit",
    });
    return result.status ?? 1;
  }

  const result = spawnSync("pnpm", [resolution.canonical, ...forwardedArgs], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  return result.status ?? 1;
}
