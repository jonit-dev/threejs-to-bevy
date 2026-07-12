import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { removeMechanicBlock } from "../mechanicBlocks/registry.js";
import { normalizeArgv, readPositional, resolveProjectPath } from "./sourceCommandUtils.js";

export async function removeCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const json = normalizedArgv.includes("--json");
  const blockId = readPositional(normalizedArgv, 0);
  if (blockId === undefined) {
    return diagnosticResult(
      { code: "TN_REMOVE_BLOCK_ID_MISSING", message: "Usage: tn remove <block> [--project <path>] [--json]" },
      { exitCode: 2, json, stderr: !json },
    );
  }
  const result = await removeMechanicBlock(resolveProjectPath(normalizedArgv), blockId);
  if (!result.ok) {
    return diagnosticResult(
      { block: blockId, code: result.code, message: result.message },
      { exitCode: 1, json, stderr: !json },
    );
  }
  return { exitCode: 0, stdout: json ? `${JSON.stringify(result, null, 2)}\n` : `${result.message}\nRemoved: ${result.filesRemoved.join(", ")}\n` };
}
