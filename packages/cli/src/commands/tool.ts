import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { createExternalToolManager, ExternalToolError, type ExternalToolManager } from "../externalTools/manager.js";

export async function toolCommand(argv: readonly string[], manager: ExternalToolManager = createExternalToolManager()): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const positionals = normalizedArgv.filter((arg) => !arg.startsWith("--"));
  const [subcommand, toolId] = positionals;
  if ((subcommand !== "status" && subcommand !== "install" && subcommand !== "remove") || toolId === undefined) {
    return diagnosticResult(
      {
        code: "TN_TOOL_USAGE",
        message: "Usage: tn tool status|install|remove blender [--accept-download] [--json]",
      },
      { exitCode: 2, json, stderr: true },
    );
  }

  try {
    if (subcommand === "status") {
      const status = await manager.status(toolId);
      const message = status.ready
        ? `${status.id} ${status.version} is ready at '${status.executablePath}' (${status.source}).`
        : `${status.id} ${status.version} is not installed. Run 'tn tool install ${status.id} --accept-download'.`;
      return render({
        ...status,
        ...(status.ready ? {} : { fix: { instruction: `Run 'tn tool install ${status.id} --accept-download --json'.` } }),
        message,
      }, json, status.ready ? 0 : 1);
    }
    if (subcommand === "install") {
      const result = await manager.install(toolId, { acceptDownload: normalizedArgv.includes("--accept-download") });
      return render({ ...result, code: "TN_EXTERNAL_TOOL_INSTALLED", message: result.reused ? `${result.id} ${result.version} is already ready at '${result.executablePath}'.` : `Installed ${result.id} ${result.version} at '${result.executablePath}'.` }, json, 0);
    }
    const result = await manager.remove(toolId);
    return render({ ...result, message: result.removed ? `Removed ${result.id} ${result.version} from '${result.cachePath}'.` : `${result.id} ${result.version} was not installed in the managed cache.` }, json, 0);
  } catch (error) {
    if (error instanceof ExternalToolError) {
      return diagnosticResult(
        {
          code: error.code,
          ...error.details,
          fix: installFix(error.code, toolId),
          message: error.message,
        },
        { exitCode: 1, json, stderr: true },
      );
    }
    throw error;
  }
}

function installFix(code: ExternalToolError["code"], toolId: string): { instruction: string } | undefined {
  if (code === "TN_EXTERNAL_TOOL_MISSING" || code === "TN_EXTERNAL_TOOL_ACKNOWLEDGEMENT_MISSING") {
    return { instruction: `Run 'tn tool install ${toolId} --accept-download --json'.` };
  }
  if (code === "TN_EXTERNAL_TOOL_REMOVAL_FAILED") {
    return { instruction: "Unset THREENATIVE_BLENDER_PATH before removing the managed cache entry; system executables are never removed." };
  }
  return undefined;
}

function render(payload: unknown, json: boolean, exitCode: number): ICommandResult {
  const value = payload as { message?: string };
  return { exitCode, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${value.message ?? JSON.stringify(payload)}\n` };
}
