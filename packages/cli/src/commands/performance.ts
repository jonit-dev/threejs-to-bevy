import { type ICommandResult } from "../diagnostics.js";
import { performanceProofCommand } from "./performanceProof.js";
import { performanceTraceCommand } from "./performanceTrace.js";

export async function performanceCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  return normalizedArgv[0] === "trace"
    ? performanceTraceCommand(normalizedArgv)
    : performanceProofCommand(normalizedArgv);
}
