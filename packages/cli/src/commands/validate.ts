import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

interface IProjectConfig {
  entry?: string;
  outDir?: string;
  schema?: string;
  version?: string;
}

interface IValidateOptions {
  cwd?: string;
}

export async function validateProject(argv: readonly string[], options: IValidateOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectFlagIndex = normalizedArgv.indexOf("--project");
  const projectPath =
    projectFlagIndex === -1 ? (options.cwd ?? process.cwd()) : resolve(options.cwd ?? process.cwd(), normalizedArgv[projectFlagIndex + 1] ?? ".");
  const configPath = resolve(projectPath, "threenative.config.json");

  let config: IProjectConfig;
  try {
    config = JSON.parse(await readFile(configPath, "utf8")) as IProjectConfig;
  } catch {
    return diagnosticResult(
      {
        code: "TN_VALIDATE_CONFIG_MISSING",
        message: `Missing or invalid project config at '${configPath}'.`,
        path: configPath,
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  if (config.schema !== "threenative.project" || config.version !== "0.1.0" || config.entry === undefined) {
    return diagnosticResult(
      {
        code: "TN_VALIDATE_CONFIG_UNSUPPORTED",
        message: "Project config must use schema 'threenative.project', version '0.1.0', and an entry file.",
        path: configPath,
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  const entryPath = resolve(projectPath, config.entry);
  try {
    await access(entryPath);
  } catch {
    return diagnosticResult(
      {
        code: "TN_VALIDATE_ENTRY_MISSING",
        message: `Configured entry '${config.entry}' was not found.`,
        path: entryPath,
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  const payload = {
    code: "TN_VALIDATE_OK",
    entry: config.entry,
    message: "Project scaffold validation passed. Full IR validation is added in a later V1 ticket.",
    outDir: config.outDir ?? "dist/game.bundle",
    path: projectPath,
  };

  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
}
