import { resolve } from "node:path";

import { generateProjectTypes } from "@threenative/compiler";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

export async function typesCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  if (subcommand !== "generate") {
    return diagnosticResult(
      {
        code: "TN_TYPES_COMMAND_UNSUPPORTED",
        message: "Usage: tn types generate [--project <path>] [--out <path>] [--json]",
      },
      { exitCode: 1, json, stderr: true },
    );
  }

  const projectFlagIndex = normalizedArgv.indexOf("--project");
  const outFlagIndex = normalizedArgv.indexOf("--out");
  const projectPath = projectFlagIndex === -1 ? cwd : resolve(cwd, normalizedArgv[projectFlagIndex + 1] ?? ".");
  const outDir = outFlagIndex === -1 ? undefined : normalizedArgv[outFlagIndex + 1];

  try {
    const result = await generateProjectTypes({ outDir, projectPath });
    const payload = {
      code: "TN_TYPES_GENERATED",
      files: result.files,
      message: `Generated project script types at '${result.files.join(", ")}'.`,
      projectPath: result.projectPath,
    };
    return {
      exitCode: 0,
      stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
    };
  } catch (error) {
    return diagnosticResult(
      {
        code: "TN_TYPES_GENERATE_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
      { exitCode: 1, json, stderr: true },
    );
  }
}
