import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ScriptAliasResolution {
  canonical: string;
  deprecated: boolean;
  legacy: string;
  message?: string;
}

const SCRIPT_ALIASES: Record<string, string> = {
  "check:docs:v1": "check:docs",
  "check:docs:v2": "check:docs",
  "check:docs:v3": "check:docs",
  "check:docs:v4": "check:docs",
  "check:docs:v5": "check:docs",
  "check:docs:v6": "check:docs",
  "check:docs:v7": "check:docs",
  "check:docs:v8": "check:docs",
  "check:docs:v9": "check:docs",
  "check:quality:v9": "check:quality",
  "verify:v9": "verify:release",
};

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export const LEGACY_SCRIPT_COMMANDS: Record<string, readonly [string, ...string[]]> = {
  "check:docs:v1": ["node", "scripts/check-docs-v1.mjs"],
  "check:docs:v2": ["node", "scripts/check-docs-v2.mjs"],
  "check:docs:v3": ["node", "scripts/check-docs-v3.mjs"],
  "check:docs:v4": ["node", "scripts/check-docs-v4.mjs"],
  "check:docs:v5": ["node", "scripts/check-docs-v5.mjs"],
  "check:docs:v6": ["node", "scripts/check-docs-v6.mjs"],
  "check:docs:v7": ["node", "scripts/check-docs-v7.mjs"],
  "check:docs:v8": ["node", "scripts/check-docs-v8.mjs"],
  "check:quality:v9": ["node", "scripts/check-v9-quality-gates.mjs"],
  "verify:v7": ["node", "scripts/verify-v7.mjs"],
};

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

export function runLegacyScriptAlias(scriptName: string, forwardedArgs: readonly string[] = []): number {
  const resolution = resolveScriptAlias(scriptName);
  process.stderr.write(formatDeprecationDiagnostic(resolution));

  if (scriptName === "verify:v9") {
    const result = spawnSync("pnpm", ["verify:release", ...forwardedArgs], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "inherit",
    });
    return result.status ?? 1;
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
