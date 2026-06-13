import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateBundle } from "@threenative/compiler";

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
  const bundleFlagIndex = normalizedArgv.indexOf("--bundle");
  if (bundleFlagIndex !== -1) {
    return validateBundlePath(resolve(options.cwd ?? process.env.INIT_CWD ?? process.cwd(), normalizedArgv[bundleFlagIndex + 1] ?? "."), json);
  }

  const projectFlagIndex = normalizedArgv.indexOf("--project");
  const cwd = options.cwd ?? process.env.INIT_CWD ?? process.cwd();
  const projectPath = projectFlagIndex === -1 ? cwd : resolve(cwd, normalizedArgv[projectFlagIndex + 1] ?? ".");
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

  const bundlePath = resolve(projectPath, config.outDir ?? "dist/game.bundle");
  try {
    await access(resolve(bundlePath, "manifest.json"));
    return validateBundlePath(bundlePath, json);
  } catch {
    // Project scaffold validation still succeeds before the first build emits a bundle.
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

async function validateBundlePath(bundlePath: string, json: boolean): Promise<ICommandResult> {
  const report = await validateBundle(bundlePath);
  const payload = {
    code: report.ok ? "TN_VALIDATE_OK" : "TN_VALIDATE_FAILED",
    diagnostics: report.diagnostics,
    message: report.ok ? "Bundle validation passed." : `Bundle validation failed with ${report.diagnostics.length} error(s).`,
    path: bundlePath,
  };

  if (json) {
    return {
      exitCode: report.ok ? 0 : 1,
      stdout: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  if (report.ok) {
    return {
      exitCode: 0,
      stdout: `${payload.message}\n`,
    };
  }

  return {
    exitCode: 1,
    stderr: `${payload.message}\n${report.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`).join("\n")}\n`,
    stdout: "",
  };
}
