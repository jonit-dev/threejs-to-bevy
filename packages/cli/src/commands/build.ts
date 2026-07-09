import { resolve } from "node:path";
import { buildProject, CompilerError, generateProjectTypes } from "@threenative/compiler";
import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

const ITERATE_NOTICE = "Standalone build is subsumed by tn iterate --project . --json for the normal agent verify loop.";
const ITERATE_NEXT = "tn iterate --project . --json";

export async function buildCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectFlagIndex = normalizedArgv.indexOf("--project");
  const projectPath =
    projectFlagIndex === -1 ? cwd : resolve(cwd, normalizedArgv[projectFlagIndex + 1] ?? ".");

  try {
    await generateProjectTypes({ projectPath });
    const result = await buildProject(projectPath);
    const payload = {
      code: "TN_BUILD_OK",
      bundlePath: result.bundlePath,
      message: `Built game bundle at '${result.bundlePath}'.`,
      next: ITERATE_NEXT,
      notice: ITERATE_NOTICE,
    };

    return {
      exitCode: 0,
      stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\nNext: ${payload.next}\nNotice: ${payload.notice}\n`,
    };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code
        : "TN_BUILD_FAILED";
    const message = error instanceof Error ? error.message : String(error);
    const diagnostic = error instanceof CompilerError && error.diagnostic !== undefined ? { ...error.diagnostic } : { code, message };
    const payload = { ...diagnostic, next: ITERATE_NEXT, notice: ITERATE_NOTICE };
    return diagnosticResult(payload, { exitCode: 1, json, stderr: true });
  }
}
