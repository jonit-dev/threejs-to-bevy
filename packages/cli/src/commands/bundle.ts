import { importBundle, type IImportBundleResult } from "@threenative/authoring";
import { isAbsolute, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";

interface IBundleCommandOptions {
  cwd?: string;
}

export async function bundleCommand(argv: readonly string[], options: IBundleCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");

  if (subcommand !== "import") {
    return renderUsage(json, "TN_BUNDLE_SUBCOMMAND_UNKNOWN", bundleUsage());
  }

  const bundleDir = readPositional(normalizedArgv, 1);
  const mode = readFlag(normalizedArgv, "--mode") ?? "source";
  if (bundleDir === undefined || mode !== "source") {
    return renderUsage(json, "TN_BUNDLE_IMPORT_ARGS_INVALID", "Usage: tn bundle import <bundle-dir> --project <path> --mode source [--dry-run] [--json]");
  }

  const result = await importBundle({
    bundleDir,
    dryRun: normalizedArgv.includes("--dry-run"),
    mode,
    projectPath: resolveProjectPath(normalizedArgv, options.cwd),
  });

  return renderBundleImportResult(result, json);
}

function renderBundleImportResult(result: IImportBundleResult, json: boolean): ICommandResult {
  const message = result.ok
    ? result.dryRun
      ? "Bundle import dry-run completed."
      : "Bundle imported into structured source."
    : "Bundle was not imported into structured source.";
  const payload = {
    code: result.ok ? "TN_BUNDLE_IMPORT_OK" : "TN_BUNDLE_IMPORT_FAILED",
    message,
    ...result,
  };

  if (json) {
    return {
      exitCode: result.ok ? 0 : 1,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  if (result.ok) {
    const files = result.dryRun ? result.plannedWrites : result.filesWritten;
    return {
      exitCode: 0,
      stdout: `${message}\nFiles: ${files.length === 0 ? "(none)" : files.join(", ")}\n`,
    };
  }

  const diagnostics = result.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.file ?? ""}${diagnostic.path ?? ""}: ${diagnostic.message}`).join("\n");
  return {
    exitCode: 1,
    stderr: `${message}\n${diagnostics}\n`,
    stdout: "",
  };
}

function renderUsage(json: boolean, code: string, usage: string): ICommandResult {
  const payload = {
    code,
    message: usage,
    severity: "error",
  };
  return {
    exitCode: 2,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${usage}\n`,
  };
}

function resolveProjectPath(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): string {
  const project = readFlag(argv, "--project") ?? ".";
  return isAbsolute(project) ? project : resolve(cwd, project);
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function readPositional(argv: readonly string[], index: number): string | undefined {
  const positionals = argv.filter((arg, argIndex) => {
    if (arg.startsWith("--")) {
      return false;
    }
    const previous = argv[argIndex - 1];
    return !flagsWithValues.has(previous ?? "");
  });
  return positionals[index];
}

const flagsWithValues = new Set(["--project", "--mode"]);

function bundleUsage(): string {
  return "Usage: tn bundle import <bundle-dir> --project <path> --mode source [--dry-run] [--json]";
}
