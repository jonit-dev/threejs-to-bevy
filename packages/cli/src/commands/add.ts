import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { formatMechanicBlockUsage, getMechanicBlock, listMechanicBlocks } from "../mechanicBlocks/registry.js";
import { normalizeArgv, readPositional, resolveProjectPath } from "./sourceCommandUtils.js";

export async function addCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const json = normalizedArgv.includes("--json");
  const blockId = readPositional(normalizedArgv, 0);
  if (blockId === undefined || blockId === "--help" || blockId === "-h") {
    const payload = {
      blocks: listMechanicBlocks().map((block) => ({ id: block.id, summary: block.summary })),
      code: "TN_ADD_USAGE",
      message: `Usage: tn add <${formatMechanicBlockUsage()}> [block flags] [--project <path>] [--json]`,
    };
    return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
  }
  const block = getMechanicBlock(blockId);
  if (block === undefined) {
    return diagnosticResult(
      {
        block: blockId,
        code: "TN_ADD_BLOCK_UNKNOWN",
        message: `Unknown mechanic block '${blockId}'. Supported blocks: ${formatMechanicBlockUsage()}.`,
      },
      { exitCode: 1, json, stderr: !json },
    );
  }
  const result = await block.write({
    args: normalizedArgv.slice(1),
    projectPath: resolveProjectPath(normalizedArgv),
  });
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(result, null, 2)}\n` : `${result.message}\nProof: ${result.proofCommand}\n`,
  };
}
