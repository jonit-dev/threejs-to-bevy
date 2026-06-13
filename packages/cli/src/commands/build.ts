import { resolve } from "node:path";
import { buildProject, CompilerError } from "@threenative/compiler";
import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

export async function buildCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectFlagIndex = normalizedArgv.indexOf("--project");
  const projectPath =
    projectFlagIndex === -1 ? cwd : resolve(cwd, normalizedArgv[projectFlagIndex + 1] ?? ".");

  try {
    const result = await buildProject(projectPath);
    const payload = {
      code: "TN_BUILD_OK",
      bundlePath: result.bundlePath,
      message: `Built game bundle at '${result.bundlePath}'.`,
    };

    return {
      exitCode: 0,
      stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
    };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code
        : "TN_BUILD_FAILED";
    const message = error instanceof Error ? error.message : String(error);
    const diagnostic = error instanceof CompilerError && error.diagnostic !== undefined ? { ...error.diagnostic } : { code, message };
    return diagnosticResult(diagnostic, { exitCode: 1, json, stderr: true });
  }
}
